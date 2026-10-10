"""conv1 weight sequence over training: the 96 filters going from noise to learned edges / colour blobs.

Re-runs tools/conv1/train.py's exact recipe (the run behind app/public/filters/conv1.json, args read from
tools/data/conv1/log.json: 30 epochs, seed 2012, mag 1.3-2.0, conv1 wd 5e-3 ...) with the same RNG consumption
order, and snapshots conv1.weight at a log-spaced schedule inside epoch 1 plus the end of every epoch. Evaluating
the test set between steps uses no RNG (eval mode), so the training trajectory is the one train.py would take.

  tools/.venv/bin/python tools/data/conv1_seq.py train     # ~45 min on MPS -> tools/data/conv1_seq/{snaps.npz,last.pt,log.json}
  tools/.venv/bin/python tools/data/conv1_seq.py export    # -> app/public/data/conv1_seq.{json,png}
  tools/.venv/bin/python tools/data/conv1_seq.py fallback  # init + tools/data/conv1/last.pt only (2 frames) if no run

Consumers: verse1 S3 28.20-28.60 (CONVOLUTION pin-art melts into 96 noise filters that evolve into the real conv1;
pin height = weight), chorus1 58.52-59.5 (DEPTH's 96 pin heads flip from noise to learned filters in 16th-note waves).
"""
from __future__ import annotations

import importlib.util
import json
import math
import sys
import time

import numpy as np

from _common import PUB, ROOT, TDATA, WIP, b64, save_json

OUT = TDATA / 'conv1_seq'
REF = TDATA / 'conv1'                 # the run the film's conv1.png / conv1.json came from
# optimizer steps (batches) at which conv1 is snapshotted inside epoch 1; epoch ends are added (390 steps / epoch)
EARLY = [0, 1, 2, 3, 5, 8, 12, 18, 27, 40, 60, 90, 135, 200, 300]


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def train():
    import torch
    import torch.nn.functional as Fn
    T = _load(ROOT / 'tools' / 'conv1' / 'train.py', 'conv1_train')
    a = json.load(open(REF / 'log.json'))['args']
    print('recipe', a, flush=True)
    torch.manual_seed(a['seed'])
    dev = torch.device('mps' if torch.backends.mps.is_available() else 'cpu')
    tr = np.load(TDATA / 'cifar10_train.npz')
    te = np.load(TDATA / 'cifar10_test.npz')
    Xtr = torch.from_numpy(tr['x']).permute(0, 3, 1, 2).contiguous().to(dev)
    Ytr = torch.from_numpy(tr['y']).to(dev)
    Xte = torch.from_numpy(te['x']).permute(0, 3, 1, 2).contiguous().to(dev)
    Yte = torch.from_numpy(te['y']).to(dev)
    net = T.Net(a['stride'], a['init_std']).to(dev)
    c1 = [net.conv1.weight]
    decay = [p for n, p in net.named_parameters() if p.ndim > 1 and n != 'conv1.weight']
    no = [p for n, p in net.named_parameters() if p.ndim <= 1]
    opt = torch.optim.SGD([{'params': c1, 'weight_decay': a['wd1']}, {'params': decay, 'weight_decay': a['wd']},
                           {'params': no, 'weight_decay': 0}], lr=a['lr'], momentum=0.9, nesterov=True)
    steps = a['epochs'] * math.ceil(len(Xtr) / a['bs'])      # train.py's schedule length (391 / epoch)
    bpe = len(range(0, len(Xtr) - a['bs'] + 1, a['bs']))      # batches actually run per epoch (390)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=a['lr'], total_steps=steps, pct_start=0.15, div_factor=10,
                                                final_div_factor=200)
    g = torch.Generator(device='cpu').manual_seed(a['seed'])

    def evaluate():
        net.eval()
        correct = 0
        with torch.no_grad():
            for i in range(0, len(Xte), 500):
                x = T.augment(Xte[i:i + 500], a['size'], False)
                correct += (net(x).argmax(1) == Yte[i:i + 500]).sum().item()
        return correct / len(Xte)

    snaps, meta = [], []

    def snap(step, ep, acc):
        snaps.append(net.conv1.weight.detach().float().cpu().numpy().copy())
        meta.append({'step': step, 'epoch': round(step / bpe, 4), 'test_acc': acc})
        print(f'  snap step {step:5d}  epoch {step / bpe:6.3f}  acc {acc:.4f}', flush=True)

    snap(0, 0, evaluate())
    log = []
    step = 0
    for ep in range(1, a['epochs'] + 1):
        net.train()
        t0 = time.time()
        perm = torch.randperm(len(Xtr), generator=g).to(dev)
        for i in range(0, len(Xtr) - a['bs'] + 1, a['bs']):
            idx = perm[i:i + a['bs']]
            x = T.augment(Xtr[idx], a['size'], True, (a['mag_min'], a['mag_max']))
            y = Ytr[idx]
            out = net(x)
            loss = Fn.cross_entropy(out, y, label_smoothing=0.1)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            if sched.last_epoch < steps - 1:
                sched.step()
            step += 1
            if ep == 1 and step in EARLY:
                snap(step, ep, evaluate())
                net.train()
        acc = evaluate()
        dt = time.time() - t0
        log.append({'epoch': ep, 'test_acc': acc, 'lr': opt.param_groups[0]['lr'], 'sec': round(dt, 1)})
        print(f'epoch {ep:3d}  test {acc * 100:.2f}%  {dt:.1f}s', flush=True)
        snap(step, ep, acc)
        OUT.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(OUT / 'snaps.npz', w=np.stack(snaps), step=np.array([m['step'] for m in meta]),
                            acc=np.array([m['test_acc'] for m in meta]))
        json.dump({'args': a, 'log': log, 'snaps': meta, 'steps_per_epoch': bpe}, open(OUT / 'log.json', 'w'), indent=1)
    torch.save({'state': net.state_dict(), 'args': a, 'epoch': a['epochs'], 'test_acc': acc}, OUT / 'last.pt')
    ref = torch.load(REF / 'last.pt', map_location='cpu')['state']['conv1.weight'].float().numpy()
    d = np.abs(snaps[-1] - ref).max()
    print(f'max |conv1 - reference conv1/last.pt| = {d:.3g}', flush=True)


def fallback():
    """Two frames: the documented init distribution N(0, init_std) with the run's seed, and the reference last.pt."""
    import torch
    T = _load(ROOT / 'tools' / 'conv1' / 'train.py', 'conv1_train')
    ck = torch.load(REF / 'last.pt', map_location='cpu')
    a = ck['args']
    torch.manual_seed(a['seed'])
    net = T.Net(a['stride'], a['init_std'])
    w0 = net.conv1.weight.detach().numpy()
    w1 = ck['state']['conv1.weight'].float().numpy()
    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / 'snaps.npz', w=np.stack([w0, w1]), step=np.array([0, -1]), acc=np.array([0.1, ck['test_acc']]))
    json.dump({'args': a, 'log': [], 'snaps': [{'step': 0, 'epoch': 0, 'test_acc': None},
                                               {'step': -1, 'epoch': a['epochs'], 'test_acc': ck['test_acc']}],
               'fallback': True}, open(OUT / 'log.json', 'w'), indent=1)


def export():
    import torch
    from PIL import Image
    E = _load(ROOT / 'tools' / 'conv1' / 'export.py', 'conv1_export')
    z = np.load(OUT / 'snaps.npz')
    W = z['w'].astype(np.float64)                     # F x 96 x 3 x 11 x 11
    lg = json.load(open(OUT / 'log.json'))
    F = W.shape[0]
    last = W[-1].transpose(0, 2, 3, 1)                # 96 x 11 x 11 x 3
    D = [E.describe(last[i]) for i in range(96)]
    by_cf = sorted(range(96), key=lambda i: D[i]['cf'])
    order = E.order_grey(by_cf[:48], D) + E.order_colour(by_cf[48:], D)
    # reference order (the film's conv1.png) for comparison
    ref_order = json.load(open(ROOT / 'app' / 'public' / 'filters' / 'conv1.json'))['order']
    ref = torch.load(REF / 'last.pt', map_location='cpu')['state']['conv1.weight'].float().numpy()
    same_as_ref = float(np.abs(W[-1] - ref).max())

    # per frame, per cell: min-max over the filter's 3 channels (like conv1.png) -> uint8; lo/hi keep the true scale
    u8 = np.zeros((F, 96, 11, 11, 3), np.uint8)
    lo = np.zeros((F, 96))
    hi = np.zeros((F, 96))
    for f in range(F):
        for c, i in enumerate(order):
            x = W[f, i].transpose(1, 2, 0)
            a, b = x.min(), x.max()
            lo[f, c], hi[f, c] = a, b
            u8[f, c] = np.clip(np.round((x - a) / max(b - a, 1e-20) * 255), 0, 255)
    # correlation of each frame's filters with the final ones (how "learned" the frame is), mean over cells
    def corr(x, y):
        x = x.reshape(96, -1); y = y.reshape(96, -1)
        x = x - x.mean(1, keepdims=True); y = y - y.mean(1, keepdims=True)
        return (x * y).sum(1) / np.sqrt((x * x).sum(1) * (y * y).sum(1) + 1e-30)
    sim = [float(corr(W[f], W[-1]).mean()) for f in range(F)]
    norm = [float(np.sqrt((W[f] ** 2).sum())) for f in range(F)]

    # atlas PNG: frames stacked vertically, each frame the conv1.png layout (12 x 8 cells, 11 px, 13 px pitch, 1 px offset)
    ink = np.array([11, 10, 13], np.uint8)
    atlas = np.tile(ink, (F * 104, 156, 1))
    for f in range(F):
        for c in range(96):
            r, q = divmod(c, 12)
            atlas[f * 104 + r * 13 + 1:f * 104 + r * 13 + 12, q * 13 + 1:q * 13 + 12] = u8[f, c]
    Image.fromarray(atlas).save(PUB / 'conv1_seq.png', optimize=True)

    snaps = lg['snaps']
    obj = {
        'what': 'conv1.weight (96 x 11 x 11 x 3) of the film CNN snapshotted during training: noise -> learned filters',
        'recipe': 'tools/conv1/train.py re-run with the args of tools/data/conv1/log.json; tools/data/conv1_seq.py',
        'fallback': bool(lg.get('fallback', False)),
        'frames': F,
        'step': [s['step'] for s in snaps],
        'epoch': [s['epoch'] for s in snaps],
        'test_acc': [s['test_acc'] for s in snaps],
        'similarity_to_final': sim,
        'weight_norm': norm,
        'order': order,
        'order_matches_filters_conv1': order == ref_order,
        'max_abs_diff_final_vs_filters_conv1_ckpt': same_as_ref,
        'layout': {'cols': 12, 'rows': 8, 'cell': 11, 'pitch': 13, 'offset': 1, 'size': [156, 104],
                   'atlas': 'conv1_seq.png: frames stacked vertically, frame f at y = 104 f', 'channels': 'RGB'},
        'encoding': 'u8[frame][cell][y][x][rgb] = round(255 (w - lo) / (hi - lo)), base64; w = lo + u8 / 255 (hi - lo); '
                    'cell = position on the 12 x 8 sheet, filter index = order[cell]; y down, x right',
        'lo': lo, 'hi': hi,
        'u8': b64(u8, np.uint8),
        'display': 'the film sheet (filters/conv1.png) is the last frame desaturated 0.4 toward each filter\'s grey',
    }
    save_json('conv1_seq.json', obj)
    # QA sheet: a selection of frames side by side, x3
    pick = [0, 1, 3, 5, 7, 9, 12, 15, 16, 20, 30, F - 1] if F > 30 else list(range(F))
    pick = [p for p in pick if p < F]
    tiles = []
    for p in pick:
        im = Image.fromarray(atlas[p * 104:(p + 1) * 104]).resize((156 * 3, 104 * 3), Image.NEAREST)
        tiles.append((p, im))
    cols = 4
    rows = math.ceil(len(tiles) / cols)
    sheet = Image.new('RGB', (cols * (156 * 3 + 12) + 12, rows * (104 * 3 + 34) + 12), (11, 10, 13))
    from PIL import ImageDraw
    dr = ImageDraw.Draw(sheet)
    for k, (p, im) in enumerate(tiles):
        r, c = divmod(k, cols)
        x0, y0 = 12 + c * (156 * 3 + 12), 12 + r * (104 * 3 + 34)
        sheet.paste(im, (x0, y0 + 22))
        acc = snaps[p]['test_acc']
        dr.text((x0, y0 + 4), f'frame {p}  step {snaps[p]["step"]}  ep {snaps[p]["epoch"]:.3g}  acc {acc * 100 if acc else 0:.1f}%  sim {sim[p]:.2f}',
                fill=(237, 234, 242))
    sheet.save(WIP / 'conv1_seq_sheet.png')
    print('frames', F, 'final acc', snaps[-1]['test_acc'], 'order == filters/conv1.json:', order == ref_order,
          'max diff vs reference ckpt', same_as_ref)


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'export'
    {'train': train, 'export': export, 'fallback': fallback}[cmd]()
