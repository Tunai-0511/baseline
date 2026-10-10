"""pYIN F0 of the long notes (TREATMENT §7.3, Appendix B.1) -> app/public/data/pitch/<key>.json + index.json.

Words: every sung GUARANTEED, BASELINE, LONG, GONE, DEADLINE, FRIEND (the §7.3 list, all occurrences, long or not),
"one more time" (L69), and any other word held >= 1.5 s. key = L<line>_w<word> (lyricreg.pitchKey).

Source: librosa.pyin run per word on the Demucs vocal stem (22.05 kHz, 120-900 Hz, 93 ms frames, exactly 10 ms
hop, low switch probability — the song-wide cache in analysis/work/vocal_feats.npz flags most of the doubled,
reverberant sustained notes as unvoiced, so it is only used for the loudness envelope). Per word:
  - frames inside [word.start, word.end] on a 10 ms grid; pyin's voiced flag decides voiced/unvoiced (0 Hz);
  - octave errors folded toward the word's median (a frame > 7 semitones away is moved by +-12 if that lands
    within 3 semitones of the median, else unvoiced); 30 ms median smoothing; gaps <= 40 ms bridged;
  - env: loudness 0..1 (RMS amplitude / the word's peak), same grid.
File = PitchTrack { key, line, word, text, t0, hop, f0[], env[], median, semis:[min,max] }.

    analysis/.venv/bin/python tools/data/export_pitch.py [--plots]   # plots -> out/wip/p0/pre1-assets/pitch/
"""
import json, re, sys, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'analysis'))
import common  # noqa: E402
import numpy as np  # noqa: E402

OUT = ROOT / 'app' / 'public' / 'data' / 'pitch'
PLOTS = ROOT / 'out' / 'wip' / 'p0' / 'pre1-assets' / 'pitch'
LONG = {'guaranteed', 'baseline', 'long', 'gone', 'deadline', 'friend'}
HOP = 0.01


def key(li, wi):
    return f'L{li:02d}_w{wi:02d}'


def norm(w):
    return re.sub(r'[^a-z]', '', w.lower())


SR = 22050


def pyin_seg(y, ws, we):
    """pyin on [ws - 0.1, we + 0.1] with frame centres on the 10 ms grid ws + k * HOP."""
    import librosa
    pad = 0.1
    a = int(round((ws - pad) * SR))
    seg = y[max(0, a):int(round((we + pad) * SR))]
    f0, vf, vp = librosa.pyin(seg, fmin=120, fmax=900, sr=SR, frame_length=2048, hop_length=int(HOP * SR),
                              center=True, max_transition_rate=24, switch_prob=0.005, no_trough_prob=0.02)
    off = int(round(pad / HOP))
    n = max(1, int(round((we - ws) / HOP)))
    f0 = np.nan_to_num(f0, nan=0.0)[off:off + n]
    vf = vf[off:off + n]
    return np.where(vf, f0, 0.0)


def track(feats, y, ws, we):
    h = float(feats['hop_s'])
    n = max(1, int(round((we - ws) / HOP)))
    F = np.zeros(n)
    f = pyin_seg(y, ws, we)
    F[:len(f)] = f
    amp = 10 ** (feats['rms_db'] / 20)
    A = np.zeros(n)
    for k in range(n):
        a, b = int((ws + k * HOP) / h), int((ws + (k + 1) * HOP) / h) + 1
        A[k] = amp[a:b].mean()
    voiced = F > 0
    if voiced.sum() >= 3:
        med = np.median(F[voiced])
        s = 12 * np.log2(np.where(voiced, F, med) / med)
        for k in np.where(voiced & (np.abs(s) > 7))[0]:
            for sh in (-12, 12):
                if abs(s[k] + sh) < 3:
                    F[k] *= 2 ** (sh / 12); break
            else:
                F[k] = 0.0
        # 30 ms median on voiced runs
        G = F.copy()
        for k in range(n):
            w = F[max(0, k - 1):k + 2]; w = w[w > 0]
            if F[k] > 0 and len(w):
                G[k] = np.median(w)
        F = G
        # bridge gaps <= 40 ms
        v = np.where(F > 0)[0]
        for i0, i1 in zip(v[:-1], v[1:]):
            if 1 < i1 - i0 <= 5:
                F[i0 + 1:i1] = np.interp(np.arange(i0 + 1, i1), [i0, i1], [F[i0], F[i1]])
    env = A / max(A.max(), 1e-9)
    return F, env


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--plots', action='store_true'); a = ap.parse_args()
    p = common.WORK / 'vocal_feats.npz'
    if not p.exists():
        import vocal_feats; vocal_feats.compute()
    feats = dict(np.load(p))
    y, _ = common.load_stem('vocals', sr=SR)
    lyr = json.loads((ROOT / 'data' / 'lyrics.json').read_text())
    sel = []
    for li, line in enumerate(lyr['lines']):
        for wi, w in enumerate(line['words']):
            if norm(w['w']) in LONG or li == 69 or (w['end'] - w['start']) >= 1.5:
                sel.append((li, wi, w))
    OUT.mkdir(parents=True, exist_ok=True)
    keys, rows = [], []
    for li, wi, w in sel:
        F, env = track(feats, y, float(w['start']), float(w['end']))
        v = F[F > 0]
        med = float(np.median(v)) if len(v) else 0.0
        semis = [round(float(12 * np.log2(v.min() / med)), 2), round(float(12 * np.log2(v.max() / med)), 2)] if len(v) else [0, 0]
        k = key(li, wi)
        doc = dict(key=k, line=li, word=wi, text=w['w'], t0=round(float(w['start']), 4), hop=HOP,
                   f0=[round(float(x), 1) for x in F], env=[round(float(x), 3) for x in env],
                   median=round(med, 1), semis=semis, voiced=round(float((F > 0).mean()), 3))
        (OUT / f'{k}.json').write_text(json.dumps(doc, separators=(',', ':')))
        keys.append(k); rows.append(doc)
        print(f"{k} {w['w']:>14s} {w['end'] - w['start']:5.2f}s  median {med:6.1f} Hz  semis {semis}  voiced {doc['voiced']:.2f}")
    (OUT / 'index.json').write_text(json.dumps(dict(source='tools/data/export_pitch.py (pYIN, Demucs vocal stem, 10 ms)', words=keys), indent=1))
    print('wrote', len(keys), 'tracks to', OUT)
    if a.plots:
        import matplotlib; matplotlib.use('Agg')
        import matplotlib.pyplot as plt
        PLOTS.mkdir(parents=True, exist_ok=True)
        fig, axs = plt.subplots((len(rows) + 2) // 3, 3, figsize=(15, 1.6 * ((len(rows) + 2) // 3)))
        for ax, d in zip(axs.flat, rows):
            t = d['t0'] + np.arange(len(d['f0'])) * HOP
            f = np.array(d['f0']); f[f == 0] = np.nan
            ax.plot(t, f, 'k', lw=1); ax2 = ax.twinx(); ax2.fill_between(t, 0, d['env'], color='tab:blue', alpha=0.15)
            ax.set_title(f"{d['key']} {d['text']} ({d['median']} Hz)", fontsize=7); ax.tick_params(labelsize=6); ax2.set_yticks([])
        fig.tight_layout(); fig.savefig(PLOTS / 'pitch_tracks.png', dpi=100)
        print('plot', PLOTS / 'pitch_tracks.png')


if __name__ == '__main__':
    main()
