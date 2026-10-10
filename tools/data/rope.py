"""Sinusoidal positions and RoPE: the 8 sine plates, the 8 two-needle dials, and a numeric check that q_m·k_n depends
only on m − n.

  tools/.venv/bin/python tools/data/rope.py      -> app/public/data/rope.json

d = 16 (8 rotation pairs = 8 dials / 8 plates). θ_i = 10000^(−2i/d), i = 0..7: dial 0 turns 1 rad per position (fast),
dial 7 turns 3.16e-4 rad (slow). PE(pos, 2i) = sin(pos θ_i), PE(pos, 2i+1) = cos(pos θ_i).
RoPE rotates each (q_{2i}, q_{2i+1}) pair by m θ_i (and k by n θ_i); V is not rotated.
Check: for seeded q, k, the dot product of rotated q_m and k_n is computed for many (m, n) with the same m − n; the
spread must be at machine precision (asserted), while different offsets give different values.

Consumers: verse3 S2 126.932-129.67: sine plates (SINUSOIDS), dials with q / k needles (ROPE'S, ROTATION; `V: NOT
ROTATED`; `q·k DEPENDS ONLY ON m − n`), `_formula` θᵢ.
"""
import numpy as np

from _common import save_json

D = 16
SEED = 34


def rot(x, pos, theta):
    y = x.copy()
    c, s = np.cos(pos * theta), np.sin(pos * theta)
    y[0::2] = x[0::2] * c - x[1::2] * s
    y[1::2] = x[0::2] * s + x[1::2] * c
    return y


def main():
    i = np.arange(D // 2)
    theta = 10000.0 ** (-2 * i / D)
    rng = np.random.default_rng(SEED)
    q, k = rng.normal(size=D), rng.normal(size=D)
    checks = []
    worst = 0.0
    for off in range(-4, 9):
        vals = [rot(q, m, theta) @ rot(k, m - off, theta) for m in range(max(0, off), 64 + min(0, off))]
        spread = float(np.ptp(vals))
        worst = max(worst, spread)
        checks.append({'m_minus_n': off, 'value': float(vals[0]), 'spread_over_m': spread, 'samples': len(vals)})
    print('  max spread of q_m·k_n over m at fixed m-n:', worst)
    assert worst < 1e-12
    pos = np.arange(64)
    dial_angles = (pos[:, None] * theta[None]) % (2 * np.pi)             # 64 positions x 8 dials (radians)
    xs = np.linspace(0, 63, 256)
    plates = [{'i': int(j), 'omega': float(theta[j]), 'wavelength_pos': float(2 * np.pi / theta[j]),
               'sin': np.sin(xs * theta[j]), 'cos': np.cos(xs * theta[j])} for j in i]
    save_json('rope.json', {
        'what': 'sinusoidal position encoding and RoPE, d = 16 (8 pairs)', 'd': D,
        'theta': theta, 'theta_formula': 'θᵢ = 10000^(−2i/d)',
        'dial_rad_per_position': theta, 'dial_angles': dial_angles,
        'q': q, 'k': k,
        'q_needle': [[float(np.arctan2(rot(q, m, theta)[2 * j + 1], rot(q, m, theta)[2 * j])) for j in i] for m in range(64)],
        'k_needle': [[float(np.arctan2(rot(k, n, theta)[2 * j + 1], rot(k, n, theta)[2 * j])) for j in i] for n in range(64)],
        'invariance': checks, 'max_spread': worst,
        'plates': {'x_pos': xs, 'items': plates},
        'engraving': ['V: NOT ROTATED', 'q·k DEPENDS ONLY ON m − n'],
        'note': 'q_needle[m][j] = angle of the rotated (q_2j, q_2j+1) pair at position m; the q-k angle on dial j is '
                '(m - n) θ_j + const, so two needles advancing together keep their angle',
    }, sig=6)


if __name__ == '__main__':
    main()
