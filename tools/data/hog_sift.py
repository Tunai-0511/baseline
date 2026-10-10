"""HOG (Dalal & Triggs geometry) and a SIFT descriptor computed on the stele's procedural capsule pedestrian.

  tools/.venv/bin/python tools/data/hog_sift.py      -> app/public/data/hog_sift.json

Figure: a capsule pedestrian (head, neck, shoulders, torso, hips, arms, legs; mid-stride) 96 px tall in a 64 x 128
window. The image HOG/SIFT read is its relief height field (rounded capsules, 4x supersampled), the same relief the
stele carries; the capsule list and the height field are exported so Blender / three.js build exactly that relief.
HOG: centred [-1, 0, 1] gradients, unsigned orientation 0-180°, 9 bins of 20° with linear vote splitting between bin
centres, 8 x 8 px cells (8 x 16 cells), 2 x 2-cell blocks at a 1-cell stride (7 x 15 blocks), L2-Hys block normalisation
(clip 0.2) -> 7·15·36 = 3,780 dims (asserted). `cells` (16 rows x 8 cols x 9) are the un-normalised cell histograms
scaled to max 1 — the 9-ray star carved in each cell; ray b points along the EDGE direction (gradient + 90°),
angle_b = 10° + 20° b + 90°, measured from +x (image right) counter-clockwise with +y UP.
SIFT: one keypoint (the head), 16 x 16 px patch rotated to the dominant orientation (36-bin histogram), Gaussian
weight σ = 8, 4 x 4 subregions x 8 orientation bins with trilinear interpolation, normalise / clip 0.2 / renormalise
-> 128 dims (asserted).

Consumers: verse1 S3 23.47-27.39: stele relief, the 9-way star per 8 x 8 cell, 24.09 the 4 x 4 x 8 arrow star,
engravings `HOG · 8×8 PX CELLS · 9 BINS · 3,780-D`, `SIFT · 4×4×8 = 128-D`.
"""
import math

import numpy as np
from PIL import Image, ImageDraw

from _common import WIP, save_json

WIN_W, WIN_H, SS = 64, 128, 4

# capsules in window pixels (x right, y DOWN, origin top-left of the 64 x 128 window): (x0, y0, x1, y1, radius)
CAPSULES = {
    'head': (32.0, 22.5, 32.0, 23.5, 6.0),
    'neck': (32.0, 28.0, 32.0, 32.0, 2.4),
    'shoulders': (25.5, 35.0, 38.5, 35.0, 3.4),
    'torso': (32.0, 37.0, 31.5, 60.0, 5.6),
    'hips': (28.0, 61.0, 35.0, 61.0, 4.0),
    'arm_l_upper': (24.0, 36.0, 20.0, 51.0, 2.6),
    'arm_l_lower': (20.0, 51.0, 19.0, 65.0, 2.3),
    'arm_r_upper': (40.0, 36.0, 44.5, 50.0, 2.6),
    'arm_r_lower': (44.5, 50.0, 47.5, 63.0, 2.3),
    'leg_l_upper': (28.5, 63.0, 24.5, 88.0, 3.6),
    'leg_l_lower': (24.5, 88.0, 21.5, 111.0, 3.0),
    'foot_l': (21.5, 112.0, 15.5, 113.0, 2.0),
    'leg_r_upper': (35.0, 63.0, 39.0, 88.0, 3.6),
    'leg_r_lower': (39.0, 88.0, 41.5, 111.0, 3.0),
    'foot_r': (41.5, 112.0, 47.5, 113.0, 2.0),
}


def silhouette():
    """Relief height field of the capsule figure, 128 x 64: h = max_c sqrt(r_c² - d_c²) / R (0 outside, rounded inside),
    4x supersampled. HOG/SIFT read this image (a carved relief has gradients inside the figure, not only at its edge)."""
    W, H = WIN_W * SS, WIN_H * SS
    yy, xx = np.mgrid[0:H, 0:W]
    px, py = (xx + 0.5) / SS, (yy + 0.5) / SS
    h = np.zeros((H, W))
    R = max(v[4] for v in CAPSULES.values())
    for x0, y0, x1, y1, r in CAPSULES.values():
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy
        t = np.clip(((px - x0) * dx + (py - y0) * dy) / L2, 0, 1) if L2 > 0 else 0
        d2 = (px - (x0 + t * dx)) ** 2 + (py - (y0 + t * dy)) ** 2
        h = np.maximum(h, np.sqrt(np.clip(r * r - d2, 0, None)) / R)
    return h.reshape(WIN_H, SS, WIN_W, SS).mean((1, 3))


def hog(img):
    gx = np.zeros_like(img)
    gy = np.zeros_like(img)
    gx[:, 1:-1] = img[:, 2:] - img[:, :-2]
    gy[1:-1, :] = img[:-2, :] - img[2:, :]          # +y up
    mag = np.hypot(gx, gy)
    ang = np.degrees(np.arctan2(gy, gx)) % 180.0
    cells = np.zeros((16, 8, 9))
    pos = ang / 20.0 - 0.5
    b0 = np.floor(pos).astype(int)
    w1 = pos - b0
    for cy in range(16):
        for cx in range(8):
            sl = (slice(cy * 8, cy * 8 + 8), slice(cx * 8, cx * 8 + 8))
            m, bb, ww = mag[sl].ravel(), b0[sl].ravel(), w1[sl].ravel()
            np.add.at(cells[cy, cx], bb % 9, m * (1 - ww))
            np.add.at(cells[cy, cx], (bb + 1) % 9, m * ww)
    desc = []
    for by in range(15):
        for bx in range(7):
            v = cells[by:by + 2, bx:bx + 2].ravel()
            v = v / math.sqrt((v ** 2).sum() + 1e-10)
            v = np.minimum(v, 0.2)
            v = v / math.sqrt((v ** 2).sum() + 1e-10)
            desc.append(v)
    desc = np.concatenate(desc)
    return cells, desc, mag, ang


def sift(img, kx, ky, sigma=1.6):
    from scipy.ndimage import gaussian_filter, map_coordinates
    sm = gaussian_filter(img, sigma)
    gx = np.zeros_like(sm)
    gy = np.zeros_like(sm)
    gx[:, 1:-1] = (sm[:, 2:] - sm[:, :-2]) / 2
    gy[1:-1, :] = (sm[:-2, :] - sm[2:, :]) / 2       # +y up
    # dominant orientation: 36-bin histogram in a Gaussian window (σ = 1.5 · 4)
    ys, xs = np.mgrid[-12:13, -12:13]
    wgt = np.exp(-(xs ** 2 + ys ** 2) / (2 * 6.0 ** 2))
    cx = np.clip(kx + xs, 0, img.shape[1] - 1).astype(int)
    cy = np.clip(ky + ys, 0, img.shape[0] - 1).astype(int)
    m = np.hypot(gx[cy, cx], gy[cy, cx]) * wgt
    a = np.degrees(np.arctan2(gy[cy, cx], gx[cy, cx])) % 360
    h36 = np.bincount((a / 10).astype(int).ravel() % 36, m.ravel(), 36)
    k = int(h36.argmax())
    l, r = h36[(k - 1) % 36], h36[(k + 1) % 36]
    off = 0.5 * (l - r) / (l - 2 * h36[k] + r + 1e-12)
    ori = ((k + 0.5 + off) * 10) % 360
    # 16 x 16 patch in the keypoint frame, sampled bilinearly
    th = math.radians(ori)
    c, s = math.cos(th), math.sin(th)
    u = np.arange(16) - 7.5
    U, Vv = np.meshgrid(u, u)                        # U right, V up in the keypoint frame
    X = kx + c * U - s * Vv
    Y = ky - (s * U + c * Vv)                        # image rows go down
    pgx = map_coordinates(gx, [Y, X], order=1)
    pgy = map_coordinates(gy, [Y, X], order=1)
    # rotate gradients into the keypoint frame
    rgx = c * pgx + s * pgy
    rgy = -s * pgx + c * pgy
    mag = np.hypot(rgx, rgy) * np.exp(-(U ** 2 + Vv ** 2) / (2 * 8.0 ** 2))
    an = np.degrees(np.arctan2(rgy, rgx)) % 360
    H = np.zeros((4, 4, 8))
    for i in range(16):
        for j in range(16):
            # trilinear: row (V, top = 0), col (U), orientation
            rb = (7.5 - Vv[i, j]) / 4 - 0.5
            cb = (U[i, j] + 7.5) / 4 - 0.5
            ob = an[i, j] / 45.0
            r0, c0, o0 = int(math.floor(rb)), int(math.floor(cb)), int(math.floor(ob))
            dr, dc, do = rb - r0, cb - c0, ob - o0
            for ri, wr in ((r0, 1 - dr), (r0 + 1, dr)):
                if 0 <= ri < 4:
                    for ci, wc in ((c0, 1 - dc), (c0 + 1, dc)):
                        if 0 <= ci < 4:
                            for oi, wo in ((o0, 1 - do), (o0 + 1, do)):
                                H[ri, ci, oi % 8] += mag[i, j] * wr * wc * wo
    v = H.ravel()
    v = v / (np.linalg.norm(v) + 1e-12)
    v = np.minimum(v, 0.2)
    v = v / (np.linalg.norm(v) + 1e-12)
    return v, ori


def main():
    img = silhouette()
    cells, desc, mag, ang = hog(img)
    assert desc.size == 3780, desc.size
    kx, ky = 32, 23
    sd, ori = sift(img, kx, ky)
    assert sd.size == 128
    cn = cells / cells.max()
    print('  HOG dims', desc.size, ' cells with energy', int((cells.sum(-1) > 1e-3).sum()), '/ 128',
          ' SIFT dims', sd.size, ' keypoint orientation', round(ori, 1))
    # silhouette as a 64 x 128 bit mask (row-major, top row first) for the relief
    mask_rows = [''.join('1' if v > 0.05 else '0' for v in row) for row in img]
    save_json('hog_sift.json', {
        'what': 'HOG and SIFT computed on the procedural capsule pedestrian of the verse1 stele',
        'window': [WIN_W, WIN_H],
        'capsules': {k: {'a': [v[0], v[1]], 'b': [v[2], v[3]], 'r': v[4]} for k, v in CAPSULES.items()},
        'capsule_units': 'window pixels, x right, y DOWN from the window top-left; figure 96 px tall (y 16.8 .. 115.2)',
        'mask': mask_rows,
        'relief': {'rule': 'h = max over capsules of sqrt(r^2 - d^2) / R, R = largest radius; HOG/SIFT input image',
                   'R': max(v[4] for v in CAPSULES.values()), 'height': np.round(img, 3)},
        'hog': {'cell': 8, 'bins': 9, 'unsigned': True, 'block': 2, 'block_stride': 1, 'cells_shape': [16, 8, 9],
                'blocks': [15, 7], 'dims': int(desc.size), 'norm': 'L2-Hys (clip 0.2)',
                'cells': np.round(cn, 4), 'descriptor': np.round(desc, 4),
                'ray_angles_deg': [10 + 20 * b + 90 for b in range(9)],
                'note': 'cells[row][col][bin], row 0 = top of the window; ray b = edge direction 10+20b+90 deg from +x, +y up'},
        'sift': {'keypoint': [kx, ky], 'scale_sigma': 1.6, 'orientation_deg': ori, 'grid': [4, 4], 'bins': 8,
                 'dims': int(sd.size), 'descriptor': np.round(sd, 4),
                 'note': 'descriptor[(row * 4 + col) * 8 + bin], row 0 = top subregion in the keypoint frame, '
                         'bin b = 45b deg relative to the keypoint orientation'},
        'engraving': ['HOG · 8×8 PX CELLS · 9 BINS · 3,780-D', 'SIFT · 4×4×8 = 128-D'],
    }, sig=5)
    # preview: silhouette + HOG stars + SIFT star
    S = 8
    im = Image.new('RGB', (WIN_W * S * 2 + 30, WIN_H * S + 20), (11, 10, 13))
    sil = Image.fromarray((img / img.max() * 120 + 12).astype(np.uint8)).resize((WIN_W * S, WIN_H * S), Image.NEAREST)
    im.paste(sil.convert('RGB'), (10, 10))
    dr = ImageDraw.Draw(im)
    ox = WIN_W * S + 20
    dr.rectangle([ox, 10, ox + WIN_W * S, 10 + WIN_H * S], fill=(16, 15, 19))
    for cy in range(16):
        for cx in range(8):
            ccx, ccy = ox + cx * 8 * S + 4 * S, 10 + cy * 8 * S + 4 * S
            for b in range(9):
                L = math.sqrt(cn[cy, cx, b]) * 4 * S * 0.95
                a = math.radians(10 + 20 * b + 90)
                dx, dy = math.cos(a) * L, -math.sin(a) * L
                dr.line([ccx - dx, ccy - dy, ccx + dx, ccy + dy], fill=(237, 234, 242), width=3)
    for i in range(4):
        for j in range(4):
            ccx, ccy = 10 + (kx - 8 + j * 4 + 2) * S, 10 + (ky - 8 + i * 4 + 2) * S
            for b in range(8):
                L = sd[(i * 4 + j) * 8 + b] * 2 * S * 4.5
                a = math.radians(45 * b + ori)
                dr.line([ccx, ccy, ccx + math.cos(a) * L, ccy - math.sin(a) * L], fill=(200, 200, 210), width=2)
    im.save(WIP / 'hog_sift_preview.png')


if __name__ == '__main__':
    main()
