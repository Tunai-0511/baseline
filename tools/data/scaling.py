"""The public compute scaling law only (user decision 2026-10-07: no small-model sweep, no measured points):
L ∝ C^−0.050, the gauge the SCALE monolith's 12 doublings move.

  tools/.venv/bin/python tools/data/scaling.py      -> app/public/data/scaling.json

Per doubling of compute the loss is multiplied by 2^−0.05 = 0.96594 (−3.41 %); after 12 doublings (4,096 x compute,
1 -> 4,096 modules) by 4096^−0.05 = 0.65975. `gauge` lists the relative loss after each doubling.
The fallback nameplate is `EXTRAPOLATED` (Appendix B.1) — there are no measured points to be "beyond".

Consumers: pre4 199.43-204.83 (scaling gauge needle moves 3.4 % per doubling; fitted line extends right).
"""
import numpy as np

from _common import save_json

ALPHA = 0.050


def main():
    k = np.arange(13)
    gauge = 2.0 ** (-ALPHA * k)
    per = 2 ** -ALPHA
    tot = 4096 ** -ALPHA
    assert abs(tot - gauge[-1]) < 1e-15 and abs(per - 0.96594) < 1e-5 and abs(tot - 0.65975) < 1e-5
    print(f'  per doubling x{per:.5f} ({(1 - per) * 100:.2f} % lower), 4096x -> x{tot:.5f}')
    save_json('scaling.json', {
        'what': 'public compute scaling law L ∝ C^-0.050 (no measured points)', 'alpha': ALPHA,
        'per_doubling': per, 'drop_percent_per_doubling': (1 - per) * 100, 'x4096': tot,
        'doublings': 12, 'modules': (2 ** k), 'gauge': gauge,
        'nameplate': 'EXTRAPOLATED', 'formula': 'L ∝ C^−0.050',
    })


if __name__ == '__main__':
    main()
