"""Gradient through 8 sigmoid valves (and the ReLU rectifier that replaces them): real z, σ', and the chain product.

  tools/.venv/bin/python tools/data/sigmoid_chain.py      -> app/public/data/sigmoid_chain.json

Three chains, each h_k = act(w_k h_{k-1} + b_k), k = 1..8, scalar, with |w_k| ≤ 1:
  * `bound`  : the best case for a sigmoid chain, w_k = 1 and every z_k = 0 (b_1 = -x, b_k = -1/2): σ'(0) = 1/4 at every
               valve, so ‖∂L/∂h_0‖ = 4⁻⁸ = 1.52587890625e-5 exactly — the nixie reads 0.000015 (ledger B.4).
  * `signal` : a real forward signal x = 1.5 through valves with w_k = 1, b_k = 0 (no tuning): z drifts to the fixed point
               h* = σ(h*) ≈ 0.659, σ' ≈ 0.22, so the gradient dies faster than the bound.
  * `random` : w_k ~ U(-1, 1), b_k ~ N(0, 1) (seed 8): a typical chain, far below the bound.
  * `relu`   : the same signal through ReLU with w_k = 1, b_k = 0: z > 0 everywhere, derivative 1, gradient stays 1.
The gradient is backpropagated from the last valve (∂L/∂h_8 = 1). `grad[k]` is ‖∂L/∂h_{k-1}‖, the bead brightness after
crossing valve k on its way back; `nixie[k]` is that number as the 6-decimal nixie reading.

Consumers: verse1 S2 (16.07-20.015): GRADIENTS (tube 8) FADING (7) DOWN (6) TO (5) ZERO (4); each tube's base nixie;
18.96 bead dies, nixie 0.000015. 21.87: the bead crosses D1 at full brightness (∂/∂x = 1 for x > 0).
"""
import numpy as np

from _common import save_json

N = 8


def sig(z):
    return 1 / (1 + np.exp(-z))


def chain(x, w, b, act):
    h = [x]
    z = []
    d = []
    for k in range(N):
        zk = w[k] * h[-1] + b[k]
        z.append(zk)
        if act == 'sigmoid':
            hk = sig(zk)
            d.append(hk * (1 - hk))
        else:
            hk = max(0.0, zk)
            d.append(1.0 if zk > 0 else 0.0)
        h.append(hk)
    # backward from dL/dh_8 = 1: dL/dh_{k-1} = dL/dh_k * act'(z_k) * w_k
    g = [0.0] * (N + 1)
    g[N] = 1.0
    for k in range(N - 1, -1, -1):
        g[k] = g[k + 1] * d[k] * w[k]
    grad_after_valve = [abs(g[k]) for k in range(N - 1, -1, -1)]   # after crossing valve 8, 7, ..., 1
    return {'x': x, 'w': list(w), 'b': list(b), 'z': z, 'h': h[1:], 'deriv': d,
            'grad_h': [abs(v) for v in g],                         # |dL/dh_k|, k = 0..8
            'grad_back': grad_after_valve,                         # valve 8 first
            'nixie': [f'{v:.6f}' for v in grad_after_valve],
            'product': abs(g[0])}


def main():
    x = 1.5
    bound = chain(x, [1.0] * N, [-x] + [-0.5] * (N - 1), 'sigmoid')
    assert all(abs(z) < 1e-12 for z in bound['z'])
    assert abs(bound['product'] - 4.0 ** -8) < 1e-18
    signal = chain(x, [1.0] * N, [0.0] * N, 'sigmoid')
    rng = np.random.default_rng(8)
    random = chain(x, rng.uniform(-1, 1, N).tolist(), rng.normal(0, 1, N).tolist(), 'sigmoid')
    relu = chain(x, [1.0] * N, [0.0] * N, 'relu')
    assert relu['product'] == 1.0
    for name, c in [('bound', bound), ('signal', signal), ('random', random), ('relu', relu)]:
        print(f'  {name:7s} product {c["product"]:.6g}  nixie {c["nixie"]}')
    # σ' maximum check on a dense grid
    zz = np.linspace(-12, 12, 240001)
    smax = float((sig(zz) * (1 - sig(zz))).max())
    assert abs(smax - 0.25) < 1e-9
    save_json('sigmoid_chain.json', {
        'what': '8-valve scalar chains h_k = act(w_k h_{k-1} + b_k); gradient backpropagated from dL/dh_8 = 1',
        'sigma_prime_max': smax, 'bound_4_pow_minus_8': 4.0 ** -8,
        'tube_words': {'8': 'GRADIENTS', '7': 'FADING', '6': 'DOWN', '5': 'TO', '4': 'ZERO'},
        'note': 'grad_back[i] = |dL/dh| after crossing valve 8-i (valve 8 first); nixie = 6-decimal reading. '
                'The film uses `bound` (σ\' = 1/4 at every valve, the best a sigmoid chain can do) so the last nixie reads 0.000015.',
        'bound': bound, 'signal': signal, 'random': random, 'relu': relu,
        'curve': {'z': np.linspace(-6, 6, 121), 'sigma': sig(np.linspace(-6, 6, 121)),
                  'dsigma': sig(np.linspace(-6, 6, 121)) * (1 - sig(np.linspace(-6, 6, 121)))},
    })


if __name__ == '__main__':
    main()
