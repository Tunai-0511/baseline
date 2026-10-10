"""Export the trained conv1 filters as the sheet tower.ts samples: app/public/filters/conv1.png + conv1.json.

Sheet: 12 x 8 cells of 11 x 11 px at a 13 px pitch with a 1 px offset -> 156 x 104 px. Each filter is min-max
normalised over its three channels together (the classic AlexNet figure), so colour is the filter's own.
Cells 0-47 (rows 0-3) hold one conv1 group, 48-95 (rows 4-7) the other, like the two GPUs; the more colour-agnostic
group goes on top. Inside a group: oriented filters sorted by orientation (then frequency), the near-isotropic
blobs after them, sorted by hue.

  tools/.venv/bin/python tools/conv1/export.py [--ckpt tools/data/conv1/last.pt] [--desat 0.0]
"""
import argparse, datetime, json, math, os
import numpy as np
import torch
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
INK = np.array([11, 10, 13], np.float64)


def describe(f):
    """f: 11 x 11 x 3 -> dict of colour fraction, orientation, frequency, anisotropy, hue."""
    f = f - f.mean()
    lum = f.mean(axis=2)
    chroma = f - lum[..., None]
    tot = (f ** 2).sum() + 1e-12
    cf = (chroma ** 2).sum() * 1.0 / tot  # share of the energy that is colour (0 = grey)
    # orientation / frequency from the luminance power spectrum (zero-padded), DC removed
    P = np.abs(np.fft.fftshift(np.fft.fft2(lum, s=(64, 64)))) ** 2
    ky, kx = np.mgrid[-32:32, -32:32] / 64.0
    r = np.hypot(kx, ky)
    P = P * (r > 0.02)
    w = P / (P.sum() + 1e-12)
    # orientation tensor of the spectrum: anisotropy and the dominant direction (doubled angle, mod pi)
    a = np.arctan2(ky, kx)
    c2, s2 = (w * np.cos(2 * a)).sum(), (w * np.sin(2 * a)).sum()
    aniso = math.hypot(c2, s2)
    theta = (0.5 * math.atan2(s2, c2)) % math.pi  # direction of the wave vector
    freq = (w * r).sum()
    # hue of the dominant colour axis in an opponent space (R-G, (R+G)/2-B)
    o1 = chroma[..., 0] - chroma[..., 1]
    o2 = 0.5 * (chroma[..., 0] + chroma[..., 1]) - chroma[..., 2]
    M = np.array([[(o1 * o1).sum(), (o1 * o2).sum()], [(o1 * o2).sum(), (o2 * o2).sum()]])
    ev, evec = np.linalg.eigh(M)
    v = evec[:, 1]
    hue = math.atan2(v[1], v[0]) % math.pi
    return {'cf': float(cf), 'theta': float(theta), 'freq': float(freq), 'aniso': float(aniso), 'hue': float(hue)}


def order_grey(idx, D):
    """Grey filters: oriented ones swept by orientation (wave-vector angle, 15 degree bins, then frequency), isotropic after."""
    edges = [i for i in idx if D[i]['aniso'] >= 0.35]
    blobs = [i for i in idx if D[i]['aniso'] < 0.35]
    edges.sort(key=lambda i: (round(D[i]['theta'] / (math.pi / 12)) % 12, D[i]['freq']))
    blobs.sort(key=lambda i: D[i]['freq'])
    return edges + blobs


def order_colour(idx, D):
    """Colour filters: grouped by their opponent axis (hue mod 180 degrees), so blue/orange, green/magenta... sit together."""
    return sorted(idx, key=lambda i: (D[i]['hue'] + 0.6) % math.pi)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--ckpt', default=os.path.join(ROOT, 'tools', 'data', 'conv1', 'last.pt'))
    ap.add_argument('--desat', type=float, default=0.0, help='0..1: pull each filter toward its own grey (noted in json)')
    ap.add_argument('--keep-groups', dest='keep_groups', action='store_true', help='rows 0-3 / 4-7 = the two conv1 groups')
    ap.add_argument('--out', default=os.path.join(ROOT, 'app', 'public', 'filters'))
    args = ap.parse_args()
    ck = torch.load(args.ckpt, map_location='cpu')
    W = ck['state']['conv1.weight'].float().numpy().transpose(0, 2, 3, 1)  # 96 x 11 x 11 x 3 (RGB)
    D = [describe(W[i]) for i in range(96)]
    g1, g2 = list(range(48)), list(range(48, 96))
    cf1, cf2 = np.mean([D[i]['cf'] for i in g1]), np.mean([D[i]['cf'] for i in g2])
    if args.keep_groups:  # rows 0-3 = the greyer conv1 group, rows 4-7 = the other (the two-GPU split)
        top, bot = (g1, g2) if cf1 <= cf2 else (g2, g1)
    else:  # the 48 greyest filters on top, the 48 most colourful below
        by_cf = sorted(range(96), key=lambda i: D[i]['cf'])
        top, bot = by_cf[:48], by_cf[48:]
    order = order_grey(top, D) + order_colour(bot, D)

    sheet = np.tile(INK, (104, 156, 1))
    for cell, i in enumerate(order):
        f = W[i].astype(np.float64)
        if args.desat > 0:
            lum = f.mean(axis=2, keepdims=True)
            f = lum + (f - lum) * (1 - args.desat)
        f = (f - f.min()) / max(1e-12, f.max() - f.min())
        r, c = divmod(cell, 12)
        sheet[r * 13 + 1:r * 13 + 12, c * 13 + 1:c * 13 + 12] = f * 255
    img = Image.fromarray(np.clip(sheet + 0.5, 0, 255).astype(np.uint8))
    os.makedirs(args.out, exist_ok=True)
    img.save(os.path.join(args.out, 'conv1.png'), optimize=True)
    prev = os.path.join(ROOT, 'out', 'wip', 'conv1', 'conv1_sheet_x8.png')
    os.makedirs(os.path.dirname(prev), exist_ok=True)
    img.resize((156 * 8, 104 * 8), Image.NEAREST).save(prev)

    log_p = os.path.join(os.path.dirname(args.ckpt), 'log.json')
    log = json.load(open(log_p)) if os.path.exists(log_p) else {}
    a = ck['args']
    meta = {
        'what': 'conv1 filters (96 x 11 x 11 x 3) of a small AlexNet-like CNN trained from scratch for this film',
        'dataset': 'CIFAR-10 (50,000 train / 10,000 test, 10 classes), 32 px resampled to %d px (bilinear); test at a plain %gx upsample' % (a['size'], a['size'] / 32),
        'test_accuracy': round(float(ck['test_acc']), 4),
        'epochs': int(ck['epoch']),
        'arch': 'conv1 96@11x11/s%d +BN+ReLU, maxpool, conv2 256@5x5 (2 groups), maxpool, conv3 384@3x3, conv4 384@3x3 (2 groups), '
                'conv5 256@3x3 (2 groups), maxpool, FC 1024, FC 10; dropout 0.5' % a['stride'],
        'groups': 'conv1 0-47 feed only group 1 and 48-95 only group 2 (the two-GPU split)',
        'sheet_order': ('rows 0-3 = the greyer conv1 group, rows 4-7 = the other' if args.keep_groups else
                        'rows 0-3 = the 48 greyest filters (oriented ones by orientation), rows 4-7 = the 48 most colourful (by opponent axis)'),
        'training': 'SGD nesterov momentum 0.9, one-cycle lr max %.3g, weight decay %.0e (conv1 %.0e), batch %d, label smoothing 0.1; '
                    'augmentation: random magnification %.2g-%.2gx (bilinear), shift, h-flip, brightness/contrast jitter; conv1 init N(0, %.0e)'
                    % (a['lr'], a['wd'], a.get('wd1', a['wd']), a['bs'], a.get('mag_min', 1.6), a.get('mag_max', 2.4), a.get('init_std', 0)),
        'device': 'Apple M5 (MPS), PyTorch %s' % torch.__version__,
        'per_epoch_test_accuracy': [round(e['test_acc'], 4) for e in log.get('log', [])],
        'normalisation': 'each filter min-max over its three channels together; gaps = ink #0B0A0D',
        'desaturation': args.desat,
        'layout': {'cols': 12, 'rows': 8, 'cell': 11, 'pitch': 13, 'offset': 1, 'size': [156, 104]},
        'order': order,
        'colour_fraction_by_group': {'0-47': round(float(cf1), 3), '48-95': round(float(cf2), 3)},
        'date': datetime.date.today().isoformat(),
        'script': 'tools/conv1/train.py + tools/conv1/export.py',
    }
    json.dump(meta, open(os.path.join(args.out, 'conv1.json'), 'w'), indent=1, ensure_ascii=False)
    print(json.dumps({k: meta[k] for k in ('test_accuracy', 'epochs', 'colour_fraction_by_group', 'desaturation')}))
    print('oriented (aniso >= 0.35) top/bottom:', [sum(D[i]['aniso'] >= 0.35 for i in g) for g in (top, bot)],
          ' top-half cf from conv1 group 2:', sum(i >= 48 for i in top))


if __name__ == '__main__':
    main()
