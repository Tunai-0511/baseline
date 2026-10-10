"""Toy reward model from human rankings: Bradley–Terry scores fitted by maximum likelihood, and the DPO identity
(β log Z(x) cancels in r_w − r_l) checked with numbers.

  tools/.venv/bin/python tools/data/bt_reward.py      -> app/public/data/bt_reward.json

K = 4 answers from the policy. 6 annotators each rank all 4 (rankings drawn from a Plackett–Luce model with latent
utilities u, seed 48). Each ranking is split into its 6 pairwise preferences (36 comparisons). Bradley–Terry:
P(i ≻ j) = σ(r_i − r_j); r fitted by Newton's method on the log-likelihood with Σ r = 0 (identifiability), plus a tiny
ridge 1e-3. Exported: comparisons, win counts, r, the P matrix, the resulting rank (1 = best) for the 4 pointers and
the 1–4 rank cards.
DPO: with r(x, y) = β log π*(y|x)/π_ref(y|x) + β log Z(x), the preference σ(r_w − r_l) is evaluated for two very different
Z(x) values and is identical (asserted): Z(x) cancels; L_DPO = −log σ(β log π_θ(y_w|x)/π_ref(y_w|x) − β log π_θ(y_l|x)/π_ref(y_l|x)).

Consumers: bridge B1 171.72-175.50 (comparator pointers, sorter re-ranks the 4 lanes, rank cards 1–4; the two β·log Z(x)
blocks slide together and annihilate at 175.50).
"""
import math

import numpy as np

from _common import save_json

SEED = 48
K = 4


def sig(x):
    return 1 / (1 + np.exp(-x))


def main():
    rng = np.random.default_rng(SEED)
    u = np.array([0.9, -0.4, 0.3, -0.8])                  # latent utilities of answers 0..3
    rankings = []
    for a in range(6):
        left = list(range(K))
        rk = []
        while left:                                       # Plackett–Luce sampling
            w = np.exp(u[left])
            pick = left[int(rng.choice(len(left), p=w / w.sum()))]
            rk.append(pick)
            left.remove(pick)
        rankings.append(rk)
    comps = [(rk[i], rk[j]) for rk in rankings for i in range(K) for j in range(i + 1, K)]
    wins = np.zeros((K, K))
    for w_, l_ in comps:
        wins[w_, l_] += 1
    r = np.zeros(K)
    for it in range(100):
        g = np.zeros(K)
        Hm = np.zeros((K, K))
        for w_, l_ in comps:
            p = sig(r[w_] - r[l_])
            g[w_] += 1 - p
            g[l_] -= 1 - p
            h = p * (1 - p)
            Hm[w_, w_] -= h; Hm[l_, l_] -= h; Hm[w_, l_] += h; Hm[l_, w_] += h
        g -= 1e-3 * r
        Hm -= 1e-3 * np.eye(K)
        step = np.linalg.lstsq(Hm, -g, rcond=None)[0]
        r = r + step
        r -= r.mean()
        if np.abs(step).max() < 1e-12:
            break
    Pm = sig(r[:, None] - r[None, :])
    order = np.argsort(-r)
    rank = np.empty(K, int)
    rank[order] = np.arange(1, K + 1)
    print('  rankings', rankings, '\n  r', np.round(r, 4), ' rank', rank.tolist())
    # DPO identity
    beta = 0.1
    lp_w, lp_l = -12.4, -15.1          # log π*(y|x)
    ref_w, ref_l = -13.0, -13.6        # log π_ref(y|x)
    res = []
    for Z in (3.7, 1e6):
        rw = beta * (lp_w - ref_w) + beta * math.log(Z)
        rl = beta * (lp_l - ref_l) + beta * math.log(Z)
        res.append({'Z': Z, 'r_w': rw, 'r_l': rl, 'pref': float(sig(rw - rl))})
    assert abs(res[0]['pref'] - res[1]['pref']) < 1e-12
    ldpo = -math.log(sig(beta * (lp_w - ref_w) - beta * (lp_l - ref_l)))
    save_json('bt_reward.json', {
        'what': 'pairwise-preference (logistic) reward scores fitted to toy human rankings of 4 answers; DPO Z(x) cancellation',
        'seed': SEED, 'latent_u': u, 'rankings': rankings, 'comparisons': comps, 'wins': wins,
        'scores': r, 'P': Pm, 'rank': rank, 'order_best_first': order,
        'dpo': {'beta': beta, 'logp_theta': [lp_w, lp_l], 'logp_ref': [ref_w, ref_l], 'check': res, 'L_DPO': ldpo,
                'formula': 'L_DPO = −log σ(β·log π_θ(y_w|x)/π_ref(y_w|x) − β·log π_θ(y_l|x)/π_ref(y_l|x))',
                'reward': 'r = β·log π*/π_ref + β·log Z(x)'},
    }, sig=6)


if __name__ == '__main__':
    main()
