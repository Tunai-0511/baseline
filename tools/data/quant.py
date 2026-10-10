"""INT4 quantization of the film CNN's real conv2 weights (tools/data/conv1/last.pt, 256 x 48 x 5 x 5 = 307,200 weights).

  tools/.venv/bin/python tools/data/quant.py      -> app/public/data/quant.json

Symmetric absmax, zero-point 0, one scale per output channel (256 channels = the 16 x 16 weight wall):
d_c = m_c / -8 where m_c is the channel's signed weight of largest magnitude (llama.cpp Q4_0 convention, so all 16 codes
-8..7 are reachable), q = clamp(round(w / d_c), -8, 7), w' = q d_c. The per-tensor variant is reported too.

Consumers: verse3 S3 137.18-138.77: `32` on the 16-segment, 256 pillars x 32 bit plates (sign 1 bone, exponent 8 ash,
mantissa 23 graphite), 137.857 / 138.32 kicks shed 14 + 14 plates (7,168 in all), pillar heights snap to the 16 INT4
levels; manim histogram on the instrument screen. Ledger: FP32 = 1/8/23; INT4 has 16 levels; 32 -> 4 bit = memory / 8.
"""
import struct

import numpy as np
import torch

from _common import TDATA, save_json

SEED = 32


def q4(w, d):
    return np.clip(np.round(w / d), -8, 7).astype(np.int64)


def fp32_fields(x):
    u = struct.unpack('<I', struct.pack('<f', float(x)))[0]
    return {'hex': f'{u:08X}', 'sign': u >> 31, 'exp': (u >> 23) & 0xFF, 'mant': u & 0x7FFFFF,
            'bits': f'{u:032b}'}


def main():
    ck = torch.load(TDATA / 'conv1' / 'last.pt', map_location='cpu')
    W = ck['state']['body.1.0.weight'].float().numpy().astype(np.float64)   # 256 x 48 x 5 x 5
    C = W.shape[0]
    flat = W.reshape(C, -1)
    # per-channel signed absmax scale
    idx = np.abs(flat).argmax(1)
    m = flat[np.arange(C), idx]
    d = m / -8.0
    Q = q4(flat, d[:, None])
    deq = Q * d[:, None]
    err = flat - deq
    sqnr = 10 * np.log10((flat ** 2).sum() / (err ** 2).sum())
    hist = np.bincount((Q + 8).ravel(), minlength=16)
    # per-tensor variant
    mt = flat.ravel()[np.abs(flat).argmax()]
    dt = mt / -8.0
    Qt = q4(flat, dt)
    errt = flat - Qt * dt
    sqnr_t = 10 * np.log10((flat ** 2).sum() / (errt ** 2).sum())
    hist_t = np.bincount((Qt + 8).ravel(), minlength=16)
    # the 256 pillars: one weight per output channel at a fixed seeded tap
    rng = np.random.default_rng(SEED)
    tap = rng.integers(0, flat.shape[1], C)
    pw = flat[np.arange(C), tap]
    pq = Q[np.arange(C), tap]
    pillars = []
    for c in range(C):
        f = fp32_fields(np.float32(pw[c]))
        pillars.append({'c': c, 'row': c // 16, 'col': c % 16, 'tap': int(tap[c]), 'w': float(pw[c]), 'q': int(pq[c]),
                        'deq': float(pq[c] * d[c]), 'scale': float(d[c]), 'hex': f['hex'], 'sign': f['sign'],
                        'exp': f['exp'], 'mant': f['mant'], 'q4': f'{int(pq[c]) & 0xF:04b}'})
    print('  per-channel histogram (codes -8..7):', hist.tolist(), f' SQNR {sqnr:.2f} dB')
    print('  per-tensor  histogram (codes -8..7):', hist_t.tolist(), f' SQNR {sqnr_t:.2f} dB')
    print('  pillar codes histogram:', np.bincount(pq + 8, minlength=16).tolist())
    n = flat.size
    assert n == 307200 and hist.sum() == n
    assert len(set(Q.ravel().tolist())) == 16, 'all 16 INT4 codes are used'
    save_json('quant.json', {
        'what': 'INT4 (symmetric absmax, per output channel) quantization of the film CNN conv2 weights',
        'source': 'tools/data/conv1/last.pt body.1.0.weight (conv2, 256 x 48 x 5 x 5, 2 groups)',
        'n_weights': n, 'channels': C,
        'fp32': {'sign': 1, 'exponent': 8, 'mantissa': 23},
        'int4': {'levels': 16, 'codes': list(range(-8, 8)), 'rule': 'd = m / -8 (m = signed largest-magnitude weight), q = clamp(round(w / d), -8, 7)'},
        'memory': {'fp32_bytes': n * 4, 'int4_bytes': n // 2, 'ratio': 8, 'scales_bytes_fp16': C * 2},
        'per_channel': {'hist': hist, 'hist_frac': hist / n, 'sqnr_db': sqnr, 'mse': float((err ** 2).mean()),
                        'scale': d},
        'per_tensor': {'hist': hist_t, 'hist_frac': hist_t / n, 'sqnr_db': sqnr_t, 'scale': float(dt)},
        'pillars': pillars,
        'plates': {'per_pillar': 32, 'kept': 4, 'shed_per_kick': 14, 'kicks': [137.857, 138.32], 'total_shed': 256 * 28},
        'weight_range': [float(flat.min()), float(flat.max())],
    })


if __name__ == '__main__':
    main()
