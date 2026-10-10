"""pre1 ④ VERIFY: a real interval-bound-propagation certificate on a real input (TREATMENT §3.3, §12.3, B.1, B.4).

The deep-net machine has 8 decks = the 8 layers of the 2012 shape (5 conv + 3 FC). This script trains a small
network of exactly that shape on CIFAR-10 (tools/data/cifar10_*.npz, pixels in [0, 1], no normalisation), with
IBP training (Gowal et al. 2018: a mix of the clean loss and the loss of the worst-case logits inside the interval
box, epsilon ramped up), then runs plain IBP on one real test image for ||delta||_inf <= 1/255:

    input box   [max(0, x - eps), min(1, x + eps)]
    affine      centre' = W centre + b,  radius' = |W| radius           (conv and linear)
    ReLU        [max(0, l), max(0, u)]

layer k (k = 1..8, L1 = the bottom level of the WELL = the first layer; bars light bottom -> top) reports the
interval [lo, hi] of its pre-activation output. The bar shows ONE unit per layer (the unit with the largest clean
pre-activation, `unit`, clean value `x`); `wMean` / `wMax` are the interval widths over the whole layer, and
`units` 12 more units for a denser bar. Layer 8 reports the MARGIN m = z_y - max_{j != y} z_j with the last layer
elided into the specification (C W8, exact for that affine layer): certified <=> lo(m) > 0, i.e. the whole output
interval lies on the correct side of the decision boundary. `logits` keeps the plain per-class box of z.

Sanity (written into the file, must hold): every one of 4096 random corners/points of the box and a 40-step PGD
attack stays inside every layer's [lo, hi] and keeps the margin > 0.

    tools/.venv/bin/python tools/data/ibp.py            # -> app/public/data/ibp.json (+ tools/data/ibp/ibp_net.pt)
    tools/.venv/bin/python tools/data/ibp.py --reuse    # skip training, recompute the certificate from the .pt

Fixed seed, CPU, deterministic algorithms: the same machine writes the same file.
"""
import argparse, json, math, os, time
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA = os.path.join(ROOT, 'tools', 'data')
OUT = os.path.join(ROOT, 'app', 'public', 'data', 'ibp.json')
CKPT = os.path.join(DATA, 'ibp', 'ibp_net.pt')
EPS = 1.0 / 255.0
CLASSES = ['airplane', 'automobile', 'bird', 'cat', 'deer', 'dog', 'frog', 'horse', 'ship', 'truck']

# the 8 decks: (name, module, engraved shape)
SHAPES = [
    ('CONV1', 'conv 3>16 3x3 s1'), ('CONV2', 'conv 16>32 4x4 s2'), ('CONV3', 'conv 32>32 3x3 s1'),
    ('CONV4', 'conv 32>64 4x4 s2'), ('CONV5', 'conv 64>64 3x3 s1'), ('FC6', 'fc 4096>256'), ('FC7', 'fc 256>128'), ('FC8', 'fc 128>10'),
]


class Net(nn.Module):
    """5 conv + 3 FC, ReLU after every layer but the last. 32x32 -> 16x16 -> 8x8."""
    def __init__(self):
        super().__init__()
        self.layers = nn.ModuleList([
            nn.Conv2d(3, 16, 3, 1, 1), nn.Conv2d(16, 32, 4, 2, 1), nn.Conv2d(32, 32, 3, 1, 1),
            nn.Conv2d(32, 64, 4, 2, 1), nn.Conv2d(64, 64, 3, 1, 1),
            nn.Linear(64 * 8 * 8, 256), nn.Linear(256, 128), nn.Linear(128, 10),
        ])

    def forward(self, x):
        for i, m in enumerate(self.layers):
            if i == 5:
                x = x.flatten(1)
            x = m(x)
            if i < 7:
                x = Fn.relu(x)
        return x


def affine(m, c, r):
    """IBP through one conv/linear layer in centre/radius form."""
    if isinstance(m, nn.Conv2d):
        c2 = Fn.conv2d(c, m.weight, m.bias, m.stride, m.padding)
        r2 = Fn.conv2d(r, m.weight.abs(), None, m.stride, m.padding)
    else:
        c2 = Fn.linear(c, m.weight, m.bias)
        r2 = Fn.linear(r, m.weight.abs())
    return c2, r2


def ibp(net, x, eps, y=None):
    """Returns per-layer pre-activation (lo, hi) for layers 1..7 and, for layer 8, the margin bounds of
    z_y - z_j (j != y, shape N x 9 x 2 as (lo, hi)) with the last layer elided, plus the plain logit box."""
    lo, hi = (x - eps).clamp(0, 1), (x + eps).clamp(0, 1)
    c, r = (hi + lo) / 2, (hi - lo) / 2
    out = []
    for i, m in enumerate(net.layers):
        if i == 5:
            c, r = c.flatten(1), r.flatten(1)
        if i == 7:
            zc, zr = affine(m, c, r)
            out.append((zc - zr, zc + zr))
            if y is not None:
                W, b = m.weight, m.bias
                # C: rows e_y - e_j for j != y
                n = x.shape[0]
                eye = torch.eye(10, device=x.device)
                Cs = eye[y].unsqueeze(1) - eye.unsqueeze(0)            # N x 10 x 10 (row j: e_y - e_j)
                mask = torch.ones(n, 10, dtype=torch.bool, device=x.device)
                mask[torch.arange(n), y] = False
                Cs = Cs[mask].view(n, 9, 10)
                CW = Cs @ W                                            # N x 9 x 128
                Cb = Cs @ b                                            # N x 9
                mc = (CW @ c.unsqueeze(2)).squeeze(2) + Cb
                mr = (CW.abs() @ r.unsqueeze(2)).squeeze(2)
                return out, (mc - mr, mc + mr)
            return out, None
        c, r = affine(m, c, r)
        out.append((c - r, c + r))
        lo, hi = Fn.relu(c - r), Fn.relu(c + r)
        c, r = (hi + lo) / 2, (hi - lo) / 2
    return out, None


def train(args):
    torch.manual_seed(0); np.random.seed(0)
    d = np.load(os.path.join(DATA, 'cifar10_train.npz'))
    X = torch.from_numpy(d['x']).permute(0, 3, 1, 2).float() / 255.0
    Y = torch.from_numpy(d['y']).long()
    t = np.load(os.path.join(DATA, 'cifar10_test.npz'))
    Xt = torch.from_numpy(t['x']).permute(0, 3, 1, 2).float() / 255.0
    Yt = torch.from_numpy(t['y']).long()
    net = Net()
    opt = torch.optim.Adam(net.parameters(), lr=5e-4)
    E, bs = args.epochs, 128
    steps = E * (len(X) // bs)
    warm, ramp = int(0.1 * steps), int(0.5 * steps)          # eps 0 for 10 %, ramp over 40 %, then hold
    sched = torch.optim.lr_scheduler.MultiStepLR(opt, [int(0.75 * steps), int(0.9 * steps)], 0.2)
    g = torch.Generator().manual_seed(1)
    step = 0
    log = []
    for ep in range(E):
        perm = torch.randperm(len(X), generator=g)
        net.train()
        t0 = time.time(); tl = 0.0
        for k in range(len(X) // bs):
            idx = perm[k * bs:(k + 1) * bs]
            xb, yb = X[idx], Y[idx]
            # light augmentation: random flip + 2 px translation (reflection), deterministic from g
            if torch.rand(1, generator=g).item() < 0.5:
                xb = xb.flip(3)
            sx, sy = torch.randint(-2, 3, (2,), generator=g).tolist()
            xb = torch.roll(xb, (sy, sx), (2, 3))
            ramp_k = min(1.0, max(0.0, (step - warm) / max(1, ramp - warm)))
            eps_t = args.eps_train * ramp_k
            kappa = 1.0 - 0.5 * ramp_k
            z = net(xb)
            loss = kappa * Fn.cross_entropy(z, yb)
            if eps_t > 0:
                _, (mlo, _) = ibp(net, xb, eps_t, yb)
                # worst-case logits relative to z_y: [0, -mlo_j ...] -> CE with the true class at index 0
                wz = torch.cat([torch.zeros(len(yb), 1), -mlo], 1)
                loss = loss + (1 - kappa) * Fn.cross_entropy(wz, torch.zeros(len(yb), dtype=torch.long))
            opt.zero_grad(); loss.backward(); opt.step(); sched.step()
            tl += loss.item(); step += 1
        net.eval()
        with torch.no_grad():
            acc = (net(Xt[:2000]).argmax(1) == Yt[:2000]).float().mean().item()
            _, (mlo, _) = ibp(net, Xt[:2000], EPS, Yt[:2000])
            cert = ((mlo.min(1).values > 0) & (net(Xt[:2000]).argmax(1) == Yt[:2000])).float().mean().item()
        log.append(dict(epoch=ep + 1, loss=tl / (len(X) // bs), acc=acc, cert=cert, eps_train=eps_t, sec=time.time() - t0))
        print(json.dumps(log[-1]), flush=True)
    os.makedirs(os.path.dirname(CKPT), exist_ok=True)
    torch.save(dict(state=net.state_dict(), log=log), CKPT)
    return net, log


def check_box(net, x, y, eps, bounds, mb, n=4096, pgd_steps=40, seed=3):
    """Every sampled / attacked point of the input box stays inside each layer's [lo, hi] and keeps margin > 0."""
    g = torch.Generator().manual_seed(seed)
    lo, hi = (x - eps).clamp(0, 1), (x + eps).clamp(0, 1)
    pts = []
    corners = torch.randint(0, 2, (n // 2,) + x.shape[1:], generator=g).float()
    pts.append(lo + (hi - lo) * corners)
    pts.append(lo + (hi - lo) * torch.rand((n // 2,) + x.shape[1:], generator=g))
    # PGD on the margin (from 8 random starts)
    xa = lo + (hi - lo) * torch.rand((8,) + x.shape[1:], generator=g)
    for _ in range(pgd_steps):
        xa.requires_grad_(True)
        z = net(xa)
        zo = z.clone(); zo[:, y] = -1e9
        m = z[:, y] - zo.max(1).values
        gr, = torch.autograd.grad(m.sum(), xa)
        xa = torch.max(torch.min(xa.detach() - (eps / 8) * gr.sign(), hi), lo)
    pts.append(xa.detach())
    P = torch.cat(pts)
    viol, minm = 0, 1e9
    with torch.no_grad():
        h = P
        for i, mdl in enumerate(net.layers):
            if i == 5:
                h = h.flatten(1)
            z = mdl(h)
            if i < 7:
                l_, u_ = bounds[i]
                viol += int(((z < l_ - 1e-5) | (z > u_ + 1e-5)).sum().item())
                h = Fn.relu(z)
            else:
                zo = z.clone(); zo[:, y] = -1e9
                mm = z[:, y] - zo.max(1).values
                minm = float(mm.min().item())
                viol += int((mm < mb[0] - 1e-5).sum().item()) + int((mm > mb[1] + 1e-5).sum().item())
    return dict(points=int(len(P)), pgdSteps=pgd_steps, violations=viol, minMarginObserved=round(minm, 5))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--epochs', type=int, default=24)
    ap.add_argument('--eps-train', type=float, default=2.2 / 255)
    ap.add_argument('--reuse', action='store_true')
    ap.add_argument('--threads', type=int, default=8)
    args = ap.parse_args()
    torch.set_num_threads(args.threads)
    torch.use_deterministic_algorithms(True)
    if args.reuse and os.path.exists(CKPT):
        net = Net(); ck = torch.load(CKPT); net.load_state_dict(ck['state']); log = ck['log']
    else:
        net, log = train(args)
    net.eval()
    t = np.load(os.path.join(DATA, 'cifar10_test.npz'))
    Xt = torch.from_numpy(t['x']).permute(0, 3, 1, 2).float() / 255.0
    Yt = torch.from_numpy(t['y']).long()
    with torch.no_grad():
        pred = net(Xt).argmax(1)
        acc = (pred == Yt).float().mean().item()
        _, (mlo, _) = ibp(net, Xt, EPS, Yt)
        certified = (mlo.min(1).values > 0) & (pred == Yt)
        cert_acc = certified.float().mean().item()
    # the input: the first test image (in file order) that is certified with a clear margin (> 0.5) — a real,
    # unremarkable image, not the easiest one
    idx = int(next(i for i in range(len(Yt)) if certified[i] and mlo[i].min().item() > 0.5))
    x, y = Xt[idx:idx + 1], int(Yt[idx])
    with torch.no_grad():
        bounds, (mlo1, mhi1) = ibp(net, x, EPS, Yt[idx:idx + 1])
        # clean activations
        acts, h = [], x
        for i, mdl in enumerate(net.layers):
            if i == 5:
                h = h.flatten(1)
            z = mdl(h); acts.append(z)
            h = Fn.relu(z) if i < 7 else z
    layers = []
    for k in range(7):
        l_, u_ = bounds[k][0].flatten(), bounds[k][1].flatten()
        a = acts[k].flatten()
        order = torch.argsort(a, descending=True)
        u0 = int(order[0])
        w = (u_ - l_)
        layers.append(dict(
            name=f'L{k + 1}', deck=SHAPES[k][0], shape=SHAPES[k][1], n=int(a.numel()), quantity='unit',
            unit=u0, x=round(float(a[u0]), 5), lo=round(float(l_[u0]), 5), hi=round(float(u_[u0]), 5),
            wMean=round(float(w.mean()), 6), wMax=round(float(w.max()), 6),
            units=[[int(j), round(float(a[j]), 4), round(float(l_[j]), 4), round(float(u_[j]), 4)] for j in order[1:13].tolist()],
        ))
    z = acts[7].flatten()
    zo = z.clone(); zo[y] = -1e9
    m_clean = float(z[y] - zo.max())
    j_runner = int(zo.argmax())
    mlo_v, mhi_v = mlo1.flatten(), mhi1.flatten()
    others = [j for j in range(10) if j != y]
    m_lo, m_hi = float(mlo_v.min()), float(mhi_v.min())
    layers.append(dict(
        name='L8', deck=SHAPES[7][0], shape=SHAPES[7][1], n=10, quantity='margin',
        x=round(m_clean, 5), lo=round(m_lo, 5), hi=round(m_hi, 5), runnerUp=j_runner, runnerUpName=CLASSES[j_runner],
        wMean=round(float((mhi_v - mlo_v).mean()), 6), wMax=round(float((mhi_v - mlo_v).max()), 6),
        pairs=[[j, round(float(mlo_v[i]), 4), round(float(mhi_v[i]), 4)] for i, j in enumerate(others)],
    ))
    lz, uz = bounds[7]
    chk = check_box(net, x, y, EPS, [(b[0], b[1]) for b in bounds[:7]], (m_lo, m_hi))
    doc = dict(
        eps=EPS, epsText='1/255', norm='inf', label=y, labelName=CLASSES[y], pred=int(pred[idx]), testIndex=idx,
        dataset='CIFAR-10 test', arch='5 conv + 3 FC, ReLU', params=int(sum(p.numel() for p in net.parameters())),
        layers=layers,
        logits=dict(x=[round(float(v), 4) for v in z.tolist()], lo=[round(float(v), 4) for v in lz.flatten().tolist()],
                    hi=[round(float(v), 4) for v in uz.flatten().tolist()]),
        margin=dict(x=round(m_clean, 5), lo=round(m_lo, 5), hi=round(m_hi, 5)),
        certified=bool(m_lo > 0 and int(pred[idx]) == y),
        testAcc=round(acc, 4), certAcc=round(cert_acc, 4),
        check=chk,
        train=dict(epochs=len(log), epsTrain=round(log[-1]['eps_train'], 6), method='IBP (clean/IBP loss mix, eps ramp)', seed=0),
        plate='CERTIFIED ‖δ‖∞ ≤ 1/255 · ON THE INPUTS CHECKED',
        note='Bars bottom -> top: L1..L7 = pre-activation interval of the most active unit of that layer; L8 = margin z_y - max_j z_j with the last layer elided. certified <=> margin.lo > 0.',
    )
    assert doc['certified'] and chk['violations'] == 0, (doc['certified'], chk)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
    print(json.dumps({k: doc[k] for k in ('label', 'labelName', 'testIndex', 'certified', 'testAcc', 'certAcc', 'margin', 'check')}))
    for L in layers:
        print(L['name'], L['deck'], L['x'], [L['lo'], L['hi']], 'wMean', L['wMean'])


if __name__ == '__main__':
    main()
