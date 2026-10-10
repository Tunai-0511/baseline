"""A real GAN on 25 Gaussians (5 x 5 grid) that collapses: the steel balls G throws, D's 8 x 8 real/fake lamps, and the
mode count falling to 1–2 of 25.

  tools/.venv/bin/python tools/data/gan25.py      -> app/public/data/gan25.json

Target: 25 isotropic Gaussians, centres on the 5 x 5 grid {-2, -1, 0, 1, 2}², std 0.05 (the 25 machined dimples).
G: z ∈ R² ~ N(0, I) -> 128 -> 128 -> 2 (ReLU); D: 2 -> 128 -> 128 -> 1 (LeakyReLU 0.2). Non-saturating GAN loss
(Goodfellow et al.), batch 256, CPU. Steps 0–2,999: Adam lr 1e-3, β1 0.5 (the stable recipe; G learns to cover many
modes). From step 3,000 the generator's learning rate is raised to 5e-3 and both optimisers' β1 to 0.9 — the kind of
aggressive setting that makes real GAN runs collapse (with the stable recipe alone, 40 seeds all reached 20–25 modes:
`stable_recipe_note`). Seeds 0, 1, 2 … are trained in order; kept is the first whose run (a) covers ≥ 10 modes before
the change and (b) afterwards reaches a snapshot with 1–2 modes and ≥ 50 % of samples inside a dimple — `search` lists
every seed tried (seed 1: 20 modes at step 2,850 -> 1 mode holding 98 % of the samples at step 3,350).
A mode is covered when ≥ 1 % of 2,500 samples fall within 3 std of its centre; `quality` = share of samples within
3 std of any centre.
Snapshots (every 100 steps) store 64 balls (fixed z, so each ball moves continuously), D(ball) for the 8 x 8 lamp array
(lamp k = ball k), and the coverage. `clip` = the snapshot range from the coverage peak to the collapse, for the shot.

Fallback (B.1) only if no seed collapses: closed-form interpolation, nameplate `ILLUSTRATIVE` (flag `illustrative`).

Consumers: verse3 S1 119.84-123.292 (G and D gantries; balls between the dimples; `G 0 : D 0` flips each round;
dimple lights go out; 7-segment `MODES 2/25`).
"""
import numpy as np
import torch
import torch.nn as nn

from _common import save_json, torch_seed

C = np.array([[x, y] for y in (-2, -1, 0, 1, 2) for x in (-2, -1, 0, 1, 2)], float)
STD = 0.05
STEPS, EVERY, SWITCH = 4500, 50, 3000


def coverage(x):
    d = np.sqrt(((x[:, None] - C[None]) ** 2).sum(-1))
    near = d.min(1) < 3 * STD
    which = d.argmin(1)
    counts = np.bincount(which[near], minlength=25)
    return int((counts >= 0.01 * len(x)).sum()), float(near.mean()), counts


def run(seed):
    torch_seed(seed)
    G = nn.Sequential(nn.Linear(2, 128), nn.ReLU(), nn.Linear(128, 128), nn.ReLU(), nn.Linear(128, 2))
    D = nn.Sequential(nn.Linear(2, 128), nn.LeakyReLU(0.2), nn.Linear(128, 128), nn.LeakyReLU(0.2), nn.Linear(128, 1))
    og = torch.optim.Adam(G.parameters(), lr=1e-3, betas=(0.5, 0.999))
    od = torch.optim.Adam(D.parameters(), lr=1e-3, betas=(0.5, 0.999))
    g = torch.Generator().manual_seed(seed)
    zf = torch.randn(64, 2, generator=g)          # the 64 balls
    ze = torch.randn(2500, 2, generator=g)        # evaluation samples
    Ct = torch.tensor(C, dtype=torch.float32)
    bce = nn.BCEWithLogitsLoss()
    snaps = []
    for st in range(STEPS + 1):
        if st == SWITCH:
            for pg in og.param_groups:
                pg['lr'], pg['betas'] = 5e-3, (0.9, 0.999)
            for pg in od.param_groups:
                pg['betas'] = (0.9, 0.999)
        if st % EVERY == 0:
            with torch.no_grad():
                xb = G(zf).numpy()
                xe = G(ze).numpy()
                db = torch.sigmoid(D(G(zf))).numpy()[:, 0]
                real = Ct[torch.randint(0, 25, (64,), generator=g)] + STD * torch.randn(64, 2, generator=g)
                dr = torch.sigmoid(D(real)).numpy()[:, 0]
            cov, q, counts = coverage(xe)
            snaps.append({'step': st, 'balls': xb, 'd_fake': db, 'd_real_mean': float(dr.mean()), 'modes': cov,
                          'quality': q, 'counts': counts})
        if st == STEPS:
            break
        real = Ct[torch.randint(0, 25, (256,), generator=g)] + STD * torch.randn(256, 2, generator=g)
        fake = G(torch.randn(256, 2, generator=g))
        ld = bce(D(real), torch.ones(256, 1)) + bce(D(fake.detach()), torch.zeros(256, 1))
        od.zero_grad(); ld.backward(); od.step()
        lg = bce(D(fake), torch.ones(256, 1))
        og.zero_grad(); lg.backward(); og.step()
    return snaps


def main():
    search = []
    chosen = None
    for seed in range(24):
        snaps = run(seed)
        cov = [s['modes'] for s in snaps]
        sw = SWITCH // EVERY
        peak = int(np.argmax(cov[:sw + 1]))
        good = lambda k, n: cov[k] == n and snaps[k]['quality'] >= 0.5
        c2 = [k for k in range(sw, len(snaps)) if good(k, 2)]
        c1 = [k for k in range(sw, len(snaps)) if good(k, 1)]
        ok2 = cov[peak] >= 10 and bool(c2)
        ok1 = cov[peak] >= 10 and bool(c1)
        search.append({'seed': seed, 'peak_modes': cov[peak], 'peak_step': snaps[peak]['step'],
                       'collapse_to_2_step': snaps[c2[0]]['step'] if ok2 else None,
                       'collapse_to_1_step': snaps[c1[0]]['step'] if ok1 else None})
        print(f'  seed {seed}: coverage {cov[::4]} peak {cov[peak]}@{snaps[peak]["step"]} -> '
              f'2 modes: {snaps[c2[0]]["step"] if ok2 else "-"}  1 mode: {snaps[c1[0]]["step"] if ok1 else "-"}', flush=True)
        if ok1 or ok2:
            chosen = (seed, snaps, peak, min(c1[:1] + c2[:1]))
            break
    if chosen is None:
        raise SystemExit('no collapsing seed: use the ILLUSTRATIVE fallback')
    seed, snaps, peak, end = chosen
    # G : D score per round (snapshot): D wins a round when it scores real above fake on average
    score = []
    gs = ds = 0
    for s in snaps:
        if s['d_real_mean'] > float(np.mean(s['d_fake'])):
            ds += 1
        else:
            gs += 1
        score.append([gs, ds])
    save_json('gan25.json', {
        'what': 'vanilla GAN (non-saturating loss) on 25 Gaussians; a seed that covers many modes, then collapses',
        'centres': C, 'std': STD, 'seed': seed, 'search': search, 'steps': STEPS, 'every': EVERY,
        'illustrative': False, 'switch_step': SWITCH,
        'recipe': {'before': 'Adam lr 1e-3 (G, D), betas (0.5, 0.999)', 'after': 'G lr 5e-3, betas (0.9, 0.999); D lr 1e-3, betas (0.9, 0.999)'},
        'stable_recipe_note': 'with the stable recipe only (6,000 steps), seeds 0-39 all ended at 20-25 modes: no collapse',
        'snapshots': [{'step': s['step'], 'balls': np.round(s['balls'], 4), 'd_fake': np.round(s['d_fake'], 4),
                       'd_real_mean': s['d_real_mean'], 'modes': s['modes'], 'quality': s['quality'],
                       'mode_counts': s['counts'], 'score_GD': sc} for s, sc in zip(snaps, score)],
        'clip': {'from': peak, 'to': end, 'peak_modes': snaps[peak]['modes'], 'collapsed_modes': snaps[end]['modes'],
                 'display': f'MODES {snaps[end]["modes"]}/25'},
        'note': 'balls[k] = G(z_k) for 64 fixed z (lamp k of D\'s 8 x 8 array shows d_fake[k] = D(G(z_k)) in (0,1)); '
                'modes = covered modes of 2,500 samples',
    }, sig=5)


if __name__ == '__main__':
    main()
