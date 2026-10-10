"""Diffusion that writes: probability-flow ODE trajectories of particles condensing into the sung words and into the
25-cluster grid, with the exact (analytic) score of a Gaussian mixture.

  tools/.venv/bin/python tools/data/diffusion_glyph.py      -> app/public/data/diffusion_glyph.json

DDPM schedule (ledger B.4): T = 1000, β_t linear 1e-4 -> 0.02, ε-prediction. Data distribution of a word: a mixture of
K = 4N isotropic Gaussians (std s) whose centres are stratified samples of the word's ink (Archivo w1125/900).
Its noised marginal is again a mixture, so the score is exact:
    ∇log p_t(x) = Σ_k r_k(x) (√ᾱ_t μ_k − x) / (ᾱ_t s² + 1 − ᾱ_t),   ε̂(x, t) = −√(1 − ᾱ_t) ∇log p_t(x)
and the deterministic DDIM (η = 0) update with this ε̂ is the probability-flow ODE (no network, no training, no
approximation beyond the 1,000-step discretisation). Particles start from N(0, I) (seeded) at t = 1000.

Coordinates: cap-height units of the word's own face — origin at the left end of the baseline, +x reading, +y up,
cap height = 1 (the _fab face convention). The grid uses [-1, 1]² (5 x 5 centres at -0.8 … 0.8).
64 keyframes per trajectory, uniform in log-SNR between t = 1000 and t = 0, stored as float16 (frame-major).

  pos  = base64 float16 little-endian, shape [64 frames][N particles][2 (x, y)]
  t    = the DDPM step of each keyframe (the column's odometer: 1000 -> 0)
  frac = fraction of particles within 0.03 em of their final position at each keyframe; k90 = first keyframe ≥ 0.9

Consumers: verse3 123.48-126.33: DIFFUSION condenses along the PF-ODE (F5 particles), then LEARNED TO DENOISE IN A each
at its own height; odometer = t; column top: the 25-cluster grid fully reconstructed (vs the GAN's collapse).
"""
import math

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

from _common import ROOT, WIP, b64, save_json

FONT = ROOT / 'app' / 'public' / 'fonts' / 'Archivo-w1125-900.ttf'
WORDS = ['DIFFUSION', 'LEARNED', 'TO', 'DENOISE', 'IN', 'A']
T = 1000
KEYS = 64
SEED = 1000


def schedule():
    beta = np.linspace(1e-4, 0.02, T)
    abar = np.cumprod(1 - beta)
    return beta, abar


def rasterize(word, cap_px=240):
    f = ImageFont.truetype(str(FONT), size=int(cap_px / 0.7))
    # measure cap height and em
    hb = f.getbbox('H', anchor='ls')
    cap = -hb[1]
    em = f.size
    bb = f.getbbox(word, anchor='ls')
    w = bb[2] - bb[0] + 8
    h = bb[3] - bb[1] + 8
    im = Image.new('L', (w, h), 0)
    ImageDraw.Draw(im).text((4 - bb[0], 4 - bb[1]), word, font=f, fill=255, anchor='ls')
    a = np.asarray(im, np.float64) / 255
    base_y = 4 - bb[1]          # baseline row in image
    x0 = 4 - bb[0]              # pen origin column
    adv = f.getlength(word)
    return a, base_y, x0, cap, em, adv


def ink_samples(a, base_y, x0, cap, K, rng):
    """Stratified (jittered-grid) samples of the ink, in cap units, origin = pen origin on the baseline."""
    ys, xs = np.nonzero(a > 0.5)
    area = len(xs)
    step = math.sqrt(area / K)
    pts = []
    gy = np.arange(0, a.shape[0], step)
    gx = np.arange(0, a.shape[1], step)
    for y in gy:
        for x in gx:
            px = x + rng.random() * step
            py = y + rng.random() * step
            ix, iy = int(px), int(py)
            if 0 <= iy < a.shape[0] and 0 <= ix < a.shape[1] and a[iy, ix] > 0.5:
                pts.append(((px - x0) / cap, (base_y - py) / cap))
    pts = np.array(pts)
    if len(pts) > K:
        pts = pts[rng.choice(len(pts), K, replace=False)]
    return pts


def flow(mu, s, N, seed, center, scale):
    """PF-ODE (DDIM η=0, exact mixture score) in normalised coordinates z = (x - center) / scale."""
    beta, abar = schedule()
    g = torch.Generator().manual_seed(seed)
    M = torch.tensor((mu - center) / scale, dtype=torch.float64)
    scale = np.broadcast_to(np.asarray(scale, np.float64), (2,))
    sc = torch.tensor(scale, dtype=torch.float64)
    z = torch.randn(N, 2, generator=g, dtype=torch.float64)
    # keyframes uniform in log-SNR between step 999 and step 0 (+ the clean end)
    lsnr = np.log(abar / (1 - abar))
    targets = np.linspace(lsnr[-1], lsnr[0], KEYS - 1)
    key_steps = sorted(set(int(np.argmin(np.abs(lsnr - v))) for v in targets), reverse=True)
    while len(key_steps) < KEYS - 1:         # dedupe can drop a few near t = 1000: fill uniformly
        cand = [k for k in range(T - 1, -1, -1) if k not in key_steps]
        key_steps = sorted(set(key_steps + [cand[len(cand) // 2]]), reverse=True)
    frames, tlist = [], []
    for i in range(T - 1, -1, -1):
        ab = abar[i]
        var = ab * (s / sc) ** 2 + (1 - ab)          # per-axis variance of every component at step i
        mt = math.sqrt(ab) * M
        # responsibilities (diagonal covariance, same for all components)
        zw, mw = z / var.sqrt(), mt / var.sqrt()
        d2 = (zw ** 2).sum(1)[:, None] - 2 * zw @ mw.T + (mw ** 2).sum(1)[None]
        r = torch.softmax(-d2 / 2, 1)
        score = (r @ mt - z) / var
        eps = -math.sqrt(1 - ab) * score
        x0 = (z - math.sqrt(1 - ab) * eps) / math.sqrt(ab)
        if i in key_steps:
            frames.append(z.clone())
            tlist.append(i + 1)
        ab_prev = abar[i - 1] if i > 0 else 1.0
        z = math.sqrt(ab_prev) * x0 + math.sqrt(1 - ab_prev) * eps
    frames.append(z.clone())
    tlist.append(0)
    P = torch.stack(frames).numpy() * scale + center       # KEYS x N x 2 (back to face units)
    return P, tlist


def main():
    rng = np.random.default_rng(SEED)
    out = {'what': 'probability-flow ODE trajectories (DDPM T=1000, β 1e-4→0.02 linear, exact mixture score, DDIM η=0)',
           'schedule': {'T': T, 'beta0': 1e-4, 'beta1': 0.02, 'pred': 'epsilon'},
           'font': 'Archivo-1125-900', 'keyframes': KEYS,
           'encoding': 'pos: base64 float16 LE, [frame][particle][x, y]; words in cap-height units (origin = left end of '
                       'the baseline, +y up), grid in [-1, 1]^2', 'words': [], 'grid': None}
    previews = []
    for wi, word in enumerate(WORDS):
        a, base_y, x0, cap, em, adv = rasterize(word)
        N = 300 * len(word)
        mu = ink_samples(a, base_y, x0, cap, 4 * N, rng)
        s = 0.012                                    # component std in cap units
        width = adv / cap
        center = np.array([width / 2, 0.5])
        scale = np.array([max(width, 1.0) / 2, 0.75])   # per-axis data normalisation to ~[-1, 1] (like image pixels)
        P, tl = flow(mu, s, N, SEED + wi, center, scale)
        em_cap = em / cap                            # 1 em in cap units
        thr = 0.03 * em_cap
        dist = np.sqrt(((P - P[-1][None]) ** 2).sum(-1))
        frac = (dist < thr).mean(1)
        k90 = int(np.argmax(frac >= 0.9))
        # distance to the ink (nearest mixture centre): when the word reads, not when every particle has settled
        dink = np.stack([np.sqrt(((P[k][:, None] - mu[None]) ** 2).sum(-1)).min(1) for k in range(KEYS)])
        frac_ink = (dink < thr).mean(1)
        k90_ink = int(np.argmax(frac_ink >= 0.9))
        # how far the final particles sit from the ink (sanity: should be ~s)
        print(f'  {word:10s} N={N:5d} K={len(mu):5d} width={width:.3f} cap  k90={k90} (t={tl[k90]}) ink k90={k90_ink} (t={tl[k90_ink]})  '
              f'final spread {np.median(np.sqrt(((P[-1][:, None] - mu[None]) ** 2).sum(-1)).min(1)):.4f} cap', flush=True)
        out['words'].append({'text': word, 'n': N, 'k': len(mu), 'width': width, 'em_in_cap': em_cap,
                             'advance': width, 'sigma': s, 't': tl, 'frac_003em': frac, 'k90': k90,
                             'frac_ink_003em': frac_ink, 'k90_ink': k90_ink, 'norm_scale': scale,
                             'pos': b64(P.astype(np.float16), np.float16),
                             'bbox_final': [float(P[-1][:, 0].min()), float(P[-1][:, 1].min()),
                                            float(P[-1][:, 0].max()), float(P[-1][:, 1].max())]})
        previews.append((word, P))
    # 25-cluster grid
    c = np.linspace(-0.8, 0.8, 5)
    gx, gy = np.meshgrid(c, c)
    mu = np.stack([gx.ravel(), gy.ravel()], 1)
    N = 1250
    P, tl = flow(mu, 0.05, N, SEED + 99, np.zeros(2), 1.0)
    final_mode = np.argmin(((P[-1][:, None] - mu[None]) ** 2).sum(-1), 1)
    counts = np.bincount(final_mode, minlength=25)
    print('  grid: per-mode counts', counts.tolist())
    dist = np.sqrt(((P - P[-1][None]) ** 2).sum(-1))
    frac = (dist < 0.03).mean(1)
    out['grid'] = {'n': N, 'centres': mu, 'sigma': 0.05, 't': tl, 'frac_003': frac, 'k90': int(np.argmax(frac >= 0.9)),
                   'mode_counts': counts, 'modes_covered': int((counts > 0).sum()), 'pos': b64(P.astype(np.float16), np.float16)}
    save_json('diffusion_glyph.json', out, sig=6)
    # QA preview: each word at 6 keyframes
    ks = [0, 40, 46, 50, 54, 58, 63]
    rows = []
    for word, P in previews + [('GRID', P)]:
        tiles = []
        for k in ks:
            q = P[k]
            if word == 'GRID':
                lo, hi = np.array([-1.6, -1.6]), np.array([1.6, 1.6])
                Wd, Hd = 200, 200
            else:
                fx = P[-1]
                wd = fx[:, 0].max()
                lo = np.array([-0.3 * wd - 0.4, -1.0])
                hi = np.array([1.3 * wd + 0.4, 2.0])
                Hd = 130
                Wd = int(Hd * (hi[0] - lo[0]) / (hi[1] - lo[1]))
            im = Image.new('L', (Wd, Hd), 12)
            px = ((q - lo) / (hi - lo) * [Wd, Hd]).astype(int)
            arr = np.array(im)
            ok = (px[:, 0] >= 0) & (px[:, 0] < Wd) & (px[:, 1] >= 0) & (px[:, 1] < Hd)
            for dy in (0, 1):
                for dx in (0, 1):
                    yy = np.clip(Hd - 1 - px[ok, 1] + dy, 0, Hd - 1)
                    xx = np.clip(px[ok, 0] + dx, 0, Wd - 1)
                    arr[yy, xx] = 235
            tiles.append(Image.fromarray(arr))
        rows.append(tiles)
    hmax = max(r[0].height for r in rows)
    Wt = sum(t.width for t in rows[0]) + 10 * len(ks)
    Wmax = max(sum(t.width for t in r) + 10 * len(ks) for r in rows)
    sheet = Image.new('L', (Wmax, sum(r[0].height + 10 for r in rows)), 0)
    y = 0
    for r in rows:
        x = 0
        for t in r:
            sheet.paste(t, (x, y))
            x += t.width + 10
        y += r[0].height + 10
    sheet.save(WIP / 'diffusion_glyph_sheet.png')


if __name__ == '__main__':
    main()
