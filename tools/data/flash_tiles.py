"""FlashAttention's online softmax on real attention inputs: the m and ℓ registers of every row as K/V tiles stream
through SRAM, and proof that the tiled result is exact.

  tools/.venv/bin/python tools/data/flash_tiles.py      -> app/public/data/flash_tiles.json

Q, K, V: layer 0, head 0 of the film Transformer (tools/data/tiny_tf/acts.npz) on the 64 tokens that end with
"FlashAttention tiles it all inside the SRAM" (N = 64, d = 64), causal like the model. Tiles of 16 rows: 4 Q tiles
(they arrive on the 178.21 / 178.66 / 179.12 / 179.57 kicks) x 4 K/V tiles. For each Q tile, the K/V tiles j ≤ i are
visited in order; per row r the registers update
    m' = max(m, rowmax(S_ij)),  ℓ' = e^{m − m'} ℓ + rowsum(e^{S_ij − m'}),  O' = e^{m − m'} O + e^{S_ij − m'} V_j
and O / ℓ at the end equals softmax(S) V. The N x N matrix S is never kept: only m, ℓ, O per row.
max |O_tiled − O_exact| is reported (asserted < 1e-12 in float64).
HBM traffic of the two schedules for the engraved model sizes (elements): standard Θ(Nd + N²) vs Θ(N² d² / M).

Consumers: bridge B2 178.18-179.64 (Q tiles into SRAM macros; each row's two small 7-segments run m and ℓ);
180.68-182.30 `S = QKᵀ (N×N) NEVER WRITTEN TO HBM · EXACT, NOT APPROXIMATE`.
"""
import math

import numpy as np

from _common import TDATA, save_json

B = 16


def main():
    a = np.load(TDATA / 'tiny_tf' / 'acts.npz')
    q = a['flash_q0'][0].astype(np.float64)
    k = a['flash_k0'][0].astype(np.float64)
    v = a['flash_v0'][0].astype(np.float64)
    N, d = q.shape
    scale = 1 / math.sqrt(d)
    S = q @ k.T * scale
    mask = np.triu(np.ones((N, N), bool), 1)
    Sm = np.where(mask, -np.inf, S)
    P = np.exp(Sm - Sm.max(1, keepdims=True))
    O_exact = (P / P.sum(1, keepdims=True)) @ v
    tiles = []
    O = np.zeros((N, d))
    for i in range(N // B):
        rows = slice(i * B, (i + 1) * B)
        m = np.full(B, -np.inf)
        l = np.zeros(B)
        acc = np.zeros((B, d))
        steps = []
        for j in range(i + 1):
            cols = slice(j * B, (j + 1) * B)
            s = q[rows] @ k[cols].T * scale
            if j == i:
                s = np.where(np.triu(np.ones((B, B), bool), 1), -np.inf, s)
            mn = np.maximum(m, s.max(1))
            p = np.exp(s - mn[:, None])
            corr = np.exp(m - mn)
            l = corr * l + p.sum(1)
            acc = corr[:, None] * acc + p @ v[cols]
            m = mn
            steps.append({'kv_tile': j, 'm': m.copy(), 'l': l.copy()})
        O[rows] = acc / l[:, None]
        tiles.append({'q_tile': i, 'steps': steps})
    err = float(np.abs(O - O_exact).max())
    print(f'  N={N} d={d} tiles {N // B}x{N // B}  max |O_tiled - O_exact| = {err:.2e}')
    assert err < 1e-12
    # IO counts for the display (elements), SRAM M = 100 KB of fp16 -> 51,200 elements (A100: 192 KB / SM)
    io = []
    for n in (2048, 1 << 20):
        dd, M = 64, 51200
        io.append({'N': n, 'd': dd, 'M_elements': M, 'standard': n * dd + n * n, 'flash': n * n * dd * dd / M,
                   'ratio': (n * dd + n * n) / (n * n * dd * dd / M)})
    save_json('flash_tiles.json', {
        'what': 'online-softmax registers (m, ℓ) of tiled causal attention on real q/k/v (film Transformer, layer 0 head 0)',
        'N': N, 'd': d, 'tile': B, 'tokens_end': 'FlashAttention tiles it all inside the SRAM',
        'tiles': tiles, 'max_abs_err': err, 'exact': True,
        'S_elements_never_stored': N * N,
        'io_elements': io,
        'bandwidth_TBps': {'SRAM': 19, 'HBM': 1.5},
        'engraving': ['S = QKᵀ (N×N) NEVER WRITTEN TO HBM · EXACT, NOT APPROXIMATE', 'SRAM ≈ 19 TB/s · HBM ≈ 1.5 TB/s'],
        'note': 'tiles[i].steps[j].m / .l = the 16 rows\' registers after K/V tile j (causal: j ≤ i); final O = acc / ℓ',
    }, sig=6)


if __name__ == '__main__':
    main()
