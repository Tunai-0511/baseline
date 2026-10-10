"""Train a small AlexNet-like CNN on CIFAR-10 so its conv1 learns real filters for the chorus1 filter wall.

conv1 = 96 filters of 11 x 11 x 3 (as in Krizhevsky et al. 2012), and conv2/conv4/conv5 are split into two groups
like the original two-GPU net: conv1 filters 0-47 only feed group 1, 48-95 only group 2. In the original that split
makes one group colour-agnostic (edges) and the other colour-specific (blobs); we keep the same wiring so the
48/48 wall in tower.ts is truthful.

CIFAR images are 32 x 32: every batch is resampled on the device to 64 x 64 with a random affine (magnification
1.3-2.0x, shift, flip) through grid_sample (bilinear), so an 11 x 11 filter at stride 2 sees 5.5-8.5 source pixels
and learns oriented edges / stripes at a few scales. (Run B, 1.6-2.4x: smoother, fewer multi-stripe filters, 89.1%.)
Two things make the filters clean: conv1 starts near zero (BN follows it), and conv1 gets a 10x weight decay.

  tools/.venv/bin/python tools/conv1/train.py --epochs 30           # -> tools/data/conv1/{last.pt, log.json}
                                                                       #    out/wip/conv1/epoch_XX.png (filter grid)
  tools/.venv/bin/python tools/conv1/export.py --desat 0.35         # -> app/public/filters/conv1.{png,json}
~85 s/epoch on an M5 (MPS). Data: tools/data/cifar10_{train,test}.npz (uint8 N x 32 x 32 x 3 + labels), converted
from the CIFAR-10 parquet mirror (huggingface.co/datasets/uoft-cs/cifar10) with pyarrow + Pillow.
"""
import argparse, json, math, os, time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'tools', 'data')
MEAN = torch.tensor([0.4914, 0.4822, 0.4465]).view(1, 3, 1, 1)
STD = 0.25  # one std for all channels so the weights stay in plain RGB space (colours in the figure are faithful)


class Net(nn.Module):
    def __init__(self, stride=2, init_std=2e-3):
        super().__init__()
        def blk(cin, cout, k, s=1, g=1):
            return nn.Sequential(nn.Conv2d(cin, cout, k, s, k // 2, groups=g, bias=False), nn.BatchNorm2d(cout), nn.ReLU(inplace=True))
        self.conv1 = nn.Conv2d(3, 96, 11, stride, 5, bias=False)
        # near-zero init: BN after conv1 makes its scale irrelevant to the forward pass, and the data-driven
        # structure then dominates the filters instead of the (never decaying) random init pattern
        nn.init.normal_(self.conv1.weight, 0.0, init_std)
        self.bn1 = nn.BatchNorm2d(96)
        self.body = nn.Sequential(
            nn.MaxPool2d(3, 2, 1),
            blk(96, 256, 5, g=2), nn.MaxPool2d(3, 2, 1),
            blk(256, 384, 3), blk(384, 384, 3, g=2), blk(384, 256, 3, g=2), nn.MaxPool2d(3, 2, 1),
            nn.Flatten(), nn.Dropout(0.5), nn.Linear(256 * 4 * 4, 1024), nn.ReLU(inplace=True), nn.Dropout(0.5), nn.Linear(1024, 10),
        )

    def forward(self, x):
        return self.body(Fn.relu(self.bn1(self.conv1(x))))


def augment(xb, size, train, mag=(1.3, 2.0)):
    """uint8 N x 3 x 32 x 32 on device -> float N x 3 x size x size, normalised; random affine when training
    (magnification mag[0]..mag[1] source px -> output px; a window wider than the image is filled by reflection)."""
    x = xb.float() / 255.0
    n = x.shape[0]
    if train:
        base = size / 32.0
        z = torch.empty(n, device=x.device).uniform_(mag[0] / base, mag[1] / base)  # zoom relative to the plain upsample
        flip = torch.where(torch.rand(n, device=x.device) < 0.5, -1.0, 1.0)
        tx = torch.empty(n, device=x.device).uniform_(-0.18, 0.18)
        ty = torch.empty(n, device=x.device).uniform_(-0.18, 0.18)
        th = torch.zeros(n, 2, 3, device=x.device)
        th[:, 0, 0] = flip / z
        th[:, 1, 1] = 1.0 / z
        th[:, 0, 2] = tx
        th[:, 1, 2] = ty
        grid = Fn.affine_grid(th, (n, 3, size, size), align_corners=False)
        x = Fn.grid_sample(x, grid, mode='bilinear', padding_mode='reflection', align_corners=False)
        # mild brightness/contrast jitter (no hue jitter: keep colour a usable cue)
        b = torch.empty(n, 1, 1, 1, device=x.device).uniform_(-0.08, 0.08)
        c = torch.empty(n, 1, 1, 1, device=x.device).uniform_(0.85, 1.15)
        m = x.mean(dim=(1, 2, 3), keepdim=True)
        x = ((x - m) * c + m + b).clamp(0, 1)
    else:
        x = Fn.interpolate(x, size=(size, size), mode='bilinear', align_corners=False)
    return (x - MEAN.to(x.device)) / STD


def filter_grid(w, path, scale=8):
    """96 x 3 x 11 x 11 -> 12 x 8 sheet, each filter min-max normalised over all three channels."""
    w = w.detach().float().cpu().numpy()
    k = w.shape[-1]
    pitch = k + 2
    img = np.full((8 * pitch, 12 * pitch, 3), 11, np.uint8)
    for i in range(96):
        f = w[i].transpose(1, 2, 0)
        f = (f - f.min()) / max(1e-8, f.max() - f.min())
        r, c = divmod(i, 12)
        img[r * pitch + 1:r * pitch + 1 + k, c * pitch + 1:c * pitch + 1 + k] = (f * 255 + 0.5).astype(np.uint8)
    Image.fromarray(img).resize((img.shape[1] * scale, img.shape[0] * scale), Image.NEAREST).save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=40)
    ap.add_argument('--bs', type=int, default=128)
    ap.add_argument('--lr', type=float, default=0.05)
    ap.add_argument('--wd', type=float, default=5e-4)
    ap.add_argument('--wd1', type=float, default=5e-3, help='weight decay of conv1')
    ap.add_argument('--size', type=int, default=64)
    ap.add_argument('--stride', type=int, default=2)
    ap.add_argument('--mag-min', dest='mag_min', type=float, default=1.3)
    ap.add_argument('--mag-max', dest='mag_max', type=float, default=2.0)
    ap.add_argument('--seed', type=int, default=2012)
    ap.add_argument('--init-std', dest='init_std', type=float, default=2e-3)
    ap.add_argument('--tag', default='conv1')
    args = ap.parse_args()
    torch.manual_seed(args.seed)
    dev = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    tr = np.load(os.path.join(DATA, 'cifar10_train.npz'))
    te = np.load(os.path.join(DATA, 'cifar10_test.npz'))
    Xtr = torch.from_numpy(tr['x']).permute(0, 3, 1, 2).contiguous().to(dev)
    Ytr = torch.from_numpy(tr['y']).to(dev)
    Xte = torch.from_numpy(te['x']).permute(0, 3, 1, 2).contiguous().to(dev)
    Yte = torch.from_numpy(te['y']).to(dev)
    net = Net(args.stride, args.init_std).to(dev)
    # weight decay on conv/linear weights only (not BN)
    # conv1 gets a stronger decay: behind BN its scale is free, so decay only sets how fast its direction keeps moving
    # (equilibrium after ~1/(2 lr wd) steps) and steadily removes the components the data never reinforces
    c1 = [net.conv1.weight]
    decay = [p for n, p in net.named_parameters() if p.ndim > 1 and n != 'conv1.weight']
    no = [p for n, p in net.named_parameters() if p.ndim <= 1]
    opt = torch.optim.SGD([{'params': c1, 'weight_decay': args.wd1}, {'params': decay, 'weight_decay': args.wd}, {'params': no, 'weight_decay': 0}],
                          lr=args.lr, momentum=0.9, nesterov=True)
    steps = args.epochs * math.ceil(len(Xtr) / args.bs)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=args.lr, total_steps=steps, pct_start=0.15, div_factor=10, final_div_factor=200)
    out_dir = os.path.join(DATA, args.tag)
    grid_dir = os.path.join(ROOT, 'out', 'wip', args.tag)
    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(grid_dir, exist_ok=True)
    filter_grid(net.conv1.weight, os.path.join(grid_dir, 'epoch_00.png'))
    log = []
    g = torch.Generator(device='cpu').manual_seed(args.seed)

    def evaluate():
        net.eval()
        correct = 0
        with torch.no_grad():
            for i in range(0, len(Xte), 500):
                x = augment(Xte[i:i + 500], args.size, False)
                # flip TTA off: plain single-view accuracy is what we report
                correct += (net(x).argmax(1) == Yte[i:i + 500]).sum().item()
        return correct / len(Xte)

    for ep in range(1, args.epochs + 1):
        net.train()
        t0 = time.time()
        perm = torch.randperm(len(Xtr), generator=g).to(dev)
        tl, tc, nb = 0.0, 0, 0
        for i in range(0, len(Xtr) - args.bs + 1, args.bs):
            idx = perm[i:i + args.bs]
            x = augment(Xtr[idx], args.size, True, (args.mag_min, args.mag_max))
            y = Ytr[idx]
            out = net(x)
            loss = Fn.cross_entropy(out, y, label_smoothing=0.1)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            if sched.last_epoch < steps - 1:
                sched.step()
            tl += loss.item() if nb % 50 == 0 else 0.0
            nb += 1
        acc = evaluate()
        dt = time.time() - t0
        log.append({'epoch': ep, 'test_acc': acc, 'lr': opt.param_groups[0]['lr'], 'sec': round(dt, 1)})
        print(f'epoch {ep:3d}  test {acc * 100:.2f}%  lr {opt.param_groups[0]["lr"]:.4f}  {dt:.1f}s', flush=True)
        filter_grid(net.conv1.weight, os.path.join(grid_dir, f'epoch_{ep:02d}.png'))
        torch.save({'state': net.state_dict(), 'args': vars(args), 'epoch': ep, 'test_acc': acc}, os.path.join(out_dir, 'last.pt'))
        with open(os.path.join(out_dir, 'log.json'), 'w') as f:
            json.dump({'args': vars(args), 'log': log}, f, indent=1)


if __name__ == '__main__':
    main()
