#!/usr/bin/env python3
"""gates.py — the p1v4 GATE RUNNER's analyzer (owner: tooling; KITS §22). The director's measurements, one command.

  bun scripts/render.ts gates --shots C3 [--fast] | --from 53.5 --to 57 [--fast]     ← what builders run
      renders the window in the app and streams every frame + the page's per-frame lyric / label / depth data in here
  tools/.venv/bin/python app/scripts/gates.py video <mp4> --vt0 <song t of frame 0> --from a --to b --out dir
      [--fps 60|30] [--half] [--meta end.json | --static]       an encoded video (calibration: --static = the slice's
      cuts / hits as director review 3 marked them; no page data → the lyric, key-pool, label and seam gates are n/a)
  tools/.venv/bin/python app/scripts/gates.py calib --out dir     pdoom sheet tiles + review-3 stills (busy.py parity)

stream protocol (stdin): records b'GF01' + uint32 LE header length + header JSON (+ header['bytes'] raw rgb24 pixels,
bottom-up rows when header['flip']); a header with "end": true carries the run's meta and closes the stream.

Per frame (full 1920x1080, or 960x540 with --half; 640x360 where the director's tools work at 640x360):
  luma p2 p99      display luma Y' = .2126 R' + .7152 G' + .0722 B' of the sRGB frame (mean, 2nd / 99th percentile)
  murk%            colorstat's grey veil (480x270, ~52 px neighbourhood: no black, no highlight, little colour)
  hot cast pink pale haze bone   colorstat.magenta() every 0.1 s (pink px scaled to full res)
  edge top5 gray   busy.py exactly: Canny(60,150) density, luminance share of the brightest 5 % px, mean BT.601 gray (640x360)
  a* b*            CIELAB (D65) medians of the near-neutral pixels (C* < 10, 12 < L* < 90): the purple cast
  pools            the largest group of identical soft light pools (appearance NCC ≥ 0.85, size / level / colour alike)
  key              the brightest area (display luma blurred 0.03 W) is at the machine of the word being sung
  flecks           compact flat white blobs (Y' ≥ 0.8, S ≤ 0.3, plateau, dark ring, unpacked) with no rigid twin in the
                   previous nor the next frame after flow compensation: paper confetti / flat spark quads, not pins or LEDs
  flow (pair)      flow.py exactly (DIS medium on the 640x360 BT.601 gray, σ 1; video mode decodes it as flow.py does):
                   med_all med_tex cam roll zoom resid mad; + bg (median outside the lyric faces), p98, fgblob (largest
                   connected region ≥ max(2 W/s, 3 × median)), fgnear (page: 1–4 m depth band moving ≥ max(1, 2 × median))
  faces            per lyric face the page projects (state current / sung / old / unsung): glyph p90 display luma, WCAG
                   contrast vs the ring, letter energy (stems along the reading direction × cap / range: ~3–7 on letters)
  labels           per non-lyric text the page projects (registered, fab_* objects, board designators): readable =
                   cap ≥ 14 px, contrast > 1.5 : 1, letter energy ≥ 1.5
Run level: shots from the cuts, sections, hits (impact rows), downbeats (a whip per bar), seams (designed handoffs),
cutqa (ghosts), perf (p95 + the zz_look2 ratio). Thresholds: scripts/gates.json.
"""
import argparse, json, math, os, struct, subprocess, sys, time
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
sys.path.insert(0, HERE)
import colorstat as CS  # noqa: E402  (murk / magenta: the very numbers colorstat.py reports)

CFG = json.load(open(os.path.join(HERE, 'gates.json')))
TL, TF, TY, TI, TC = CFG['light'], CFG['flight'], CFG['lyrics'], CFG['impacts'], CFG['cuts']
W709 = np.array([0.2126, 0.7152, 0.0722], np.float32)
SW, SH = 640, 360          # the director's analysis size (flow.py, busy.py)
FW, FH = 1920, 1080        # logical frame (page coordinates)
FONT = '/System/Library/Fonts/Menlo.ttc'
LEVEL_RANK = {'S': 0, 'M': 1, 'L': 2, 'XL': 3, 'XXL': 4}

_c8 = np.arange(256) / 255.0
_lin8 = np.where(_c8 <= 0.04045, _c8 / 12.92, ((_c8 + 0.055) / 1.055) ** 2.4).astype(np.float32)  # sRGB byte -> linear


def lum_rel(rgb8):
    """WCAG relative luminance of uint8 sRGB pixels (... x 3)."""
    return _lin8[rgb8[..., 0]] * 0.2126 + _lin8[rgb8[..., 1]] * 0.7152 + _lin8[rgb8[..., 2]] * 0.0722


def lab_of(rgb8):
    """CIELAB (D65) of uint8 sRGB pixels: L 0..100, a, b."""
    lin = np.stack([_lin8[rgb8[..., i]] for i in range(3)], -1)
    M = np.array([[0.4124564, 0.3575761, 0.1804375], [0.2126729, 0.7151522, 0.0721750], [0.0193339, 0.1191920, 0.9503041]], np.float32)
    xyz = lin @ M.T / np.array([0.95047, 1.0, 1.08883], np.float32)
    f = np.where(xyz > 216 / 24389, np.cbrt(xyz), (24389 / 27 * xyz + 16) / 116)
    return 116 * f[..., 1] - 16, 500 * (f[..., 0] - f[..., 1]), 200 * (f[..., 1] - f[..., 2])


def pctl(x, qs):
    """np.percentile (linear) via partition: same numbers, ~3x faster on 2 M values."""
    x = x.ravel(); n = x.size
    ks = [(n - 1) * q / 100.0 for q in qs]
    idx = sorted({int(math.floor(k)) for k in ks} | {min(n - 1, int(math.floor(k)) + 1) for k in ks})
    part = np.partition(x, idx)
    out = []
    for k in ks:
        lo = int(math.floor(k)); hi = min(n - 1, lo + 1)
        out.append(float(part[lo] + (part[hi] - part[lo]) * (k - lo)))
    return out


# ================================================================ per-frame light


def hot_pct(rgb):
    """colorstat's bright-magenta share (hue 315–350°, S > 0.55, V > 0.6) in integer maths: cheap enough for every frame.
    With R the max channel: hue = 360 − 60 (B − G) / d, so 315–350° ⇔ d/6 ≤ B − G ≤ 3d/4 (d = max − min)."""
    r, g, b = (rgb[..., k].astype(np.int16) for k in range(3))
    mx = np.maximum(np.maximum(r, g), b)
    d = mx - np.minimum(np.minimum(r, g), b)
    bg = b - g
    m = (mx == r) & (bg > 0) & (6 * bg >= d) & (4 * bg <= 3 * d) & (r > 153) & (d * 100 > 55 * mx)
    return float(m.mean() * 100)


def light_small(small):
    """busy.py (edge density, top-5 % share, gray) + the neutral cast, on the 640x360 frame (uint8 RGB)."""
    g = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    edge = float((cv2.Canny(g, 60, 150) > 0).mean())
    Y = g.astype(np.float32) / 255
    s = np.sort(Y.ravel())[::-1]
    top5 = float(s[: len(s) // 20].sum() / max(1e-6, s.sum()))
    f3 = small.astype(np.float32) / 255
    hsv = cv2.cvtColor(f3, cv2.COLOR_RGB2HSV)  # H 0..360, S, V 0..1 (colorstat's hot: 315–350°, S > .55, V > .6)
    hot = float(((hsv[..., 0] >= 315) & (hsv[..., 0] <= 350) & (hsv[..., 1] > 0.55) & (hsv[..., 2] > 0.6)).mean() * 100)
    L, A, B = lab_of(small)
    C = np.hypot(A, B)
    lo, hi = TL['neutral_L']
    sel = (C < TL['neutral_chroma']) & (L > lo) & (L < hi)
    n = float(sel.mean())
    a = float(np.median(A[sel])) if n > 0.01 else None
    b = float(np.median(B[sel])) if n > 0.01 else None
    return {'edge': round(edge, 4), 'top5': round(top5, 4), 'gray': round(float(Y.mean()), 4), 'hot_s': round(hot, 3),
            'lab_a': None if a is None else round(a, 2), 'lab_b': None if b is None else round(b, 2), 'neutral': round(n, 3)}


def pool_feats(small, excl=None):
    """Soft bright features (band-pass humps: light pools, lamp heads, glows) at 640x360 with an appearance descriptor."""
    f = small.astype(np.float32) / 255
    Y = f @ W709
    Y2 = cv2.GaussianBlur(Y, (0, 0), 2.0)
    D = Y2 - cv2.GaussianBlur(Y, (0, 0), 12.0)
    m = ((D > 0.05) & (Y2 > 0.18)).astype(np.uint8)
    if excl is not None:
        m[excl] = 0
    Y1 = cv2.GaussianBlur(Y, (0, 0), 1.0)
    G = np.hypot(cv2.Sobel(Y1, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(Y1, cv2.CV_32F, 0, 1, ksize=3)) / 8
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, connectivity=8)
    out = []
    for k in range(1, n):
        x, y, w, h, a = (int(v) for v in st[k])
        if a < 30 or a > 1500 or max(w, h) / max(1, min(w, h)) > 2.6:
            continue
        sub = lab[y:y + h, x:x + w] == k
        if float((G[y:y + h, x:x + w][sub] > 0.06).mean()) > 0.35:
            continue  # sharp-edged (letters, panels, bolts): not a pool
        patch = cv2.resize(np.where(sub, Y2[y:y + h, x:x + w], 0).astype(np.float32), (12, 12), interpolation=cv2.INTER_AREA)
        v = patch - patch.mean(); nv = float(np.linalg.norm(v))
        if nv < 1e-4:
            continue
        col = f[y:y + h, x:x + w][sub].mean(0)
        out.append({'x': float(cen[k][0]), 'y': float(cen[k][1]), 'w': w, 'h': h, 'a': a, 'pk': float(Y2[y:y + h, x:x + w][sub].mean()),
                    'desc': (v / nv).ravel(), 'chrom': col / max(float(col.sum()), 1e-6)})
    return out


def pool_group(P):
    """Largest group of identical pools (union-find over: appearance NCC ≥ 0.85, size ±30 %, level ±0.08, colour ±0.04)."""
    n = len(P); par = list(range(n))

    def fd(i):
        while par[i] != i:
            par[i] = par[par[i]]; i = par[i]
        return i
    for i in range(n):
        for j in range(i + 1, n):
            a, b = P[i], P[j]
            if abs(0.5 * math.log(a['a'] / b['a'])) > 0.3 or abs(a['pk'] - b['pk']) > 0.08 or float(np.abs(a['chrom'] - b['chrom']).sum()) > 0.04:
                continue
            if float(a['desc'] @ b['desc']) < 0.85:
                continue
            par[fd(i)] = fd(j)
    cl = {}
    for i in range(n):
        cl.setdefault(fd(i), []).append(i)
    best = max(cl.values(), key=len) if cl else []
    return [{'x': round(P[i]['x'], 1), 'y': round(P[i]['y'], 1), 'r': round(0.5 * max(P[i]['w'], P[i]['h']), 1)} for i in best]


def flecks_static(Yd, S, scale, excl=None):
    """Compact flat white blobs (candidates for paper confetti / flat spark quads) at the analysis resolution.
    Returns (flecks, pool): the filtered flecks and every compact bright blob (the twin pool of the temporal test: a
    rigid feature must find its twin even where the other frame's filters dropped it), [(x, y, w, h, area)] in analysis px."""
    m = ((Yd >= 0.80) & (S <= 0.30)).astype(np.uint8)
    if excl is not None:
        m[excl] = 0
    n, lab, st, cen = cv2.connectedComponentsWithStats(m, connectivity=8)
    a0, a1 = 20 * scale * scale, 400 * scale * scale
    pad = max(2, int(round(3 * scale)))
    k3 = np.ones((2 * pad + 1, 2 * pad + 1), np.uint8)
    fl, pool = [], []
    for k in range(1, n):
        x, y, w, h, a = (int(v) for v in st[k])
        if a < 0.5 * a0 or a > 2 * a1:
            continue
        pool.append((float(cen[k][0]), float(cen[k][1]), w, h, a))
        if a < a0 or a > a1 or a / (w * h) < 0.40:
            continue
        sub = lab[y:y + h, x:x + w] == k
        mo = cv2.moments(sub.astype(np.uint8), binaryImage=True)
        mu20, mu02, mu11 = mo['mu20'] / a, mo['mu02'] / a, mo['mu11'] / a
        tr, det = mu20 + mu02, mu20 * mu02 - mu11 * mu11
        d = math.sqrt(max(0.0, tr * tr / 4 - det))
        if math.sqrt((tr / 2 + d) / max(tr / 2 - d, 1e-6)) > 3.0:
            continue  # elongated: a streak, a segment, an edge
        vals = Yd[y:y + h, x:x + w][sub]
        if float((vals >= 0.9 * vals.max()).mean()) < 0.5:
            continue  # peaked (a glint), not a flat plateau
        Y0, Y1, X0, X1 = max(0, y - pad), min(Yd.shape[0], y + h + pad), max(0, x - pad), min(Yd.shape[1], x + w + pad)
        reg = (lab[Y0:Y1, X0:X1] == k).astype(np.uint8)
        ring = cv2.dilate(reg, k3) & (1 - reg)
        rv = Yd[Y0:Y1, X0:X1][ring > 0]
        if not rv.size or float(np.median(rv)) / max(float(vals.mean()), 1e-4) > 0.55:
            continue  # not isolated against a darker surround
        # inside a field of bright structure (the slivers of a lit floor between pins, a lattice of lamps): a fragment of a
        # surface seen through parallax, not a piece floating in the air — bright share of the annulus 1.5 … 4 radii
        cx, cy = float(cen[k][0]), float(cen[k][1])
        rr = 0.5 * math.hypot(w, h)
        r0, r1 = max(3 * scale, 1.5 * rr), max(8 * scale, 4.0 * rr)
        X0, X1, Y0, Y1 = max(0, int(cx - r1)), min(Yd.shape[1], int(cx + r1) + 1), max(0, int(cy - r1)), min(Yd.shape[0], int(cy + r1) + 1)
        yy, xx = np.mgrid[Y0:Y1, X0:X1]
        dd = (xx - cx) ** 2 + (yy - cy) ** 2
        ann = (dd >= r0 * r0) & (dd <= r1 * r1)
        if ann.any() and float((Yd[Y0:Y1, X0:X1][ann] >= 0.8).mean()) >= 0.03:
            continue
        fl.append((cx, cy, w, h, a))
    # display segments / dot matrices / letter bevels come packed: drop flecks with ≥ 2 neighbours within 2.5 sizes
    keep = []
    for i, p in enumerate(fl):
        r = 2.5 * max(p[2], p[3])
        if sum(1 for j, q in enumerate(fl) if j != i and (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 < r * r) <= 1:
            keep.append(p)
    return keep, pool


def flecks_free(cur, other, flow, scale, sign):
    """The flecks of `cur` without a rigid twin in the neighbouring frame `other`: the flow-compensated position
    (sign −1: `other` is the previous frame and `flow` maps it to `cur`; +1: `other` is the next frame and `flow`
    maps `cur` to it) holds no fleck of similar size. Rigid speculars (pin tops, bolts, display dots) keep their twin
    on both sides — an LED that switches on has one in the next frame, one that switches off in the previous —
    while a particle has none on either side."""
    if other is None or flow is None:
        return cur
    k = SW / (FW * scale)  # analysis px -> 640x360 px
    out = []
    for p in cur:
        sx, sy = min(SW - 1, max(0, int(p[0] * k))), min(SH - 1, max(0, int(p[1] * k)))
        fx, fy = float(flow[sy, sx, 0]) / k, float(flow[sy, sx, 1]) / k
        qx, qy = p[0] + sign * fx, p[1] + sign * fy
        r = max(6 * scale, 0.6 * max(p[2], p[3]))
        twin = any((q[0] - qx) ** 2 + (q[1] - qy) ** 2 < r * r and 0.4 < q[4] / p[4] < 2.5 for q in other)
        if not twin:
            out.append(p)
    return out


# ================================================================ optical flow (flow.py, verbatim maths)


class Flow:
    def __init__(self, fps):
        self.fps = fps
        self.dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
        self.prev = None
        self.gy, self.gx = np.mgrid[8:SH:16, 8:SW:16]
        self.ctrl = np.array([[0, 0], [SW - 1, 0], [0, SH - 1], [SW - 1, SH - 1], [SW / 2, SH / 2]], np.float32)
        self.ix = np.arange(SW, dtype=np.float32)[None, :]
        self.iy = np.arange(SH, dtype=np.float32)[:, None]

    def step(self, small, mask=None, band=None):
        """small: 640x360 RGB uint8; mask: lyric faces (excluded from bg); band: the page's 1–4 m depth band at 640x360.
        Returns (metrics of the pair prev -> this, flow field or None)."""
        gray = cv2.GaussianBlur(cv2.cvtColor(small, cv2.COLOR_RGB2GRAY), (0, 0), 1.0)
        prev, self.prev = self.prev, gray
        if prev is None:
            return None, None
        flow = self.dis.calc(prev, gray, None)
        mag = np.hypot(flow[..., 0], flow[..., 1])
        gxs = cv2.Sobel(prev, cv2.CV_32F, 1, 0, ksize=3)
        gys = cv2.Sobel(prev, cv2.CV_32F, 0, 1, ksize=3)
        tex = np.hypot(gxs, gys) > 40.0
        k = self.fps / SW
        r = {'med_all': round(float(np.median(mag)) * k, 4), 'med_tex': round(float(np.median(mag[tex])) * k, 4) if tex.sum() > 500 else None,
             'tex_frac': round(float(tex.mean()), 3)}
        warped = cv2.remap(prev, (self.ix - flow[..., 0]).astype(np.float32), (self.iy - flow[..., 1]).astype(np.float32), cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        r['resid'] = round(float(np.abs(warped.astype(np.float32) - gray.astype(np.float32)).mean()), 2)
        r['mad'] = round(float(np.abs(prev.astype(np.float32) - gray.astype(np.float32)).mean()), 2)
        sel = tex[self.gy, self.gx]
        src = np.stack([self.gx[sel], self.gy[sel]], -1).astype(np.float32)
        if len(src) >= 12:
            d = flow[self.gy[sel], self.gx[sel]]
            M, inl = cv2.estimateAffinePartial2D(src, src + d, method=cv2.RANSAC, ransacReprojThreshold=1.5, maxIters=2000, confidence=0.99)
            if M is not None:
                pc = (self.ctrl @ M[:, :2].T) + M[:, 2]
                r['cam'] = round(float(np.linalg.norm(pc - self.ctrl, axis=1).mean()) * k, 4)
                a, b = M[0, 0], M[1, 0]
                r['roll'] = round(float(np.degrees(np.arctan2(b, a))) * self.fps, 2)
                r['zoom'] = round((float(np.hypot(a, b)) - 1.0) * 100 * self.fps, 2)
                r['inl'] = round(float(inl.mean()), 3)
                ctr = (np.array([SW / 2, SH / 2], np.float32) @ M[:, :2].T) + M[:, 2] - np.array([SW / 2, SH / 2], np.float32)
                r['vx'], r['vy'] = round(float(ctr[0]) * k, 4), round(float(ctr[1]) * k, 4)
        mk = mag * k
        r['p98'] = round(float(np.percentile(mk, 98)), 3)
        fast = (mk >= max(TF['fg_flow_ws'], 3 * r['med_all'])).astype(np.uint8)
        r['fgflow'] = round(float(fast.mean()), 4)
        # the largest connected fast region: a structure sweeping past the lens, not scattered sparks / LEDs switching
        nb, _, st, _ = cv2.connectedComponentsWithStats(cv2.morphologyEx(fast, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)), connectivity=8)
        r['fgblob'] = round(float(st[1:, cv2.CC_STAT_AREA].max()) / (SW * SH), 4) if nb > 1 else 0.0
        r['bg'] = round(float(np.median(mk[~mask])), 4) if mask is not None and (~mask).sum() > 1000 else r['med_all']
        if band is not None:
            # a foreground WIPE: geometry 1–4 m from the lens that moves across the frame (≥ 1 W/s and 2× the median),
            # not a near subject the camera is locked on
            r['fgnear'] = round(float((band & (mk >= max(1.0, 2 * r['med_all']))).mean()), 4)
        return r, flow


# ================================================================ faces / labels on pixels


def poly_measure(rgb, quad, scale, ring_px, cap=None):
    """Glyph region = the face quad (logical px: baseline-left, baseline-right, cap-right, cap-left); ring = the band
    ring_px around it. Returns (p90 display luma inside, WCAG contrast p90(inside) vs median(ring), inside px, letter
    energy) or None when < 40 px of it are on screen. Letter energy = mean |dY'/ds| along the reading direction in the
    middle 60 % of the cap band × cap px / (p90 − p10 of Y' there): ~3–7 where letters are drawn (each letter brings
    stems), < 1 on a blank face or under a horizontal light strip."""
    H, W = rgb.shape[:2]
    q = np.array(quad, np.float32) * scale
    x0, y0 = np.floor(q.min(0) - ring_px - 2).astype(int)
    x1, y1 = np.ceil(q.max(0) + ring_px + 2).astype(int)
    X0, Y0, X1, Y1 = max(0, x0), max(0, y0), min(W, x1), min(H, y1)
    if X1 - X0 < 3 or Y1 - Y0 < 3:
        return None
    m = np.zeros((Y1 - Y0, X1 - X0), np.uint8)
    cv2.fillPoly(m, [np.round(q - [X0, Y0]).astype(np.int32)], 1)
    if m.sum() < 40:
        return None
    rr = max(1, int(round(ring_px)))
    big = cv2.dilate(m, np.ones((2 * rr + 1, 2 * rr + 1), np.uint8))
    gap = cv2.dilate(m, np.ones((5, 5), np.uint8))
    ring = (big > 0) & (gap == 0)
    sub = rgb[Y0:Y1, X0:X1]
    inside = sub[m > 0]
    yd = (inside.astype(np.float32) / 255) @ W709
    p90 = float(np.percentile(yd, 90))
    con = None
    if ring.sum() >= 20:
        Lg = float(np.percentile(lum_rel(inside), 90))
        Lb = float(np.median(lum_rel(sub[ring])))
        con = (Lg + 0.05) / (Lb + 0.05)
    # letter energy: the face's own frame (u along the baseline, v up the cap), stems = gradient along u
    letter = None
    u = q[1] - q[0]; v = q[3] - q[0]
    lu = float(np.hypot(*u))
    det = float(u[0] * v[1] - u[1] * v[0])
    if lu > 4 and abs(det) > 1e-3:
        Ys = (sub.astype(np.float32) / 255) @ W709
        gx = cv2.Sobel(Ys, cv2.CV_32F, 1, 0, ksize=3) / 8
        gy = cv2.Sobel(Ys, cv2.CV_32F, 0, 1, ksize=3) / 8
        d = np.abs(gx * (u[0] / lu) + gy * (u[1] / lu))
        yy, xx = np.mgrid[Y0:Y1, X0:X1].astype(np.float32)
        dx, dy = xx - q[0][0], yy - q[0][1]
        b = (u[0] * dy - u[1] * dx) / det
        band = (m > 0) & (b >= 0.2) & (b <= 0.8)
        if band.sum() >= 20:
            vals = Ys[band]
            rng = float(np.percentile(vals, 90) - np.percentile(vals, 10))
            c = float(cap) * scale if cap else float(np.hypot(*v))
            letter = float(d[band].mean()) * c / max(0.02, rng)
    return p90, con, int(m.sum()), letter


# ================================================================ the run


class Run:
    def __init__(self, out, fps, half, mag_step, label=''):
        self.out = out; self.fps = fps; self.half = half; self.label = label
        self.scale = 0.5 if half else 1.0
        self.mag_every = max(1, int(round(mag_step * fps)))
        self.flow = Flow(fps)
        self.frames = []
        self.thumbs = {}
        self.small_y = []      # 160x90 display luma per frame (cut rhyme)
        self.prev_flecks = None
        self.pending = None    # (frame index, flecks without a backward twin): its forward test runs on the next frame
        self.t_light = self.t_flow = self.t_misc = 0.0
        os.makedirs(out, exist_ok=True)

    # ---------------------------------------------------------------- one frame
    def add(self, rgb, t, meta=None, small_flow=None):
        """rgb: H x W x 3 uint8 top-down at the analysis resolution (full or half). small_flow: the 640x360 frame for the
        optical flow when it comes from elsewhere (video mode: ffmpeg's area scaler, exactly as the director's flow.py)."""
        i = len(self.frames)
        meta = meta or {}
        t0 = time.perf_counter()
        a = rgb.astype(np.float32) * (1 / 255)
        Yd = a @ W709
        p2, p99 = pctl(Yd, [2, 99])
        fr = {'i': i, 't': round(t, 4), 'luma': round(float(Yd.mean()), 4), 'p2': round(p2, 4), 'p99': round(p99, 4)}
        img = Image.fromarray(rgb)
        fr['murk'] = round(CS.murk(img), 1)
        fr['hot'] = round(hot_pct(rgb), 3)
        if i % self.mag_every == 0:
            m = CS.magenta(a)
            k = 1 / (self.scale * self.scale)
            fr['mag'] = {'hot': m['hot%'], 'cast': m['cast%'], 'pink': int(round(m['pink_px'] * k)), 'pale': m['pale%'], 'haze': m['haze%'], 'bone': m['bone%']}
        small = cv2.resize(rgb, (SW, SH), interpolation=cv2.INTER_AREA)
        fr.update(light_small(small))
        # lyric faces (page) -> masks in 640x360 and in analysis px
        faces = [f for f in meta.get('faces', []) if f.get('on') and f.get('q')]
        smask = np.zeros((SH, SW), bool)
        amask = np.zeros(rgb.shape[:2], np.uint8)
        for f in faces:
            q = np.array(f['q'], np.float32)
            cv2.fillPoly(amask, [np.round(q * self.scale).astype(np.int32)], 1)
        for L in meta.get('labels', []):
            if L.get('on') and L.get('q'):
                cv2.fillPoly(amask, [np.round(np.array(L['q'], np.float32) * self.scale).astype(np.int32)], 1)
        if amask.any():
            amask = cv2.dilate(amask, np.ones((9, 9), np.uint8))
            smask = cv2.resize(amask, (SW, SH), interpolation=cv2.INTER_NEAREST) > 0
        P = pool_feats(small, smask if smask.any() else None)
        fr['pools'] = pool_group(P)
        self.t_light += time.perf_counter() - t0
        t1 = time.perf_counter()
        band = None
        fgm = (meta.get('fg') or {}).get('m')
        if fgm:
            bits = np.unpackbits(np.frombuffer(__import__('base64').b64decode(fgm), np.uint8))[: 96 * 54].reshape(54, 96)
            band = cv2.resize(bits, (SW, SH), interpolation=cv2.INTER_NEAREST) > 0
            meta['fg'] = {k: v for k, v in meta['fg'].items() if k != 'm'}
        fl, flow = self.flow.step(small if small_flow is None else small_flow, smask if smask.any() else None, band)
        if fl:
            fr.update(fl)
        self.t_flow += time.perf_counter() - t1
        t2 = time.perf_counter()
        # flecks (free-flying flat white blobs): no rigid twin in the previous frame (now) nor in the next one (decided
        # when the next frame arrives; the window's last frame keeps the one-sided count)
        mx, mn = a.max(-1), a.min(-1)
        S = (mx - mn) / np.maximum(mx, 1e-4)
        cur, pool = flecks_static(Yd, S, self.scale, amask > 0 if amask.any() else None)
        back = flecks_free(cur, self.prev_flecks, flow, self.scale, -1)
        if self.pending is not None:
            j, pb = self.pending
            both = flecks_free(pb, pool, flow, self.scale, +1) if fl is not None else pb
            self.frames[j]['flecks'] = len(both)
            self.frames[j]['fleck_xy'] = [(round(p[0] / self.scale), round(p[1] / self.scale)) for p in both[:60]]
        self.pending = (i, back)
        self.prev_flecks = pool
        fr['flecks'] = len(back)
        fr['fleck_xy'] = [(round(p[0] / self.scale), round(p[1] / self.scale)) for p in back[:60]]
        # key pool: the brightest area vs the machine of the word being sung
        cur_faces = [f for f in faces if f.get('state') == 'current']
        if cur_faces:
            fr['key'] = self.key_pool(small, cur_faces)
        # faces: glyph luma / contrast
        fm = []
        for f in faces:
            ring = max(6.0, 0.35 * float(f.get('cap') or 10)) * self.scale
            r = poly_measure(rgb, f['q'], self.scale, ring, f.get('cap'))
            if r is None:
                continue
            fm.append({'id': f['id'], 'k': f.get('k', 0), 'text': f.get('text', ''), 'word': f.get('word'), 'state': f.get('state'), 'cap': f.get('cap'),
                       'ang': f.get('ang'), 'spd': f.get('spd'), 'coc': f.get('coc'), 'p90': round(r[0], 3), 'con': None if r[1] is None else round(r[1], 2),
                       'letter': None if r[3] is None else round(r[3], 2), 'q': f['q'], 'subject': f.get('subject', True), 'method': f.get('method', ''),
                       'inqa': f.get('inqa', True)})
        fr['faces'] = fm
        lab = []
        for L in meta.get('labels', []):
            if not L.get('on') or not L.get('q'):
                continue
            cap = float(L.get('cap') or 0)
            r = poly_measure(rgb, L['q'], self.scale, max(4.0, 0.35 * cap) * self.scale, cap) if cap >= TL['label_cap_px'] else None
            readable = cap >= TL['label_cap_px'] and (r is None or r[1] is None or r[1] > TL['label_contrast']) and (r is None or r[3] is None or r[3] >= TY['letter_min'])
            lab.append({'text': L.get('text', '')[:24], 'src': L.get('src'), 'cap': round(cap, 1), 'con': None if r is None or r[1] is None else round(r[1], 2),
                        'letter': None if r is None or r[3] is None else round(r[3], 2), 'readable': bool(readable), 'q': L['q']})
        fr['labels'] = lab
        fr['labels_readable'] = sum(1 for x in lab if x['readable'])
        for k in ('post', 'fg', 'sota', 'ms', 'sub', 'qa'):
            if k in meta:
                fr[k] = meta[k]
        self.frames.append(fr)
        # thumbnails (strip) and the 160x90 luma (cut rhyme)
        th = cv2.resize(rgb, (480, 270), interpolation=cv2.INTER_AREA)
        ok, jb = cv2.imencode('.jpg', cv2.cvtColor(th, cv2.COLOR_RGB2BGR), [cv2.IMWRITE_JPEG_QUALITY, 85])
        self.thumbs[i] = jb.tobytes()
        self.small_y.append(cv2.resize((small.astype(np.float32) / 255) @ W709, (160, 90), interpolation=cv2.INTER_AREA).astype(np.float16))
        self.t_misc += time.perf_counter() - t2

    def key_pool(self, small, cur_faces):
        Y = (small.astype(np.float32) / 255) @ W709
        Yb = cv2.GaussianBlur(Y, (0, 0), TL['key_blur_w'] * SW)
        gmax = float(Yb.max())
        k = SW / FW
        reg = np.zeros((SH, SW), np.uint8)
        for f in cur_faces:
            q = np.array(f['q'], np.float32) * k
            x0, y0 = q.min(0); x1, y1 = q.max(0)
            e = max(TL['key_expand_caps'] * float(f.get('cap') or 0) * k, TL['key_expand_w'] * SW)
            cv2.rectangle(reg, (int(x0 - e), int(y0 - e)), (int(x1 + e), int(y1 + e)), 1, -1)
        rmax = float(Yb[reg > 0].max()) if reg.any() else 0.0
        yy, xx = np.unravel_index(int(np.argmax(Yb)), Yb.shape)
        return {'ok': bool(rmax >= TL['key_ratio'] * gmax), 'ratio': round(rmax / max(gmax, 1e-6), 3), 'at': [round(xx / k), round(yy / k)]}


def legible(fc):
    """A face whose letters can be read in this frame: facing the lens (≤ 80°), ≥ 8 px, contrast > 1.5 : 1 and letter
    energy ≥ letter_min (stems drawn where the word's letters are: a blank face or a light strip behind it is not a word)."""
    return ((fc.get('ang') is None or fc['ang'] <= 80) and (fc.get('cap') or 0) >= TY['unsung_cap_min']
            and fc.get('con') is not None and fc['con'] > TY['unsung_contrast_max'] and (fc.get('letter') is None or fc['letter'] >= TY['letter_min']))


def old_bad(fc):
    """An earlier line still legible and either brighter than ash (p90 display luma > ash_max) or in focus (CoC < old_coc_min)."""
    return fc['state'] == 'old' and legible(fc) and (fc['p90'] > TY['ash_max'] or fc.get('coc') is None or fc['coc'] < TY['old_coc_min'])


def unsung_bad(fc):
    """A word not yet sung that can be read (F4 displays exempt: an unsung cell shows every segment raw, no letter)."""
    return fc['state'] == 'unsung' and fc.get('method') != 'F4' and legible(fc)


# ================================================================ helpers for the report


def fmt(x, d=2):
    return '—' if x is None or (isinstance(x, float) and not math.isfinite(x)) else (f'{x:.{d}f}' if isinstance(x, (int, float)) else str(x))


def fv(x):
    """A table value: counts as integers, the rest with the precision their size needs."""
    if x is None or (isinstance(x, float) and not math.isfinite(x)):
        return '—'
    if isinstance(x, bool):
        return 'yes' if x else 'no'
    if isinstance(x, int):
        return str(x)
    if isinstance(x, float):
        a = abs(x)
        return f'{x:.0f}' if a >= 100 else f'{x:.1f}' if a >= 10 else f'{x:.2f}' if a >= 1 else f'{x:.3f}' if a >= 0.1 or a == 0 else f'{x:.4f}'
    return str(x)


def runs(mask):
    """[(start, end_exclusive)] of True runs."""
    out, s = [], None
    for i, v in enumerate(mask):
        if v and s is None:
            s = i
        if not v and s is not None:
            out.append((s, i)); s = None
    if s is not None:
        out.append((s, len(mask)))
    return out


class Gate:
    def __init__(self, group, name, scope, value, limit, ok, note='', worst=None, info=False):
        self.group, self.name, self.scope, self.value, self.limit, self.ok, self.note, self.worst, self.info = group, name, scope, value, limit, ok, note, worst or [], info

    def j(self):
        return {'group': self.group, 'gate': self.name, 'scope': self.scope, 'value': self.value, 'limit': self.limit,
                'pass': None if self.ok is None else bool(self.ok), 'info': self.info, 'note': self.note, 'worst': self.worst}


# ================================================================ finalize: shots, gates, report


def finalize(run, end):
    F = run.frames
    fps = run.fps
    if not F:
        print('gates: no frames'); return 2
    T = np.array([f['t'] for f in F])
    A, B = end.get('window') or [float(T[0]), float(T[-1]) + 1 / fps]
    cuts_all = sorted(set(round(c, 4) for c in end.get('cuts', [])))
    cuts = [c for c in cuts_all if A + 1e-4 < c < B - 1e-4]
    # the pair (i−1, i) straddles a cut when frame i is the first frame at/after it (cut times come rounded to 0.1 ms:
    # a tolerance of 0.05 ms keeps exactly one pair per cut; flow.py's ±0.1 ms also drops the pair after it)
    for i, f in enumerate(F):
        f['cut'] = i > 0 and any(F[i - 1]['t'] + 5e-5 < c <= f['t'] + 5e-5 for c in cuts)
    # ---- shots
    bounds = [A] + cuts + [B]
    named = CFG['shots']
    shots = []
    for s0, s1 in zip(bounds[:-1], bounds[1:]):
        mid = (s0 + s1) / 2
        hit = next(((n, a, b) for n, a, b in named if a <= mid < b), None)
        nm, full = (hit[0], (hit[1], hit[2])) if hit else (f'@{s0:.3f}', (s0, s1))
        sh = {'name': nm, 'start': s0, 'end': s1, 'full': list(full), 'partial': not (abs(full[0] - s0) < 1.6 / 60 and abs(full[1] - s1) < 1.6 / 60)}
        sh['idx'] = [i for i, f in enumerate(F) if s0 - 5e-5 <= f['t'] < s1 - 5e-5]
        if sh['idx']:
            shots.append(sh)
    # merge duplicate names (a named shot split by an unnamed internal cut keeps its name with a suffix)
    seen = {}
    for sh in shots:
        k = sh['name']
        if k in seen:
            seen[k] += 1; sh['name'] = f'{k}.{seen[k]}'
        else:
            seen[k] = 1
    for sh in shots:
        for i in sh['idx']:
            F[i]['shot'] = sh['name']
    secs = end.get('sections') or [{'name': n, 'start': a, 'end': b} for n, a, b in CFG['sections']]
    secs = [s if isinstance(s, dict) else {'name': s[0], 'start': s[1], 'end': s[2]} for s in secs]

    def sec_of(t):
        for s in secs:
            if s['start'] - 1e-6 <= t < s['end'] - 1e-6:
                return s['name']
        return None
    for f in F:
        f['section'] = sec_of(f['t'])
    hits = [h for h in end.get('hits', []) if A - 0.5 <= h['t'] <= B]
    gates = []
    G = lambda *a, **k: gates.append(Gate(*a, **k))
    pairs = lambda idx: [i for i in idx if i > 0 and not F[i]['cut'] and 'med_all' in F[i]]
    fast_n = max(1, int(math.ceil(TF['fast_frames60'] * fps / 60 - 1e-9)))
    deb_n = max(1, int(math.ceil(TY['debounce_frames60'] * fps / 60 - 1e-9)))

    # ================================================================ LIGHT
    for s in secs:
        idx = [i for i, f in enumerate(F) if f['section'] == s['name']]
        if not idx:
            continue
        lu = float(np.mean([F[i]['luma'] for i in idx]))
        part = not (A <= s['start'] + 1.6 / 60 and B >= s['end'] - 1.6 / 60)
        lo, hi = TL['section_luma']
        # (a window that covers only part of a section reports its share as info: the gate is the whole section's mean)
        G('LIGHT', 'section luma', s['name'] + (' (part)' if part else ''), round(lu, 3), f'{lo}–{hi}', lo <= lu <= hi, info=part)
    for sh in shots:
        idx = sh['idx']; nm = sh['name']
        L = np.array([F[i]['luma'] for i in idx])
        G('LIGHT', 'luma', nm, round(float(L.mean()), 3), f"≥ {TL['shot_luma_min']}", float(L.mean()) >= TL['shot_luma_min'], worst=[(F[i]['t'], F[i]['luma']) for i in sorted(idx, key=lambda i: F[i]['luma'])[:2]])
        p2ok = float(np.mean([F[i]['p2'] <= TL['p2_max'] for i in idx]))
        G('LIGHT', 'p2 ≤ .02 frames', nm, round(p2ok, 3), f"≥ {TL['p2_share_min']}", p2ok >= TL['p2_share_min'], worst=[(F[i]['t'], F[i]['p2']) for i in sorted(idx, key=lambda i: -F[i]['p2'])[:2] if F[i]['p2'] > TL['p2_max']])
        mk = [F[i]['murk'] for i in idx]
        nbad = sum(m > TL['murk_max'] for m in mk)
        G('LIGHT', 'murk % (max)', nm, round(max(mk), 1), f"≤ {TL['murk_max']}", nbad == 0, note=f'{nbad} frames over' if nbad else '', worst=[(F[i]['t'], F[i]['murk']) for i in sorted(idx, key=lambda i: -F[i]['murk'])[:2] if F[i]['murk'] > TL['murk_max']])
        t5 = float(np.mean([F[i]['top5'] for i in idx]))
        G('LIGHT', 'top-5 % share', nm, round(t5, 3), f"≥ {TL['top5_min']}", t5 >= TL['top5_min'], worst=[(F[i]['t'], F[i]['top5']) for i in sorted(idx, key=lambda i: F[i]['top5'])[:1]])
        ed = float(np.mean([F[i]['edge'] for i in idx]))
        G('LIGHT', 'edge density', nm, round(ed, 4), f"≤ {TL['edge_max']}", ed <= TL['edge_max'], worst=[(F[i]['t'], F[i]['edge']) for i in sorted(idx, key=lambda i: -F[i]['edge'])[:1]])
        av = [F[i]['lab_a'] for i in idx if F[i]['lab_a'] is not None]; bv = [F[i]['lab_b'] for i in idx if F[i]['lab_b'] is not None]
        if av:
            am, bm = float(np.median(av)), float(np.median(bv))
            lim = TL['neutral_ab_max']
            G('LIGHT', 'neutral a*/b*', nm, f'{am:+.1f}/{bm:+.1f}', f'|·| ≤ {lim}', abs(am) <= lim and abs(bm) <= lim,
              note='purple cast' if am > lim and bm < -lim else 'magenta cast' if am > lim else 'blue cast' if bm < -lim else 'warm cast' if bm > lim else '',
              worst=[(F[i]['t'], f"{F[i]['lab_a']:+.1f}/{F[i]['lab_b']:+.1f}") for i in sorted([i for i in idx if F[i]['lab_a'] is not None], key=lambda i: -math.hypot(F[i]['lab_a'], F[i]['lab_b']))[:1]])
        wp = [i for i in idx if len(F[i]['pools']) > TL['pool_group_max']]
        share = len(wp) / len(idx)
        G('LIGHT', 'pool wallpaper frames', nm, round(share, 3), f"≤ {TL['pool_frames_max']}", share <= TL['pool_frames_max'],
          note=f"max {max(len(F[i]['pools']) for i in idx)} identical pools", worst=[(F[i]['t'], len(F[i]['pools'])) for i in sorted(wp, key=lambda i: -len(F[i]['pools']))[:2]])
        ks = [i for i in idx if 'key' in F[i]]
        if ks:
            kshare = float(np.mean([F[i]['key']['ok'] for i in ks]))
            G('LIGHT', 'key pool at sung word', nm, round(kshare, 3), f"≥ {TL['key_share_min']}", kshare >= TL['key_share_min'], note=f'{len(ks)} sung frames',
              worst=[(F[i]['t'], F[i]['key']['ratio']) for i in sorted(ks, key=lambda i: F[i]['key']['ratio'])[:2] if not F[i]['key']['ok']])
        else:
            G('LIGHT', 'key pool at sung word', nm, None, f"≥ {TL['key_share_min']}", None, note='no lyric data' if not any('faces' in F[i] and F[i]['faces'] for i in idx) else 'no word sung')
        if any('labels' in F[i] and F[i].get('labels') is not None for i in idx) and end.get('has_page'):
            lm = max(F[i]['labels_readable'] for i in idx)
            G('LIGHT', 'readable labels (max/frame)', nm, lm, f"≤ {TL['labels_max']}", lm <= TL['labels_max'],
              worst=[(F[i]['t'], F[i]['labels_readable']) for i in sorted(idx, key=lambda i: -F[i]['labels_readable'])[:2] if F[i]['labels_readable'] > TL['labels_max']])
        else:
            G('LIGHT', 'readable labels (max/frame)', nm, None, f"≤ {TL['labels_max']}", None, note='needs the page (render.ts gates)')
        mi = [i for i in idx if 'mag' in F[i]]
        if mi:
            hz = max(F[i]['mag']['haze'] for i in mi)
            G('LIGHT', 'pink haze % (max)', nm, hz, f"≤ {TL['haze_max']}", hz <= TL['haze_max'], worst=[(F[i]['t'], F[i]['mag']['haze']) for i in sorted(mi, key=lambda i: -F[i]['mag']['haze'])[:1] if F[i]['mag']['haze'] > TL['haze_max']])
        # magenta in the frames with the SOTA machine on screen (page flag), from the per-frame hot% (hot_pct)
        so = [i for i in idx if F[i].get('sota')]
        if so:
            r = float(np.mean([F[i]['hot'] >= 0.1 for i in so]))
            few = len(so) < 6
            G('LIGHT', 'magenta w/ SOTA on screen', nm, round(r, 3), f"≥ {TL['magenta_ratio_min']}", r >= TL['magenta_ratio_min'], note=f'{len(so)} frames' + (' (too few: info)' if few else ''), info=few)
    # ================================================================ FLIGHT
    chorus = [i for i in range(len(F)) if (F[i]['section'] or '').startswith('chorus')]
    cp = pairs(chorus)
    if cp:
        m = np.array([F[i]['med_all'] for i in cp])
        part = not all(A <= s['start'] + 1.6 / 60 and B >= s['end'] - 1.6 / 60 for s in secs if s['name'].startswith('chorus') and s['start'] < B and s['end'] > A)
        G('FLIGHT', 'chorus median W/s', 'chorus' + (' (part)' if part else ''), round(float(np.median(m)), 3), f"≥ {TF['median_min']}", float(np.median(m)) >= TF['median_min'], info=part)
        G('FLIGHT', 'chorus share ≥ 0.6 W/s', 'chorus' + (' (part)' if part else ''), round(float(np.mean(m >= 0.6)), 3), f"≥ {TF['share06_min']}", float(np.mean(m >= 0.6)) >= TF['share06_min'], info=part)
    for sh in shots:
        p = pairs(sh['idx'])
        if not p:
            continue
        m = np.array([F[i]['med_all'] for i in p]); nm = sh['name']
        ch = (F[sh['idx'][0]]['section'] or '').startswith('chorus')
        long = sh['end'] - sh['start'] >= 1.0
        gate = ch and long
        G('FLIGHT', 'median W/s', nm, round(float(np.median(m)), 3), f"≥ {TF['median_min']}" if gate else 'info', (float(np.median(m)) >= TF['median_min']) if gate else None, info=not gate,
          note=f"bg {np.median([F[i]['bg'] for i in p]):.2f} · cam {np.median([F[i].get('cam') or 0 for i in p]):.2f}")
        G('FLIGHT', 'share ≥ 0.6 W/s', nm, round(float(np.mean(m >= 0.6)), 3), f"≥ {TF['share06_min']}" if gate else 'info', (float(np.mean(m >= 0.6)) >= TF['share06_min']) if gate else None, info=not gate)
        # static runs
        st = np.array([(F[i]['med_all'] < TF['static_ws']) if (i in p) else False for i in sh['idx']])
        bad = []
        for a0, a1 in runs(st):
            ii = sh['idx'][a0:a1]
            dur = len(ii) / fps
            if dur <= TF['static_max_s']:
                continue
            ta, tb = F[ii[0]]['t'] - 1 / fps, F[ii[-1]]['t']
            ex = next((e for e in CFG['exempt_static'] if ta >= e[0] - 1 / fps and tb <= e[1] + 1 / fps), None)
            hs = next((h for h in hits if LEVEL_RANK.get(h['level'], 0) >= 2 and h['t'] - 2 / fps <= ta and tb <= h['t'] + (0.47 if h['level'] == 'XXL' else 0.32) + 0.1), None)
            mot = float(np.median([abs(F[i].get('roll') or 0) + abs(F[i].get('zoom') or 0) for i in ii]))
            if ex or (hs and mot >= TF['hitstop_motion']):
                continue
            bad.append((round(ta, 3), round(tb, 3), round(dur, 2), 'hit-stop without fov/roll motion' if hs else ''))
        G('FLIGHT', 'near-static runs > 0.4 s', nm, len(bad), '0', not bad, note='; '.join(f'{a:.2f}–{b:.2f} ({d}s){" " + n if n else ""}' for a, b, d, n in bad[:3]), worst=[(a, d) for a, b, d, n in bad[:2]])
        # foreground wipes while flying
        fly = [i for i in p if F[i]['med_all'] >= TF['flying_ws']]
        if fly:
            # the page's depth band (geometry 1–4 m from the lens) when it was measured; else the largest fast flow blob
            ev = lambda i: (((F[i].get('fgnear') or 0) >= TF['fg_depth_frac']) if F[i].get('fg') else ((F[i].get('fgblob') or 0) >= TF['fg_flow_frac']))
            gaps, last, prev_fly_t = [], None, None
            start_t = None
            for i in fly:
                t = F[i]['t']
                if prev_fly_t is None or t - prev_fly_t > 0.25:  # a new flying stretch
                    start_t, last = t, None
                if ev(i):
                    g0 = (t - (last if last is not None else start_t))
                    if g0 > TF['fg_gap_max_s']:
                        gaps.append((round((last if last is not None else start_t), 3), round(t, 3), round(g0, 2)))
                    last = t
                elif t - (last if last is not None else start_t) > TF['fg_gap_max_s'] and (not gaps or gaps[-1][0] != round((last if last is not None else start_t), 3)):
                    gaps.append((round((last if last is not None else start_t), 3), None, None))
                prev_fly_t = t
            # close open gaps
            fixed = []
            for g in gaps:
                if g[1] is None:
                    nxt = next((F[i]['t'] for i in fly if F[i]['t'] > g[0] and ev(i)), None)
                    end_t = nxt if nxt is not None else max(F[i]['t'] for i in fly if F[i]['t'] > g[0])
                    if not any(abs(x[0] - g[0]) < 1e-3 for x in fixed):
                        fixed.append((g[0], round(end_t, 3), round(end_t - g[0], 2)))
                elif not any(abs(x[0] - g[0]) < 1e-3 for x in fixed):
                    fixed.append(g)
            nev = sum(1 for i in fly if ev(i))
            mg = max([g[2] for g in fixed], default=0.0)
            G('FLIGHT', 'fg wipe gap (s, flying)', nm, round(mg, 2), f"≤ {TF['fg_gap_max_s']}", not fixed, note=f"{nev}/{len(fly)} flying frames with a 1–4 m foreground" + (f"; gaps {', '.join(f'{a:.2f}–{b:.2f}' for a, b, c in fixed[:3])}" if fixed else ''),
              worst=[(a, c) for a, b, c in fixed[:2]])
    # whips per bar (chorus)
    dbs = sorted(end.get('downbeats') or [])
    def chorus_share(a, b):
        ii = [i for i in range(len(F)) if a <= F[i]['t'] < b]
        return np.mean([(F[i]['section'] or '').startswith('chorus') for i in ii]) if ii else 0.0
    bars = [(a, b) for a, b in zip(dbs[:-1], dbs[1:]) if a >= A - 1e-3 and b <= B + 1e-3 and chorus_share(a, b) >= 0.5]
    if bars:
        miss = []
        for a, b in bars:
            ii = [i for i in range(len(F)) if a <= F[i]['t'] - 1 / fps and F[i]['t'] <= b]
            ok = np.array([(i in set(pairs(ii))) and F[i]['med_all'] >= TF['fast_ws'] for i in ii])
            best = max([r1 - r0 for r0, r1 in runs(ok)], default=0)
            if best < fast_n:
                miss.append((round(a, 3), round(b, 3), best, round(max([F[i]['med_all'] for i in pairs(ii)], default=0), 2)))
        G('FLIGHT', f'whip ≥ {TF["fast_ws"]} W/s × {fast_n} fr per bar', 'chorus bars', f'{len(bars) - len(miss)}/{len(bars)}', 'every bar', not miss,
          note='; '.join(f'bar {a:.2f}: peak {p} W/s' for a, b, r, p in miss[:4]), worst=[(a, p) for a, b, r, p in miss[:3]])
    # ================================================================ LYRICS
    has_ly = end.get('has_page') and any(f.get('faces') is not None for f in F)
    words = end.get('words') or []
    if has_ly:
        qa_fails = [x for f in F for x in ((f.get('qa') or {}).get('fails') or [])] + list(end.get('qaFinish') or [])
        for sh in shots:
            ff = [x for i in sh['idx'] for x in ((F[i].get('qa') or {}).get('fails') or [])]
            by = {}
            for x in ff:
                by[x['rule']] = by.get(x['rule'], 0) + 1
            G('LYRICS', 'lyricqa fails', sh['name'], len(ff), '0', not ff, note=', '.join(f'{k} {v}' for k, v in sorted(by.items(), key=lambda kv: -kv[1])[:5]),
              worst=[(x['t'], f"{x['rule']} {x['text']}") for x in ff[:2]])
            # word speed (current faces)
            # (inside the carrier's QA window; a long note only in its first second: §7.2, the camera may leave it then)
            sp = [(F[i]['t'], fc['spd'], fc['text']) for i in sh['idx'] for fc in F[i].get('faces', []) if fc['state'] == 'current' and fc.get('inqa', True) and fc.get('spd') is not None]
            if sp:
                mx = max(sp, key=lambda x: x[1])
                G('LYRICS', 'sung word speed max W/s', sh['name'], round(mx[1], 3), f"≤ {TY['word_speed_max']}", mx[1] <= TY['word_speed_max'], note=mx[2], worst=[(mx[0], round(mx[1], 3))])
            # old lines: ash + out of focus
            badf = []
            for i in sh['idx']:
                badf.append(any(old_bad(fc) for fc in F[i].get('faces', [])))
            rr = [(a, b) for a, b in runs(badf) if b - a >= deb_n]
            nfr = sum(b - a for a, b in rr)
            ex = []
            for a, b in rr[:3]:
                i = sh['idx'][a]
                v = [fc for fc in F[i]['faces'] if old_bad(fc)]
                ex.append(f"{F[i]['t']:.2f} {v[0]['text']} p90 {v[0]['p90']:.2f} coc {fmt(v[0].get('coc'), 1)} letters {fmt(v[0].get('letter'), 1)}")
            G('LYRICS', 'earlier lines ash & soft (bad frames)', sh['name'], nfr, '0', nfr == 0, note='; '.join(ex), worst=[(F[sh['idx'][a]]['t'], 'old line bright/in focus') for a, b in rr[:2]])
            # unsung words unreadable
            badu = []
            for i in sh['idx']:
                badu.append(any(unsung_bad(fc) for fc in F[i].get('faces', [])))
            ru = [(a, b) for a, b in runs(badu) if b - a >= deb_n]
            nfu = sum(b - a for a, b in ru)
            ex = []
            for a, b in ru[:3]:
                i = sh['idx'][a]
                v = [fc for fc in F[i]['faces'] if unsung_bad(fc)]
                ex.append(f"{F[i]['t']:.2f} {v[0]['text']} {v[0]['con']:.1f}:1 letters {fmt(v[0].get('letter'), 1)}")
            G('LYRICS', 'unsung words readable (frames)', sh['name'], nfu, '0', nfu == 0, note='; '.join(ex), worst=[(F[sh['idx'][a]]['t'], 'unsung readable') for a, b in ru[:2]])
        nq = len(qa_fails)
        G('LYRICS', 'lyricqa fails (window, incl. finish)', 'window', nq, '0', nq == 0)
        # hook / subject caps at onset
        caps_cfg = TY['caps']
        wrows = []
        for w in words:
            if not (A - 1e-3 <= w['start'] < B):
                continue
            text = w['text']
            # onset = the word's first M+ hit within onset_window s of its start (the director's "STATE at the 46.273 brake",
            # "GUARANTEED at the latch"), else word.start
            ow = TY['onset_window'].get(text, TY['onset_window']['default'])
            on_hits = [h for h in hits if h['level'] in TY['onset_hit_levels'] and w['start'] - 1 / fps <= h['t'] <= min(w['end'], w['start'] + ow)]
            onset = max(w['start'], on_hits[0]['t']) if on_hits else w['start']
            target = caps_cfg.get(text, TY['cap_default'])
            i = int(np.argmin(np.abs(T - onset)))
            if abs(T[i] - onset) > 1.01 / fps:
                continue
            fcs = [fc for fc in F[i].get('faces', []) if fc.get('word') == w['key']]
            cap = max([fc.get('cap') or 0 for fc in fcs], default=None)
            subject = all(fc.get('subject', True) for fc in fcs) if fcs else True
            capmax = max([fc.get('cap') or 0 for j in range(len(F)) if w['start'] <= F[j]['t'] <= w['end'] for fc in F[j].get('faces', []) if fc.get('word') == w['key']], default=None)
            ok = None if not subject else (cap is not None and cap >= target)
            wrows.append({'word': text, 'key': w['key'], 'start': w['start'], 'onset': round(onset, 3), 'at_hit': bool(on_hits), 'cap': None if cap is None else round(cap, 1),
                          'cap_max': None if capmax is None else round(capmax, 1), 'target': target, 'subject': subject, 'pass': ok, 'shot': F[i].get('shot')})
        for r in wrows:
            G('LYRICS', f"cap @onset {r['word']}", r['shot'] or '?', r['cap'], f"≥ {r['target']}" + ('' if r['subject'] else ' (not subject)'), r['pass'],
              note=f"onset {r['onset']:.3f}{' (hit)' if r['at_hit'] else ''} · max in word {fmt(r['cap_max'], 0)} px", worst=[(r['onset'], r['cap'])], info=not r['subject'])
    else:
        G('LYRICS', 'lyric gates', 'window', None, '—', None, note='needs the page (render.ts gates): no lyric data in this run')
        wrows = []
    # ================================================================ IMPACTS
    lumas = np.array([f['luma'] for f in F])
    imp_rows = []
    sf0, sf1 = TI['surge_frames60']
    smin, smax = max(1, int(math.ceil(sf0 * fps / 60 - 1e-9))), max(1, int(math.floor(sf1 * fps / 60 + 1e-9)))
    for h in hits:
        lv = h['level']
        if LEVEL_RANK.get(lv, 0) < 2 or not (A <= h['t'] < B):
            continue
        t = h['t']
        pre = (T > t + TI['pre'][0]) & (T < t + TI['pre'][1])
        win = (T >= t + TI['win'][0]) & (T <= t + TI['win'][1])
        okw = win & np.array([not f['cut'] for f in F])
        cam = np.array([(f.get('cam') if f.get('cam') is not None else np.nan) for f in F], float)
        row = {'t': t, 'level': lv, 'label': h.get('label', ''), 'src': h.get('src', '')}
        row['partial'] = not pre.any() or (T[0] > t + TI['pre'][0] + 0.02)
        row['base_cam'] = round(float(np.nanmedian(cam[pre])), 3) if pre.any() and np.isfinite(cam[pre]).any() else None
        row['pk_cam'] = round(float(np.nanmax(cam[okw])), 3) if okw.any() and np.isfinite(cam[okw]).any() else None
        roll = np.array([abs(f.get('roll') or 0) for f in F]); zoom = np.array([abs(f.get('zoom') or 0) for f in F])
        row['pk_roll'] = round(float(roll[okw].max()), 1) if okw.any() else None
        row['pk_zoom'] = round(float(zoom[okw].max()), 1) if okw.any() else None
        l0 = float(lumas[pre].mean()) if pre.any() else float(lumas[win][0]) if win.any() else float('nan')
        lw = lumas[win]
        row['luma0'] = round(l0, 3)
        row['dluma'] = round(float(lw.max()) - l0, 3) if lw.size else None
        row['pk_t'] = round(float(T[win][int(np.argmax(lw))]), 3) if lw.size else None
        spec = TI['levels'].get(lv) or TI['levels']['L']
        s0, s1 = spec['surge']
        # surge frames: from contact on, frames over the lower bound (consecutive from the first)
        cont = (T >= t - 1 / fps - 1e-6) & (T <= t + TI['win'][1])
        over = [(lumas[i] - l0) >= s0 for i in np.nonzero(cont)[0]]
        rr = runs(over)
        row['surge_frames'] = (rr[0][1] - rr[0][0]) if rr else 0
        if rr:
            e_i = int(np.nonzero(cont)[0][rr[0][1] - 1])
            after = (T > T[e_i]) & (T <= T[e_i] + TI['brownout_s'])
            row['brownout'] = round(l0 - float(lumas[after].min()), 3) if after.any() else None
        else:
            row['brownout'] = None
        ci = np.nonzero((T >= t - 1e-6) & (T < t + TI['contact_frames60'] / 60 + 1e-6))[0]
        row['p2_contact'] = round(float(max(F[i]['p2'] for i in ci)), 4) if len(ci) else None
        wsp = [fc['spd'] for i in np.nonzero(win)[0] for fc in F[i].get('faces', []) if fc['state'] == 'current' and fc.get('inqa', True) and fc.get('spd') is not None]
        row['word_max'] = round(max(wsp), 3) if wsp else None
        posts = [F[i].get('post') or {} for i in np.nonzero(win)[0]]
        row['post_flash'] = round(max([p.get('flash', 0) or 0 for p in posts], default=0), 3) if posts else None
        row['post_exposure'] = round(max([p.get('exposure', 1) or 1 for p in posts], default=1), 3) if posts else None
        fw = (T >= t - 0.05) & (T <= t + 0.6)
        row['flecks_max'] = int(max([F[i]['flecks'] for i in np.nonzero(fw)[0]], default=0))
        if LEVEL_RANK[lv] >= 3:
            fgs = [(F[i].get('fg') or {}).get('n24', 0) for i in np.nonzero((T >= t) & (T <= t + TI['fragments_s']))[0]]
            row['fragments'] = max(fgs) if fgs and any(F[i].get('fg') for i in np.nonzero((T >= t) & (T <= t + TI['fragments_s']))[0]) else None
        fails = []
        if row['pk_cam'] is None or row['pk_cam'] < spec['cam_min']:
            fails.append(f"camera peak {fmt(row['pk_cam'])} < {spec['cam_min']} W/s")
        if row['dluma'] is None or not (s0 <= row['dluma'] <= s1):
            fails.append(f"surge {fmt(row['dluma'], 3)} not in +{s0}…+{s1}")
        elif not (smin <= row['surge_frames'] <= smax):
            fails.append(f"surge lasts {row['surge_frames']} fr (want {smin}–{smax})")
        if row['brownout'] is None or row['brownout'] < TI['brownout_min']:
            fails.append(f"no brownout after the surge ({fmt(row['brownout'], 3)})")
        if row['p2_contact'] is not None and row['p2_contact'] > TI['p2_contact_max']:
            fails.append(f"white-out: p2 {row['p2_contact']:.3f} at contact")
        if row['word_max'] is not None and row['word_max'] > TI['word_max']:
            fails.append(f"word moves {row['word_max']:.2f} W/s")
        if row['post_flash'] and row['post_flash'] > TI['post_flash_max']:
            fails.append(f"post flash {row['post_flash']}")
        if row['post_exposure'] and row['post_exposure'] > TI['post_exposure_max'] + 1e-6:
            fails.append(f"post exposure ×{row['post_exposure']}")
        if row['flecks_max'] > TI['fleck_frame_max']:
            fails.append(f"{row['flecks_max']} flat white flecks in a frame")
        if LEVEL_RANK[lv] >= 3 and row.get('fragments') is not None and row['fragments'] < TI['fragments_min']:
            fails.append(f"{row['fragments']} near-lens (2–4 m) fragments < {TI['fragments_min']}")
        row['fails'] = fails
        row['pass'] = not fails
        imp_rows.append(row)
        G('IMPACTS', f"{lv} {row['label'] or ''} {t:.3f}".strip(), F[int(np.argmin(np.abs(T - t)))].get('shot', '?'), f"cam {fmt(row['pk_cam'])} Δ{fmt(row['dluma'], 3)}", 'cam ≥ 2, surge, brownout', row['pass'],
          note='; '.join(fails) + (' (baseline before the window: partial)' if row['partial'] else ''), worst=[(t, row['dluma'])])
    # flecks anywhere (the R2 paper rule)
    fl_n = max(1, int(math.ceil(TI['fleck_run_frames60'] * fps / 60 - 1e-9)))
    for sh in shots:
        fx = [(F[i]['t'], F[i]['flecks']) for i in sh['idx']]
        mx = max(fx, key=lambda x: x[1])
        over = [x[1] > TI['fleck_frame_max'] for x in fx]
        bad = [fx[k] for a0, a1 in runs(over) if a1 - a0 >= fl_n for k in range(a0, a1)]
        G('IMPACTS', 'flat white flecks (max/frame)', sh['name'], mx[1], f"≤ {TI['fleck_frame_max']} (runs ≥ {fl_n} fr)", not bad, note=f'{len(bad)} confetti frames' if bad else '',
          worst=sorted(bad, key=lambda x: -x[1])[:2])
    # ================================================================ CUTS
    # A designed handoff is a seam object registered on both sides of the cut (lyricReg.handoff, §5.6 / §9) whose screen
    # rect and velocity carry across (render.ts seam). The pixel rhyme numbers (light IoU, shape NCC, motion cos) are
    # information only: on slice v3 they do not separate the designed cuts (43.483 light slam, 45.812 H02) from the flat ones.
    cut_rows = []
    cq = end.get('cutqa') or {}
    seams = [sm for sm in (end.get('seams') or []) if sm.get('t') is not None]
    for c in cuts:
        n1 = next((i for i, f in enumerate(F) if f['t'] >= c - 5e-5), None)
        if n1 is None or n1 < 1:
            continue
        n0 = n1 - 1
        Ya, Yb = run.small_y[n0].astype(np.float32), run.small_y[n1].astype(np.float32)
        ta, tb = np.percentile(Ya, 97), np.percentile(Yb, 97)
        ma, mb = cv2.GaussianBlur((Ya >= ta).astype(np.float32), (0, 0), 2) > 0.3, cv2.GaussianBlur((Yb >= tb).astype(np.float32), (0, 0), 2) > 0.3
        iou = float((ma & mb).sum() / max(1, (ma | mb).sum()))
        ea = cv2.GaussianBlur(cv2.Canny((Ya * 255).astype(np.uint8), 40, 100).astype(np.float32), (0, 0), 2)
        eb = cv2.GaussianBlur(cv2.Canny((Yb * 255).astype(np.uint8), 40, 100).astype(np.float32), (0, 0), 2)
        ea -= ea.mean(); eb -= eb.mean()
        ncc = float((ea * eb).sum() / max(1e-6, math.sqrt(float((ea * ea).sum() * (eb * eb).sum()))))
        fb = F[n1 + 1] if n1 + 1 < len(F) else {}
        va = np.array([F[n0].get('vx') or 0, F[n0].get('vy') or 0]); vb = np.array([fb.get('vx') or 0, fb.get('vy') or 0])
        sa, sb = float(np.linalg.norm(va)), float(np.linalg.norm(vb))
        cos = float(va @ vb / (sa * sb)) if sa > 1e-6 and sb > 1e-6 else None
        rhyme = {'light_iou': round(iou, 3), 'shape_ncc': round(ncc, 3), 'motion_cos': None if cos is None else round(cos, 3), 'speeds': [round(sa, 2), round(sb, 2)],
                 'dluma': round(F[n1]['luma'] - F[n0]['luma'], 3)}
        sm = [x for x in seams if abs(x['t'] - c) < 1.5 / 60]
        crow = {'t': c, 'rhyme': rhyme, 'seams': sm}
        ghosts = [r for r in (cq.get('rows') or []) if abs((r.get('cut') or -1) - c) < 1e-3]
        if ghosts:
            st = [r for r in ghosts if r.get('straddle') and (r.get('sep') or 0) > 0.01]
            gmax = max([abs(r.get('alpha') or 0) for r in st], default=0.0)
            crow['ghost_max'] = round(gmax, 4)
            crow['ghost_ok'] = gmax < TC['ghost_alpha_max']  # (cutqa's own test, on the unrounded α)
            crow['one_side'] = all(r.get('side') for r in ghosts)
        cut_rows.append(crow)
        info = f"pixels: light IoU {iou:.2f} · shape NCC {ncc:.2f} · motion cos {fmt(cos)} ({sa:.2f}→{sb:.2f} W/s) · ΔY' {rhyme['dluma']:+.3f}"
        shot_n = F[n1].get('shot', '?')
        if not end.get('has_page'):
            G('CUTS', f'handoff @{c:.3f}', shot_n, None, 'registered seam passes', None, note='needs the page (render.ts gates) · ' + info)
        elif sm:
            okk = all(x.get('pass') for x in sm)
            G('CUTS', f'handoff @{c:.3f}', shot_n, ' '.join(f"{x.get('cut')} {'PASS' if x.get('pass') else 'FAIL'}" for x in sm), 'registered seam passes', okk,
              note='; '.join(f"{x.get('cut')}: {x.get('note', '')}" for x in sm) + ' · ' + info, worst=[] if okk else [(c, 'seam fails')])
        else:
            G('CUTS', f'handoff @{c:.3f}', shot_n, 'no seam', 'registered seam passes', False,
              note='no seam object registered for this cut (lyricReg.handoff side out + in, t = the cut) · ' + info, worst=[(c, 'flat cut: no seam')])
        if ghosts:
            G('CUTS', f'no ghost @{c:.3f}', shot_n, crow['ghost_max'], f"< {TC['ghost_alpha_max']}", crow['ghost_ok'] and crow['one_side'])
    for sm in seams:
        if A <= sm['t'] <= B and not any(abs(sm['t'] - c) < 1.5 / 60 for c in cuts):
            # a seam at the window's edge (a plate boundary): reported, it gates the cut it belongs to
            G('CUTS', f"seam {sm.get('cut')}", sm.get('cut', '?'), 'PASS' if sm.get('pass') else 'FAIL', 'render.ts seam PASS', bool(sm.get('pass')), note=sm.get('note', ''))
    if cq.get('verdict'):
        G('CUTS', 'cutqa', 'window', cq['verdict'], 'PASS', cq['verdict'] == 'PASS', note=cq.get('note', ''))
    # ================================================================ PERF
    pf = end.get('perf')
    if pf:
        pf['idle'] = (pf.get('load') or 99) < CFG['perf']['idle_load_max']
        ok = pf['p95'] <= CFG['perf']['p95_ms'] if pf['idle'] else None
        G('PERF', 'p95 ms / sub-frame', 'window', round(pf['p95'], 1), f"≤ {CFG['perf']['p95_ms']} (idle)", ok,
          note=f"avg {pf['avg']:.1f} · load {pf.get('load', '?')}" + (f" · zz_look2 p95 {pf['ref_p95']:.1f} → ratio {pf['p95'] / pf['ref_p95']:.2f}" if pf.get('ref_p95') else '') + ('' if pf.get('idle') else ' · machine loaded: judge the ratio'))
    return report(run, end, shots, gates, imp_rows, wrows, cut_rows, A, B)


# ================================================================ report: table, JSON, strips


def report(run, end, shots, gates, imp_rows, wrows, cut_rows, A, B):
    F = run.frames
    lines = []
    head = f"GATES {run.label or ''} {A:.3f}–{B:.3f}  ({', '.join(s['name'] + ('*' if s['partial'] else '') for s in shots)})  {len(F)} frames @ {run.fps:g} fps, {'half' if run.half else 'full'}-res analysis{'' if end.get('has_page') else '  [pixels only: no page data]'}"
    lines.append(head)
    groups = ['LIGHT', 'FLIGHT', 'LYRICS', 'IMPACTS', 'CUTS', 'PERF']
    cols = [s['name'] for s in shots]
    # matrix: per-shot gates (gate rows × shot columns); window-level and per-item gates listed below each group
    for g in groups:
        gg = [x for x in gates if x.group == g]
        if not gg:
            continue
        lines.append('')
        lines.append(g)
        per_shot = {}
        other = []
        for x in gg:
            if x.scope in cols and not x.name.startswith(('cap @onset', 'handoff', 'no ghost')) and g not in ('IMPACTS',) or (g == 'IMPACTS' and x.name.startswith('flat white')):
                per_shot.setdefault(x.name, {})[x.scope] = x
            else:
                other.append(x)
        if per_shot:
            w0 = max(len(k) for k in per_shot) + 2
            lines.append(' ' * (w0 + 2) + ''.join(f'{c:>16}' for c in cols) + '   limit')
            for k, d in per_shot.items():
                lim = next(iter(d.values())).limit
                cells = ''
                for c in cols:
                    x = d.get(c)
                    if x is None:
                        cells += f'{"":>16}'
                        continue
                    mark = ' ' if x.ok is None else '~' if x.info else ('✓' if x.ok else '✗')
                    cells += f'{fv(x.value):>14} {mark}'
                lines.append(f'  {k:<{w0}}{cells}   {lim}')
                for c in cols:
                    x = d.get(c)
                    if x is not None and x.ok is False and not x.info and x.note:
                        lines.append(f'      {c}: {x.note}')
        for x in other:
            mark = '  ' if x.ok is None else '~ ' if x.info else ('✓ ' if x.ok else '✗ ')
            lines.append(f'  {mark}{x.name:<34} {x.scope:<14} {fv(x.value):>14}  {x.limit:<28} {x.note}')
    nfail = sum(1 for x in gates if x.ok is False and not x.info)
    npass = sum(1 for x in gates if x.ok is True and not x.info)
    nna = sum(1 for x in gates if x.ok is None and not x.info)
    verdict = 'PASS' if nfail == 0 else 'FAIL'
    lines.append('')
    lines.append(f'RESULT: {verdict} — {npass} gates pass, {nfail} fail, {nna} not measurable in this run  (~ = info: a part of a section; ✓/✗ on the whole section only)')
    fails_by = {}
    for x in gates:
        if x.ok is False and not x.info:
            fails_by.setdefault(x.group, []).append(f'{x.name} [{x.scope}]')
    for g, xs in fails_by.items():
        lines.append(f'  {g}: ' + '; '.join(xs[:12]) + (f' … +{len(xs) - 12}' if len(xs) > 12 else ''))
    txt = '\n'.join(lines)
    # strips
    strip = worst_strip(run, gates)
    istrip = impact_strip(run, imp_rows)
    if strip:
        txt += f'\nworst frames: {strip}'
    if istrip:
        txt += f'\nimpact frames: {istrip}'
    print(txt)
    with open(os.path.join(run.out, 'gates.txt'), 'w') as fh:
        fh.write(txt + '\n')
    slim = []
    for f in F:
        d = {k: v for k, v in f.items() if k not in ('faces', 'labels', 'fleck_xy', 'qa')}
        d['faces'] = [{k: v for k, v in fc.items() if k != 'q'} for fc in f.get('faces', [])]
        d['labels'] = [{k: v for k, v in L.items() if k != 'q'} for L in f.get('labels', [])]
        d['qa_fails'] = len((f.get('qa') or {}).get('fails') or [])
        slim.append(d)
    J = {'mode': 'gates', 'label': run.label, 'window': [A, B], 'fps': run.fps, 'half': run.half, 'verdict': verdict,
         'counts': {'pass': npass, 'fail': nfail, 'na': nna}, 'shots': [{k: v for k, v in s.items() if k != 'idx'} for s in shots],
         'gates': [x.j() for x in gates], 'impacts': imp_rows, 'words': wrows, 'cuts': cut_rows, 'perf': end.get('perf'),
         'hits': end.get('hits'), 'thresholds': {k: CFG[k] for k in ('light', 'flight', 'lyrics', 'impacts', 'cuts', 'perf')},
         'timing': {'light_s': round(run.t_light, 1), 'flow_s': round(run.t_flow, 1), 'misc_s': round(run.t_misc, 1)},
         'strip': strip, 'impact_strip': istrip, 'frames': slim}
    with open(os.path.join(run.out, 'gates.json'), 'w') as fh:
        json.dump(J, fh, indent=1, default=lambda o: o.tolist() if hasattr(o, 'tolist') else str(o))
    print(os.path.join(run.out, 'gates.txt'))
    print(os.path.join(run.out, 'gates.json'))
    return 0 if verdict == 'PASS' else 1


def _thumb(run, i):
    jb = run.thumbs.get(i)
    if jb is None:
        return None
    return Image.open(__import__('io').BytesIO(jb)).convert('RGB')


def _annotate(run, i, label):
    im = _thumb(run, i)
    if im is None:
        return None
    f = run.frames[i]
    d = ImageDraw.Draw(im)
    s = 480 / FW
    col = {'current': (80, 255, 120), 'sung': (160, 220, 160)}
    for fc in f.get('faces', []):
        q = [(x * s, y * s) for x, y in fc['q']]
        # red / orange only where the face fails (legible before it is sung / an earlier line still bright or sharp)
        c = (255, 70, 70) if unsung_bad(fc) else (255, 170, 60) if old_bad(fc) else col.get(fc['state'], (105, 105, 105))
        d.line(q + [q[0]], fill=c, width=2 if c != (105, 105, 105) else 1)
    for L in f.get('labels', []):
        if L['readable']:
            q = [(x * s, y * s) for x, y in L['q']]
            d.line(q + [q[0]], fill=(60, 200, 255), width=2)
    for p in f.get('pools', []) if len(f.get('pools', [])) > TL['pool_group_max'] else []:
        x, y, r = p['x'] * 480 / SW, p['y'] * 480 / SW, p['r'] * 480 / SW + 2
        d.ellipse([x - r, y - r, x + r, y + r], outline=(255, 255, 0), width=1)
    for x, y in f.get('fleck_xy', [])[:60]:
        d.rectangle([x * s - 3, y * s - 3, x * s + 3, y * s + 3], outline=(255, 60, 255), width=1)
    if 'key' in f:
        x, y = f['key']['at'][0] * s, f['key']['at'][1] * s
        c = (80, 255, 120) if f['key']['ok'] else (255, 70, 70)
        d.line([x - 8, y, x + 8, y], fill=c, width=2); d.line([x, y - 8, x, y + 8], fill=c, width=2)
    try:
        font = ImageFont.truetype(FONT, 13)
    except Exception:
        font = ImageFont.load_default()
    d.rectangle([0, 0, 480, 18], fill=(0, 0, 0))
    d.text((3, 2), label[:70], fill=(255, 220, 120), font=font)
    d.rectangle([0, 252, 480, 270], fill=(0, 0, 0))
    d.text((3, 254), f"Y' {f['luma']:.3f} p2 {f['p2']:.3f} murk {f['murk']:.0f}% edge {100 * f['edge']:.1f}% top5 {100 * f['top5']:.0f}% flow {fmt(f.get('med_all'))}", fill=(220, 220, 220), font=font)
    return im


def worst_strip(run, gates, maxn=16):
    F = run.frames
    T = np.array([f['t'] for f in F])
    picks = []
    for x in gates:
        if x.ok is False and not x.info:
            for t, v in x.worst[:2]:
                if t is None:
                    continue
                i = int(np.argmin(np.abs(T - t)))
                picks.append((i, f'{x.name} {x.scope}: {fv(v)}'))
    if not picks:
        return None
    by = {}
    for i, lab in picks:
        by.setdefault(i, []).append(lab)
    sel = sorted(by.items())[:maxn]
    tiles = [_annotate(run, i, f"{F[i]['t']:.3f} {F[i].get('shot', '')} · " + ' | '.join(labs)) for i, labs in sel]
    tiles = [t for t in tiles if t is not None]
    if not tiles:
        return None
    cols = 4
    rows = (len(tiles) + cols - 1) // cols
    S = Image.new('RGB', (cols * 484 + 4, rows * 274 + 4), (18, 18, 18))
    for k, im in enumerate(tiles):
        S.paste(im, (4 + (k % cols) * 484, 4 + (k // cols) * 274))
    p = os.path.join(run.out, 'gates_worst.png')
    S.save(p)
    return p


def impact_strip(run, rows):
    if not rows:
        return None
    F = run.frames
    T = np.array([f['t'] for f in F])
    offs = [-0.05, 0.0, 1 / 60, 3 / 60, 0.12, 0.3]
    S = Image.new('RGB', (len(offs) * 484 + 4, len(rows) * 274 + 4), (18, 18, 18))
    for r, row in enumerate(rows):
        for k, o in enumerate(offs):
            i = int(np.argmin(np.abs(T - (row['t'] + o))))
            im = _annotate(run, i, f"{row['level']} {row['label']} {row['t']:.3f} {o * 1000:+.0f}ms {'PASS' if row['pass'] else 'FAIL'}")
            if im is not None:
                S.paste(im, (4 + k * 484, 4 + r * 274))
    p = os.path.join(run.out, 'gates_impacts.png')
    S.save(p)
    return p


# ================================================================ inputs


def read_exact(fh, n):
    buf = bytearray()
    while len(buf) < n:
        b = fh.read(n - len(buf))
        if not b:
            break
        buf += b
    return bytes(buf)


def main_stream(a):
    run = None
    fh = sys.stdin.buffer
    end = {}
    n = 0
    t0 = time.perf_counter()
    while True:
        magic = read_exact(fh, 4)
        if len(magic) < 4:
            print('gates: stream ended without an end record', file=sys.stderr)
            break
        if magic != b'GF01':
            print(f'gates: bad record magic {magic!r}', file=sys.stderr); return 2
        L = struct.unpack('<I', read_exact(fh, 4))[0]
        hdr = json.loads(read_exact(fh, L).decode('utf-8'))
        if hdr.get('end'):
            end = hdr
            break
        if run is None:
            run = Run(a.out, hdr.get('fps', 60), bool(hdr.get('half')), TL['magenta_step_s'], hdr.get('label', ''))
        px = read_exact(fh, hdr['bytes'])
        w, h = hdr['w'], hdr['h']
        img = np.frombuffer(px, np.uint8).reshape(h, w, 3)
        if hdr.get('flip'):
            img = img[::-1]
        if run.half:
            img = cv2.resize(img, (w // 2, h // 2), interpolation=cv2.INTER_AREA)
        else:
            img = np.ascontiguousarray(img)
        run.add(img, hdr['t'], hdr.get('meta'))
        n += 1
        if n % 30 == 0:
            el = time.perf_counter() - t0
            print(f'  analyzed {n} frames ({n / el:.1f}/s)', file=sys.stderr, flush=True)
    if run is None:
        print('gates: no frames received', file=sys.stderr); return 2
    end['has_page'] = True
    return finalize(run, end)


def static_end(a, A, B):
    s = CFG['static']
    aud = json.load(open(os.path.join(ROOT, 'data', 'audio.json')))
    return {'window': [A, B], 'cuts': s['cuts'], 'hits': [{'t': t, 'level': lv, 'label': lab, 'src': 'static'} for t, lv, lab in s['hits']],
            'downbeats': aud['downbeats'], 'sections': [{'name': n, 'start': x, 'end': y} for n, x, y in CFG['sections']], 'has_page': False}


def main_video(a):
    probe = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames', '-of', 'json', a.video], capture_output=True, check=True).stdout)['streams'][0]
    vw, vh = int(probe['width']), int(probe['height'])
    num, den = probe['r_frame_rate'].split('/')
    vfps = float(num) / float(den)
    fps = a.fps or vfps
    stepk = max(1, int(round(vfps / fps)))
    A, B = a.frm, a.to
    end = json.load(open(a.meta)) if a.meta else static_end(a, A, B)
    end['window'] = [A, B]
    if a.meta:
        end.setdefault('has_page', False)
    half = bool(a.half)
    W, H = (FW // 2, FH // 2) if half else (FW, FH)
    k0 = max(0, int(math.ceil((A - a.vt0) * vfps - 1e-6)))
    k1 = int(math.ceil((B - a.vt0) * vfps - 1e-6))
    run = Run(a.out, fps, half, TL['magenta_step_s'], a.label or os.path.basename(a.video))
    sel = f"select='between(n\\,{k0}\\,{k1 - 1})*not(mod(n-{k0}\\,{stepk}))'"
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', a.video, '-vf', f'{sel},scale={W}:{H}:flags=area:in_color_matrix=bt709:in_range=tv:out_range=pc,format=rgb24', '-vsync', '0', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    # the flow input decoded exactly as the director's flow.py does it (ffmpeg area scale to 640x360): same flow, same cam
    q = subprocess.Popen(['ffmpeg', '-v', 'error', '-i', a.video, '-vf', f'{sel},scale={SW}:{SH}:flags=area:in_color_matrix=bt709:in_range=tv,format=rgb24', '-vsync', '0', '-f', 'rawvideo', '-'], stdout=subprocess.PIPE)
    fb, sb = W * H * 3, SW * SH * 3
    k = k0
    t0 = time.perf_counter()
    n = 0
    while True:
        buf = read_exact(p.stdout, fb)
        sbuf = read_exact(q.stdout, sb)
        if len(buf) < fb or len(sbuf) < sb:
            break
        t = a.vt0 + k / vfps
        run.add(np.frombuffer(buf, np.uint8).reshape(H, W, 3), t, None, np.frombuffer(sbuf, np.uint8).reshape(SH, SW, 3))
        k += stepk; n += 1
        if n % 60 == 0:
            print(f'  analyzed {n} frames ({n / (time.perf_counter() - t0):.1f}/s)', file=sys.stderr, flush=True)
    p.wait(); q.wait()
    return finalize(run, end)


def main_calib(a):
    """busy.py parity: pdoom sheet tiles and the review-3 stills (+ the full light set on both)."""
    os.makedirs(a.out, exist_ok=True)
    P = cv2.imread(os.path.join(ROOT, 'reference', 'pdoom-sheet.png'))
    H, W = P.shape[:2]; cw, ch = W // 4, H // 6
    rows = []
    for r in range(6):
        for c in range(4):
            tile = cv2.cvtColor(P[r * ch + 18:(r + 1) * ch - 4, c * cw + 4:(c + 1) * cw - 4], cv2.COLOR_BGR2RGB)
            small = cv2.resize(tile, (SW, SH), interpolation=cv2.INTER_AREA)
            m = light_small(small)
            Y = (small.astype(np.float32) / 255) @ W709
            m['luma'] = round(float(Y.mean()), 4)
            m['pools'] = len(pool_group(pool_feats(small)))
            m['murk'] = round(CS.murk(Image.fromarray(small)), 1)
            rows.append(('pdoom', r * 4 + c, m))
    import glob
    for f in sorted(glob.glob(a.stills or os.path.join(ROOT, 'out/wip/p1v3/review3/colorstat/frames/f_*.png'))):
        img = cv2.cvtColor(cv2.imread(f), cv2.COLOR_BGR2RGB)
        small = cv2.resize(img, (SW, SH), interpolation=cv2.INTER_AREA)
        m = light_small(small)
        m['luma'] = round(float(((img.astype(np.float32) / 255) @ W709).mean()), 4)
        m['pools'] = len(pool_group(pool_feats(small)))
        m['murk'] = round(CS.murk(Image.fromarray(img)), 1)
        rows.append(('stills', os.path.basename(f), m))
    out = {}
    for name in ('pdoom', 'stills'):
        R = [m for n, _, m in rows if n == name]
        if not R:
            continue
        col = lambda k: np.array([x[k] for x in R if x[k] is not None], float)
        out[name] = {'n': len(R), 'edge_density': round(float(col('edge').mean()), 4), 'gray_luma': round(float(col('gray').mean()), 3), 'top5_share': round(float(col('top5').mean()), 3),
                     'display_luma': round(float(col('luma').mean()), 3), 'lab_a_median': round(float(np.median(col('lab_a'))), 2) if len(col('lab_a')) else None,
                     'lab_b_median': round(float(np.median(col('lab_b'))), 2) if len(col('lab_b')) else None, 'pool_group_max': int(col('pools').max()),
                     'pool_frames_ge4': round(float((col('pools') > TL['pool_group_max']).mean()), 3), 'murk_mean': round(float(col('murk').mean()), 1)}
        print(f"{name:7} n={len(R):3d}  edge {100 * out[name]['edge_density']:5.2f}%  gray {out[name]['gray_luma']:.3f}  top5 {100 * out[name]['top5_share']:5.1f}%  "
              f"Y' {out[name]['display_luma']:.3f}  a*/b* {fmt(out[name]['lab_a_median'])}/{fmt(out[name]['lab_b_median'])}  pools max {out[name]['pool_group_max']} (frames ≥4: {100 * out[name]['pool_frames_ge4']:.0f}%)  murk {out[name]['murk_mean']}%")
    json.dump({'summary': out, 'rows': [[n, k, m] for n, k, m in rows]}, open(os.path.join(a.out, 'calib.json'), 'w'), indent=1)
    print(os.path.join(a.out, 'calib.json'))
    return 0


def main():
    ap = argparse.ArgumentParser(description='p1v4 gate runner analyzer')
    sub = ap.add_subparsers(dest='cmd', required=True)
    s = sub.add_parser('stream'); s.add_argument('--out', required=True)
    v = sub.add_parser('video'); v.add_argument('video'); v.add_argument('--vt0', type=float, required=True); v.add_argument('--from', dest='frm', type=float, required=True)
    v.add_argument('--to', type=float, required=True); v.add_argument('--out', required=True); v.add_argument('--fps', type=float, default=None); v.add_argument('--half', action='store_true')
    v.add_argument('--meta', default=None); v.add_argument('--static', action='store_true'); v.add_argument('--label', default='')
    c = sub.add_parser('calib'); c.add_argument('--out', required=True); c.add_argument('--stills', default=None)
    a = ap.parse_args()
    if a.cmd == 'stream':
        return main_stream(a)
    if a.cmd == 'video':
        return main_video(a)
    return main_calib(a)


if __name__ == '__main__':
    sys.exit(main())
