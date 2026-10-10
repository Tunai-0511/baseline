#!/usr/bin/env python3
"""colorstat (TREATMENT §5.2 rule 5, §5.5, §5.6, App. C "色彩與光"): palette discipline per still. Owner: tooling.

  tools/.venv/bin/python app/scripts/colorstat.py <dir or png...> [--json out.json] [--manifest m.json] [--video] [--exempt]
  (a dir is read as f_*.png; for a video: ffmpeg -i in.mp4 dir/f_%04d.png, then --video)
  bun scripts/render.ts colorstat --from a --to b [--n 12 | --step s]   renders the stills + manifest and runs this

Per frame:
  hot%     bright magenta (hue 315-350°, S > 0.55, V > 0.6) = the lamp                  gate: <= 5%      (§5.2.5)
  cast%    any magenta tint (hue 300-355°, S > 0.22, V > 0.12)                          gate: <= 15%     (§5.2.5)
  pink     magenta-hue pixels whose green channel is above 0.55 (sRGB): magenta mixed toward bone. gate: <= 40 px
           (counted only where S > 0.2: a visible pale pink, not a grey with a hint of grain; the 40 px (0.002 %)
           allowance is for isolated chromatic-aberration fringes on specular highlights, never a pink area)
  pale%    pale magenta fills (hue 300-350°, 0.18 < S < 0.55, V > 0.45): magenta cooling or mixing toward bone.
           gate: <= 0.05% of the frame (run it on frames extracted from the video, where a fade is caught
           mid-way; anti-aliased magenta/bone edges stay far under it)
  haze%    PINK HAZE: the largest connected area of smooth, low-saturation pink (magenta fog, magenta bloom/halation
           wash, a pink-lit veil): 16 px blocks whose mean is magenta-hued (295-355°; the violet ink is ~260°) with 0.05 < S < 0.45 and V > 0.02,
           whose texture is smooth (V std < 0.035 in the block), 8-connected. gate: <= 2% of the frame
           (§5.2: no magenta fog; the sig light's pool on a textured surface is not smooth and does not count)
  bone%    near-white neutral pixels (S < 0.12, V > 0.75)        gate: >= 10% while a HOOK word is sung in a chorus
           (§5.2.5 "hook 段正在唱的主字"; manifest "hook": true; without a manifest it is only reported)
  APL      mean linear luminance (info; the §5.6 linear targets are superseded by the p1v3 display targets below)

p1v3 display targets (replace TREATMENT §5.5/§5.6 where they conflict), all on the display-referred frame's luma
Y' = 0.2126 R' + 0.7152 G' + 0.0722 B' (sRGB-encoded values, 0..1):
  luma     mean Y' of the frame. Per SHOT (manifest "shot"): mean >= 0.20.  Per SECTION: mean within the
           manifest "luma" target (default [0.24, 0.34]).                    gate per shot / per section
  p2       2nd percentile of Y' (real blacks)                    gate: <= 0.02 per frame
  p99      99th percentile of Y' (real highlights)               gate: >= 0.85 per frame
  murk%    GREY VEIL: share of the frame that is dull grey all around — pixels whose ~52 px neighbourhood (13 px at
           480 x 270) has no real black (local min Y' > 0.05), no highlight (local max Y' < 0.45) and little colour
           (local mean S < 0.25). A lifted black level or a fog wash over the frame reads as murk; dense shadows,
           lit subjects and coloured light do not. A plain exposure lift raises it (the veil gets brighter, not
           denser).                                              gate: <= 20 % per frame
  mag      magenta visible: hot% >= 0.1. Over the frames where the SOTA machine is on screen (manifest "sota":
           true): at least 60 % must show magenta.               gate over the run (needs "sota" in the manifest)
Manifest keys used by the targets: "shot" (e.g. "chorus1@46.732"), "luma" [lo, hi], "sota" (bool).
  near field (§5.2.2: the sig's local light within 12 m, and the thin ring outside the white-hot core, ARE allowed
           magenta): pink / pale / haze are not gated inside the lamp near-field zone = pixels within
           R = max(24 px, 4 × the largest core's equivalent radius) of a bright-magenta lamp core (a `hot` component of
           >= 12 px). Those pixels are reported as pink_nf / pale_nf% / nf% (zone area). hot% and cast% stay global, so
           a close-up can never hide a large magenta area.
The 112.33-112.79 full-frame magenta beat is the only exception (pass --exempt to skip the gates for a file).
Manifest (written by render.ts colorstat): {"f_0045.80.png": {"t": 45.8, "section": "chorus1", "apl": [0.07, 0.07],
"hook": false, "sung": ["YOU"]}, ...}. Exit code 1 if any frame fails a gate. The JSON has the rows and a summary.
"""
import sys, json, glob, os
import numpy as np
from PIL import Image

try:
    from scipy import ndimage
except Exception:  # pragma: no cover - scipy is in tools/.venv
    ndimage = None

HAZE_GATE = 2.0  # % of the frame
# p1v3 display targets
SHOT_LUMA_MIN = 0.20
SECTION_LUMA = (0.24, 0.34)
P2_MAX = 0.02
P99_MIN = 0.85
MURK_GATE = 20.0   # % of the frame
MURK_LO, MURK_HI, MURK_S, MURK_WIN = 0.05, 0.45, 0.25, 13
MAG_HOT = 0.1      # hot% for "magenta visible"
MAG_RATIO = 0.60   # of the frames with the SOTA machine on screen
NF_MIN_PX = 12   # a bright-magenta component this large is a lamp core with a near field
NF_MIN_R = 24    # px
NF_K = 4.0       # near-field radius in units of the core's equivalent radius
PINK_PX = 40     # isolated CA fringe pixels allowed per still
BONE_GATE = 10.0
BLOCK = 16


def hsv(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx, mn = a.max(-1), a.min(-1)
    v = mx
    s = np.where(mx > 1e-6, (mx - mn) / np.maximum(mx, 1e-6), 0)
    d = np.maximum(mx - mn, 1e-6)
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60.0
    return h, s, v


def nearfield(hot):
    """Lamp near-field zone (bool mask): within R px of any bright-magenta lamp core of >= NF_MIN_PX px."""
    zone = np.zeros(hot.shape, bool)
    if ndimage is None or hot.sum() < NF_MIN_PX:
        return zone
    lab, n = ndimage.label(hot, structure=np.ones((3, 3)))
    sizes = np.bincount(lab.ravel())
    keep = np.nonzero(sizes >= NF_MIN_PX)[0]
    keep = keep[keep > 0]
    if not len(keep):
        return zone
    core = np.isin(lab, keep)
    r = float(np.sqrt(sizes[keep].max() / np.pi))
    R = max(NF_MIN_R, NF_K * r)
    return ndimage.distance_transform_edt(~core) <= R


def haze(a, zone=None):
    """Largest 8-connected region of smooth low-saturation pink blocks, % of the frame (and total pink-veil %).
    Blocks whose centre lies in the lamp near-field `zone` are not counted."""
    H, W = a.shape[0] // BLOCK, a.shape[1] // BLOCK
    blk = a[: H * BLOCK, : W * BLOCK].reshape(H, BLOCK, W, BLOCK, 3)
    mean = blk.mean(axis=(1, 3))
    vstd = blk.max(-1).std(axis=(1, 3))
    h, s, v = hsv(mean)
    pink = (h >= 295) & (h <= 355) & (s > 0.05) & (s < 0.45) & (v > 0.02) & (vstd < 0.035)
    if zone is not None and zone.any():
        pink &= ~zone[BLOCK // 2: H * BLOCK: BLOCK, BLOCK // 2: W * BLOCK: BLOCK]
    total = 100.0 * pink.sum() / pink.size
    if not pink.any():
        return 0.0, total
    if ndimage is not None:
        lab, n = ndimage.label(pink, structure=np.ones((3, 3)))
        largest = np.bincount(lab.ravel())[1:].max() if n else 0
    else:
        largest = pink.sum()
    return 100.0 * largest / pink.size, total


def murk(img):
    """Grey veil: % of the frame (at 480 x 270) that is dull grey all around (see the module docstring)."""
    small = np.asarray(img.resize((480, 270), Image.BOX)).astype(np.float32) / 255.0
    L = small[..., 0] * 0.2126 + small[..., 1] * 0.7152 + small[..., 2] * 0.0722
    mx, mn = small.max(-1), small.min(-1)
    S = (mx - mn) / np.maximum(mx, 1e-4)
    if ndimage is None:
        return 0.0
    lo = ndimage.minimum_filter(L, MURK_WIN)
    hi = ndimage.maximum_filter(L, MURK_WIN)
    Sl = ndimage.uniform_filter(S, MURK_WIN)
    return 100.0 * float(((lo > MURK_LO) & (hi < MURK_HI) & (Sl < MURK_S)).mean())


def magenta(a):
    """The magenta / bone numbers of one frame (a: H x W x 3 float32 sRGB 0..1), exactly as stats() reports them.
    (p1v4: shared with scripts/gates.py, which runs it on frames in memory.)"""
    g = a[..., 1]
    h, s, v = hsv(a)
    mag = (h >= 300) & (h <= 355)
    hot = mag & (h >= 315) & (h <= 350) & (s > 0.55) & (v > 0.6)
    cast = mag & (s > 0.22) & (v > 0.12)
    pink = mag & (s > 0.2) & (g > 0.55)
    pale = (h >= 300) & (h <= 350) & (s > 0.18) & (s < 0.55) & (v > 0.45)
    bone = (s < 0.12) & (v > 0.75)
    n = a.shape[0] * a.shape[1]
    zone = nearfield(hot)
    hz, veil = haze(a, zone)
    return {
        'hot%': round(100 * hot.sum() / n, 3), 'cast%': round(100 * cast.sum() / n, 2),
        'pink_px': int((pink & ~zone).sum()), 'pale%': round(100 * (pale & ~zone).sum() / n, 3), 'haze%': round(hz, 2), 'veil%': round(veil, 2),
        'pink_nf': int((pink & zone).sum()), 'pale_nf%': round(100 * (pale & zone).sum() / n, 3), 'nf%': round(100 * zone.sum() / n, 2),
        'bone%': round(100 * bone.sum() / n, 2),
    }


def stats(path):
    img = Image.open(path).convert('RGB')
    a = np.asarray(img).astype(np.float32) / 255.0
    lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
    Y = lin[..., 0] * 0.2126 + lin[..., 1] * 0.7152 + lin[..., 2] * 0.0722
    Yd = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722  # display luma Y' (p1v3 targets)
    m = magenta(a)
    return {
        'file': os.path.basename(path), **{k: m[k] for k in ('hot%', 'cast%', 'pink_px', 'pale%', 'haze%', 'veil%', 'pink_nf', 'pale_nf%', 'nf%', 'bone%')},
        'APL': round(float(Y.mean()), 4),
        'luma': round(float(Yd.mean()), 4), 'p2': round(float(np.percentile(Yd, 2)), 3), 'p99': round(float(np.percentile(Yd, 99)), 3),
        'murk%': round(murk(img), 1),
    }


def display_targets(rows, man, summary):
    """p1v3 display targets over the run: per-shot and per-section mean luma, frame gates, magenta ratio. Prints a
    PASS/FAIL block, stores it in summary['display'], returns the number of failing run-level gates."""
    col = lambda rs, k: np.array([r[k] for r in rs], dtype=np.float64)
    lit = [r for r in rows if not man.get(r['file'], {}).get('dark')]
    out, fails = {}, 0
    print('\np1v3 display targets (display luma Y\' on the sRGB frame)')
    L = col(rows, 'luma')
    out['frames'] = {'n': len(rows), 'luma_mean': round(float(L.mean()), 4), 'luma_min': round(float(L.min()), 4), 'luma_max': round(float(L.max()), 4),
                     'p2_ok': int(sum(r['p2'] <= P2_MAX for r in lit)), 'p99_ok': int(sum(r['p99'] >= P99_MIN for r in lit)),
                     'murk_ok': int(sum(r['murk%'] <= MURK_GATE for r in lit)), 'lit_frames': len(lit),
                     'p2_median': round(float(np.median(col(rows, 'p2'))), 3), 'p99_median': round(float(np.median(col(rows, 'p99'))), 3),
                     'murk_mean': round(float(col(rows, 'murk%').mean()), 1)}
    f = out['frames']
    print(f"  frames   {f['n']}: luma mean {f['luma_mean']} ({f['luma_min']}–{f['luma_max']}) | p2 <= {P2_MAX}: {f['p2_ok']}/{f['lit_frames']} (median {f['p2_median']})"
          f" | p99 >= {P99_MIN}: {f['p99_ok']}/{f['lit_frames']} (median {f['p99_median']}) | murk <= {MURK_GATE:.0f}%: {f['murk_ok']}/{f['lit_frames']} (mean {f['murk_mean']}%)")
    # per shot
    shots = {}
    for r in rows:
        if 'shot' in r:
            shots.setdefault(r['shot'], []).append(r)
    out['shots'] = []
    if shots:
        print(f"  shots    mean luma >= {SHOT_LUMA_MIN} per shot:")
        nbad = 0
        for k, rs in sorted(shots.items(), key=lambda kv: min(x.get('t', 0) for x in kv[1])):
            m = float(col(rs, 'luma').mean())
            dark = all(man.get(x['file'], {}).get('dark') for x in rs)
            ok = dark or m >= SHOT_LUMA_MIN
            nbad += not ok
            t0, t1 = min(x.get('t', 0) for x in rs), max(x.get('t', 0) for x in rs)
            out['shots'].append({'shot': k, 't0': t0, 't1': t1, 'frames': len(rs), 'luma': round(m, 4), 'pass': ok})
            print(f"    {'PASS' if ok else 'FAIL'}  {k:<22} {t0:7.2f}–{t1:7.2f}  {len(rs):>3} frames  luma {m:.3f}{'  (dark by design)' if dark else ''}")
        print(f"  shots    {'PASS' if not nbad else 'FAIL'}: {len(shots) - nbad}/{len(shots)} shots at mean luma >= {SHOT_LUMA_MIN}")
        fails += bool(nbad)
    else:
        print('  shots    — (no "shot" ids in the manifest)')
    # per section
    secs = {}
    for r in rows:
        if 'section' in r:
            secs.setdefault(r['section'], []).append(r)
    out['sections'] = []
    for k, rs in secs.items():
        tgt = man.get(rs[0]['file'], {}).get('luma') or list(SECTION_LUMA)
        m = float(col(rs, 'luma').mean())
        ok = tgt[0] <= m <= tgt[1]
        fails += not ok
        out['sections'].append({'section': k, 'frames': len(rs), 'luma': round(m, 4), 'target': tgt, 'pass': ok})
        print(f"  section  {'PASS' if ok else 'FAIL'}  {k:<10} {len(rs):>3} frames  mean luma {m:.3f}  target {tgt[0]:.2f}–{tgt[1]:.2f}")
    # magenta while the SOTA machine is on screen
    so = [r for r in rows if r.get('sota') is True]
    if any('sota' in r for r in rows):
        k = sum(r['mag'] for r in so)
        ratio = k / len(so) if so else 1.0
        ok = ratio >= MAG_RATIO
        fails += not ok
        out['magenta'] = {'sota_frames': len(so), 'magenta_frames': k, 'ratio': round(ratio, 3), 'pass': ok}
        print(f"  magenta  {'PASS' if ok else 'FAIL'}: {k}/{len(so)} frames with the SOTA machine on screen show magenta (hot >= {MAG_HOT}%): {100 * ratio:.0f}% (target >= {100 * MAG_RATIO:.0f}%)")
    else:
        out['magenta'] = None
        print('  magenta  — (no "sota" flags in the manifest)')
    fr = sum(any(g in r['fails'] for g in ('p2', 'p99', 'murk')) for r in rows)
    print(f"  frame gates (p2 / p99 / murk): {fr} of {len(rows)} frames fail")
    out['verdict'] = 'PASS' if not fails and not fr else 'FAIL'
    print(f"  RESULT: {out['verdict']}")
    summary['display'] = out
    return fails


def main():
    argv = sys.argv[1:]
    val = lambda k: argv[argv.index(k) + 1] if k in argv and argv.index(k) + 1 < len(argv) else None
    out, man_path = val('--json'), val('--manifest')
    skip = {out, man_path}
    args = [x for x in argv if not x.startswith('--') and x not in skip]
    exempt = '--exempt' in argv
    # --video: frames from a render; anti-aliased / motion-blurred edges between magenta and bone make a few pale
    # pixels on any frame with a magenta rule on paper, so there the area gate (pale%) is the one that counts
    edges_ok = '--video' in argv
    man = json.load(open(man_path)) if man_path else {}
    files = []
    for x in args:
        if x.endswith('.json'):
            continue
        files += sorted(glob.glob(os.path.join(x, 'f_*.png'))) if os.path.isdir(x) else [x]
    rows, bad = [], 0
    print(f"{'file':<18} {'t':>7} {'section':<8} {'hot%':>6} {'cast%':>6} {'pink':>6} {'pale%':>6} {'haze%':>6} {'bone%':>6} {'APL':>7} {'luma':>6} {'p2':>6} {'p99':>6} {'murk%':>6} {'sota':>4}  gates")
    for f in files:
        st = stats(f)
        m = man.get(os.path.basename(f), {})
        st.update({k: m[k] for k in ('t', 'section', 'hook', 'sung', 'shot', 'entry', 'sota') if k in m})
        st['mag'] = bool(st['hot%'] >= MAG_HOT)
        fails, notes = [], []
        if not exempt:
            if st['hot%'] > 5: fails.append('hot')
            if st['cast%'] > 15: fails.append('cast')
            if st['pink_px'] > PINK_PX and not edges_ok: fails.append('pink')
            if st['pale%'] > 0.05: fails.append('pale')
            if st['haze%'] > HAZE_GATE: fails.append('haze')
            if m.get('hook') and st['bone%'] < BONE_GATE: fails.append('bone')
        # p1v3 display targets (per frame); blackout sections ("dark": true in the manifest) are exempt
        if not m.get('dark'):
            if st['p2'] > P2_MAX: fails.append('p2')
            if st['p99'] < P99_MIN: fails.append('p99')
            if st['murk%'] > MURK_GATE: fails.append('murk')
        apl = m.get('apl')
        if apl:
            # legacy §5.6 linear APL targets (superseded): a note only
            lo, hi = apl
            st['apl_note'] = 'low' if st['APL'] < lo / 1.5 else 'high' if st['APL'] > hi * 1.5 else 'ok'
            if st['apl_note'] != 'ok': notes.append(f"§5.6 APL {st['apl_note']}")
        st['fails'] = fails
        st['notes'] = notes
        bad += bool(fails)
        rows.append(st)
        t = f"{m['t']:.2f}" if 't' in m else ''
        gate = ('FAIL ' + ','.join(fails)) if fails else 'ok'
        so = '' if 'sota' not in m else ('MAG' if m['sota'] and st['mag'] else 'sota' if m['sota'] else '')
        print(f"{st['file']:<18} {t:>7} {m.get('section', ''):<8} {st['hot%']:>6} {st['cast%']:>6} {st['pink_px']:>6} {st['pale%']:>6} {st['haze%']:>6} {st['bone%']:>6} {st['APL']:>7} {st['luma']:>6} {st['p2']:>6} {st['p99']:>6} {st['murk%']:>6} {so:>4}  {gate}{'  (' + '; '.join(notes) + ')' if notes else ''}{'  hook' if m.get('hook') else ''}")
    summary = {}
    if rows:
        col = lambda k: np.array([r[k] for r in rows], dtype=np.float64)
        summary = {
            'frames': len(rows), 'failing': bad,
            'hot%': {'mean': round(float(col('hot%').mean()), 3), 'max': round(float(col('hot%').max()), 3)},
            'cast%': {'mean': round(float(col('cast%').mean()), 2), 'max': round(float(col('cast%').max()), 2)},
            'haze%': {'mean': round(float(col('haze%').mean()), 2), 'max': round(float(col('haze%').max()), 2)},
            'bone%': {'mean': round(float(col('bone%').mean()), 2), 'min': round(float(col('bone%').min()), 2), 'max': round(float(col('bone%').max()), 2)},
            'APL': {'mean': round(float(col('APL').mean()), 4), 'min': round(float(col('APL').min()), 4), 'max': round(float(col('APL').max()), 4)},
            'gates': {g: sum(g in r['fails'] for r in rows) for g in ('hot', 'cast', 'pink', 'pale', 'haze', 'bone', 'p2', 'p99', 'murk')},
        }
        hook = [r for r in rows if r.get('hook')]
        if hook:
            summary['bone%_while_hook'] = {'frames': len(hook), 'min': round(min(r['bone%'] for r in hook), 2)}
        print(f"\nsummary: {len(rows)} frames, {bad} failing  |  magenta hot {summary['hot%']['mean']}% mean / {summary['hot%']['max']}% max"
              f"  cast {summary['cast%']['max']}% max  |  haze {summary['haze%']['max']}% max  |  bone {summary['bone%']['mean']}% mean"
              f"  |  APL {summary['APL']['mean']} mean ({summary['APL']['min']}–{summary['APL']['max']})"
              f"  |  gates: {', '.join(f'{k} {v}' for k, v in summary['gates'].items() if v) or 'all pass'}")
        bad += display_targets(rows, man, summary)
    if out:
        json.dump({'summary': summary, 'rows': rows}, open(out, 'w'), indent=1)
    sys.exit(1 if bad else 0)


if __name__ == '__main__':
    main()
