"""XOR with a 2-2-1 sigmoid MLP, trained by plain backprop in numpy (seed 7) — and proof that one line gets 3/4 at best.

  tools/.venv/bin/python tools/data/xor_mlp.py      -> app/public/data/xor_mlp.json

Network: h = σ(W1 x + b1) (2 hidden units), y = σ(w2·h + b2); binary cross-entropy, full-batch gradient descent
with momentum, init N(0, 1) from np.random.default_rng(7). Coordinates are the unit square: post (x1, x2) in {0,1}².

Consumers: verse1 S1 (9.405-15.861). K1's light sheet = one line (3/4 at best, `ERR 1/4`, the two sheet angles at the
10.79 / 11.71 snares each misclassify a different post); 13.49 the two hidden units' real decision lines; 14.017 the
posts telescope to their real hidden coordinates (h1, h2); deck engraving `2-2-1 · σ · SEED 7`; 15.40 output sheet,
`ERR 0/4`.
"""
import itertools
import math

import numpy as np

from _common import save_json

X = np.array([[0, 0], [0, 1], [1, 0], [1, 1]], float)
Y = np.array([0, 1, 1, 0], float)
SEED = 7


def sig(z):
    return 1 / (1 + np.exp(-z))


def best_line():
    """Exhaustive check: every labelling a line (half-plane) can produce on the 4 corners vs XOR. Returns max correct."""
    best = 0
    # a half-plane w·x + b > 0; sample directions densely and every threshold between projected points
    for k in range(3600):
        a = math.pi * 2 * k / 3600
        w = np.array([math.cos(a), math.sin(a)])
        p = X @ w
        cuts = sorted(set(np.round(p, 9)))
        ths = [cuts[0] - 1] + [(u + v) / 2 for u, v in zip(cuts, cuts[1:])] + [cuts[-1] + 1]
        for th in ths:
            pred = (p > th).astype(float)
            best = max(best, int((pred == Y).sum()))
    return best


def line(w, b):
    """Line w·x + b = 0 in the unit square: normal angle (rad), signed offset, and its two endpoints clipped to [-0.5,1.5]²."""
    n = np.linalg.norm(w)
    ang = math.atan2(w[1], w[0])
    pts = []
    for x in (-0.5, 1.5):  # intersect with x1 = const
        if abs(w[1]) > 1e-12:
            y = -(w[0] * x + b) / w[1]
            if -0.5 <= y <= 1.5:
                pts.append([x, y])
    for y in (-0.5, 1.5):
        if abs(w[0]) > 1e-12:
            x = -(w[1] * y + b) / w[0]
            if -0.5 <= x <= 1.5:
                pts.append([x, y])
    pts = sorted({(round(p[0], 9), round(p[1], 9)) for p in pts})
    return {'w': (w / n).tolist(), 'b': b / n, 'normal_deg': math.degrees(ang), 'ends': [list(p) for p in pts[:2]]}


def train(epochs=4000, lr=1.0, mom=0.9):
    rng = np.random.default_rng(SEED)
    W1 = rng.normal(0, 1, (2, 2))
    b1 = rng.normal(0, 1, 2)
    w2 = rng.normal(0, 1, 2)
    b2 = rng.normal(0, 1)
    init = dict(W1=W1.copy(), b1=b1.copy(), w2=w2.copy(), b2=float(b2))
    v = [np.zeros_like(W1), np.zeros_like(b1), np.zeros_like(w2), 0.0]
    hist, snaps = [], []
    keep = sorted(set([0, 1, 2, 5, 10, 20, 50, 100, 150, 200, 300, 400, 500, 700, 1000, 1500, 2000, 3000, epochs]))
    solved_at = None
    for ep in range(epochs + 1):
        Z1 = X @ W1.T + b1
        H = sig(Z1)
        z2 = H @ w2 + b2
        y = sig(z2)
        loss = float(-np.mean(Y * np.log(y + 1e-12) + (1 - Y) * np.log(1 - y + 1e-12)))
        err = int(((y > 0.5) != (Y > 0.5)).sum())
        if err == 0 and solved_at is None:
            solved_at = ep
        if ep in keep:
            snaps.append({'epoch': ep, 'loss': loss, 'err': err, 'W1': W1.copy(), 'b1': b1.copy(), 'w2': w2.copy(),
                          'b2': float(b2), 'h': H.copy(), 'y': y.copy()})
        if ep % 10 == 0:
            hist.append([ep, loss, err])
        if ep == epochs:
            break
        d2 = (y - Y) / 4                       # dL/dz2 (BCE + sigmoid)
        gw2 = H.T @ d2
        gb2 = d2.sum()
        dH = np.outer(d2, w2) * H * (1 - H)    # dL/dZ1
        gW1 = dH.T @ X
        gb1 = dH.sum(0)
        v[0] = mom * v[0] - lr * gW1; W1 = W1 + v[0]
        v[1] = mom * v[1] - lr * gb1; b1 = b1 + v[1]
        v[2] = mom * v[2] - lr * gw2; w2 = w2 + v[2]
        v[3] = mom * v[3] - lr * gb2; b2 = b2 + v[3]
    return init, snaps, hist, solved_at


def main():
    best = best_line()
    print('  best single line:', best, '/ 4')
    assert best == 3, 'XOR must not be linearly separable'
    init, snaps, hist, solved_at = train()
    fin = snaps[-1]
    print('  solved at epoch', solved_at, ' final loss', round(fin['loss'], 5), ' y', np.round(fin['y'], 4))
    assert fin['err'] == 0
    H = fin['h']
    dmin = min(np.linalg.norm(H[i] - H[j]) for i, j in itertools.combinations(range(4), 2))
    print('  hidden coords', np.round(H, 4), ' min pairwise distance', round(dmin, 4))
    # three single lines for K1's sheet: each wrong on exactly one post (3/4)
    sheets = []
    for wrong, (w, b) in [(3, (np.array([1.0, 1.0]), -0.5)),      # x1 + x2 > 0.5: (1,1) wrong (says 1)
                          (1, (np.array([1.0, -1.0]), -0.5)),     # x1 - x2 > 0.5: (0,1) wrong (says 0)
                          (2, (np.array([-1.0, 1.0]), -0.5)),     # x2 - x1 > 0.5: (1,0) wrong (says 0)
                          (0, (np.array([-1.0, -1.0]), 1.5))]:    # x1 + x2 < 1.5: (0,0) wrong (says 1)
        pred = (X @ w + b > 0).astype(float)
        bad = [int(i) for i in np.nonzero(pred != Y)[0]]
        assert bad == [wrong], (bad, wrong)
        sheets.append({**line(w, b), 'wrong_post': wrong, 'correct': 3, 'label': 'ERR 1/4'})
    hidden_lines = [line(fin['W1'][j], fin['b1'][j]) for j in range(2)]
    out_line_h = line(fin['w2'], fin['b2'])   # in hidden space (h1, h2)

    def pack(s):
        return {'epoch': s['epoch'], 'loss': s['loss'], 'err': s['err'], 'W1': s['W1'], 'b1': s['b1'], 'w2': s['w2'],
                'b2': s['b2'], 'h': s['h'], 'y': s['y']}
    save_json('xor_mlp.json', {
        'what': '2-2-1 sigmoid MLP trained on XOR by backprop (numpy), seed 7',
        'engraving': '2-2-1 · σ · SEED 7',
        'posts': {'x': X, 'label': Y, 'class': ['0 graphite hollow', '1 bone solid', '1 bone solid', '0 graphite hollow']},
        'linear': {'best_correct': best, 'of': 4, 'sheets': sheets,
                   'note': 'exhaustive half-plane search: no line separates XOR; 3/4 is the maximum'},
        'train': {'loss': 'binary cross-entropy', 'optimizer': 'full-batch GD, lr 1.0, momentum 0.9', 'init': 'N(0,1), numpy default_rng(7)',
                  'epochs': fin['epoch'], 'solved_at_epoch': solved_at},
        'init': init,
        'final': pack(fin),
        'hidden': {'coords': H, 'min_pair_distance': dmin,
                   'lines_input_space': hidden_lines,
                   'note': 'unit j fires (h_j > 0.5) on the side where W1[j]·x + b1[j] > 0; posts move to (h1, h2)'},
        'output': {'line_hidden_space': out_line_h, 'y': fin['y'], 'err': fin['err'], 'label': 'ERR 0/4'},
        'snapshots': [pack(s) for s in snaps],
        'loss_curve': hist,
    })


if __name__ == '__main__':
    main()
