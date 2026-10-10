"""Hard-margin linear SVM on the rail yard's data posts (scipy QP), and the kernel scene: an inner square of posts vs an
outer square frame, separated by a flat blade after the explicit lift φ(x) = (x1, x2, x1² + x2²).

  tools/.venv/bin/python tools/data/svm_fit.py      -> app/public/data/svm_fit.json

Linear: posts on a 2 m lattice with a seeded ±0.3 m jitter (a grid, never rings), class A on one side of a slanted line,
class B on the other. The primal QP  min ½‖w‖²  s.t.  y_i (w·x_i + b) ≥ 1  is solved with scipy's SLSQP and checked
against the dual (KKT, α ≥ 0, Σ α y = 0). Exactly 3 support vectors (asserted) — the 3 posts the rails stop on.
Margin = 2 / ‖w‖ (metres) — the dial reads it. The rails are the lines w·x + b = ±1 (30 m long, centred on the yard).

Kernel: 60 posts on a 1.2 m lattice — the inner 4 x 4 block (16) and the perimeter of a 12 x 12 block (44). Pistons
lift each post to z = x1² + x2² (m²; scene scale suggested 0.25 m per m²). A linear hard-margin SVM in φ-space gives
the blade: w ≈ (0, 0, w3) (horizontal, by the square's symmetry), height z* = −b / w3. Engraving:
`φ DRAWN EXPLICITLY · A KERNEL NEVER BUILDS IT`.

Coordinates: board metres in a yard-local frame (x east, z south, origin = the yard centre, world (0, −22)); the scene
may rotate the whole set so the rails run along whatever axis the shot needs.

Consumers: verse1 S4 31.080-34.09 (SVM rails push out to the 3 support posts, dial `2/‖w‖ = x.xx m`; kernel pistons and
the horizontal blade 33.38).
"""
import numpy as np
from scipy.optimize import minimize

from _common import save_json

SEED = 6


def hard_svm(X, y):
    d = X.shape[1]

    def f(p):
        return 0.5 * (p[:d] ** 2).sum()

    def g(p):
        return np.concatenate([p[:d], [0.0]])
    cons = {'type': 'ineq', 'fun': lambda p: y * (X @ p[:d] + p[d]) - 1, 'jac': lambda p: y[:, None] * np.hstack([X, np.ones((len(X), 1))])}
    p0 = np.zeros(d + 1)
    r = minimize(f, p0, jac=g, constraints=[cons], method='SLSQP', options={'ftol': 1e-14, 'maxiter': 2000})
    assert r.success, r.message
    w, b = r.x[:d], r.x[d]
    m = y * (X @ w + b)
    sv = np.nonzero(m < 1 + 1e-6)[0]
    # dual check: solve α on the support set from KKT (w = Σ α y x, Σ α y = 0)
    A = np.vstack([(y[sv, None] * X[sv]).T, y[sv]])
    rhs = np.concatenate([w, [0.0]])
    alpha, *_ = np.linalg.lstsq(A, rhs, rcond=None)
    kkt = float(np.abs(A @ alpha - rhs).max())
    return w, b, sv, alpha, kkt, m


def main():
    rng = np.random.default_rng(SEED)
    # --- linear yard: 2 m lattice, x in [-13, 13], z in [-7, 7]
    gx, gz = np.meshgrid(np.arange(-12, 13, 2.0), np.arange(-6, 7, 2.0))
    P = np.stack([gx.ravel(), gz.ravel()], 1) + rng.uniform(-0.3, 0.3, (gx.size, 2))
    n_true = np.array([0.18, 1.0]); n_true /= np.linalg.norm(n_true)
    s = P @ n_true
    keep = np.abs(s) > 1.6                      # an empty band around the true line
    sel = keep & (rng.random(len(P)) < 0.42)    # sparse posts
    X = P[sel]
    y = np.where(s[sel] > 0, 1.0, -1.0)
    w, b, sv, alpha, kkt, m = hard_svm(X, y)
    margin = 2 / np.linalg.norm(w)
    print(f'  linear: {len(X)} posts ({int((y > 0).sum())} A / {int((y < 0).sum())} B), SVs {sv.tolist()}, '
          f'margin {margin:.3f} m, KKT residual {kkt:.2e}, alpha {np.round(alpha, 4)}')
    assert len(sv) == 3 and (alpha > 0).all()
    nrm = w / np.linalg.norm(w)
    tang = np.array([-nrm[1], nrm[0]])
    c0 = -b * w / (w @ w)                       # closest point of the decision line to the origin
    rails = []
    for sgn in (1, -1):
        c = c0 + sgn * nrm / np.linalg.norm(w)
        rails.append({'side': 'A' if sgn > 0 else 'B', 'center': c, 'a': c - 15 * tang, 'b': c + 15 * tang})
    # --- kernel scene
    sp = 1.2
    inner = [(i, j) for i in np.arange(-1.5, 2, 1.0) for j in np.arange(-1.5, 2, 1.0)]
    outer = [(i, j) for i in np.arange(-5.5, 6, 1.0) for j in np.arange(-5.5, 6, 1.0) if abs(i) == 5.5 or abs(j) == 5.5]
    K = np.array(inner + outer) * sp
    yk = np.array([1.0] * len(inner) + [-1.0] * len(outer))
    Z = (K ** 2).sum(1)
    Phi = np.hstack([K, Z[:, None]])
    wk, bk, svk, ak, kkk, mk = hard_svm(Phi, yk)
    tilt = float(np.degrees(np.arctan2(np.linalg.norm(wk[:2]), abs(wk[2]))))
    zstar = float(-bk / wk[2])
    print(f'  kernel: {len(inner)} inner + {len(outer)} outer, blade z* = {zstar:.3f} m², tilt {tilt:.2e} deg, '
          f'SVs {len(svk)}, margin(φ) {2 / np.linalg.norm(wk):.3f}')
    assert len(inner) + len(outer) == 60 and tilt < 1e-3
    save_json('svm_fit.json', {
        'what': 'hard-margin SVMs solved as a QP (scipy SLSQP, primal) with a KKT/dual check',
        'frame': 'yard-local metres: x east, z south, origin = yard centre (world (0, -22)); rails run along `tangent`',
        'linear': {'posts': X, 'label': y, 'w': w, 'b': b, 'normal': nrm, 'tangent': tang, 'margin_m': margin,
                   'dial': f'2/‖w‖ = {margin:.2f} m', 'support': sv, 'alpha': alpha, 'kkt_residual': kkt,
                   'functional_margin': m, 'rails': rails, 'seed': SEED,
                   'note': 'rails = lines w·x + b = +1 (A) and -1 (B); they start together on w·x + b = 0 and push out'},
        'kernel': {'posts': K, 'label': yk, 'z_m2': Z, 'phi': 'φ(x) = (x1, x2, x1² + x2²)', 'w': wk, 'b': bk,
                   'blade_z_m2': zstar, 'tilt_deg': tilt, 'support': svk, 'margin_phi': 2 / np.linalg.norm(wk),
                   'lattice_m': sp, 'suggested_piston_scale_m_per_m2': 0.25,
                   'engraving': 'φ DRAWN EXPLICITLY · A KERNEL NEVER BUILDS IT'},
    }, sig=6)


if __name__ == '__main__':
    main()
