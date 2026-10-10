"""Music analysis -> data/audio.json

  * constant-tempo beat grid (tempo + phase fitted to drum / mix onsets, phase
    refined on kick attacks), downbeats (bar phase from snare-on-2&4 and the
    2-bar chord changes), sections on downbeats,
  * 100 fps normalized envelopes (mix rms / low / mid / high, stem rms),
  * kick / snare / hat onsets from the drums stem, vocal note onsets.

All times are in the gapless-mp3 timeline (Demucs stems are shifted by
common.STEM_OFFSET_SEC, see common.py).

Run:  uv run python analyze.py [--plots]
"""
import common
import json
import math
import sys

import numpy as np
import librosa
from scipy.ndimage import maximum_filter1d, median_filter, uniform_filter1d
from scipy.signal import butter, find_peaks, sosfiltfilt

SR = 44100
FPS = 100

# Section map in bars (bar k starts at downbeat k = beat 4k; bar 0 = first beat).
# Rule (as in pdoom-video): a section starts on the downbeat of the bar in which its
# first lyric line starts; a pickup shorter than 2 beats stays in the previous section.
# Read off the per-bar stem energies (drums / bass / vocals) and the aligned lyrics.
SECTION_BARS = [
    ("intro", None, 5),      # light drums, no bass; pickup "Perceptron" in bar 4
    ("verse1", 5, 21),       # no bass until bar 13
    ("pre1", 21, 25),        # breakdown: no drums, bass fades ("Depth is all you need")
    ("chorus1", 25, 33),     # pickup "You were" in bar 24
    ("verse2", 33, 49),      # lighter bass until bar 41
    ("pre2", 49, 53),        # bass drops out
    ("chorus2", 53, 61),
    ("drop1", 61, 65),       # EDM drop: loudest drums / bass so far, no lyrics
    ("verse3", 65, 81),      # half-time feel (bass every other bar) until bar 73
    ("pre3", 81, 85),        # breakdown: bass out ("Attention's all you need")
    ("chorus3", 85, 93),     # soft / stripped back until bar 89
    ("bridge", 93, 109),     # full band, 16 bars (RLHF -> "baseline running late")
    ("pre4", 109, 113),      # breakdown: no drums, no bass ("Scale is all you need")
    ("chorus4", 113, 121),
    ("stop", 121, 125),      # drums + bass out: "Every 'all you need' becomes a footnote... remember me, my friend"
    ("drop2", 125, 133),     # final drop; outro vocals ("I was state of the art...") from bar 128
    ("tail", 133, None),     # fade / "one more time" at 245.3
]


# ---------------------------------------------------------------------------
def band_sos(lo, hi, sr):
    if lo and hi:
        return butter(4, [lo, hi], btype="band", fs=sr, output="sos")
    if hi:
        return butter(4, hi, btype="low", fs=sr, output="sos")
    return butter(4, lo, btype="high", fs=sr, output="sos")


def frame_rms(x, sr, fps=FPS, win=2048):
    hop = sr / fps
    n = int(math.ceil(len(x) / sr * fps))
    pad = np.pad(x, (win // 2, win // 2 + int(hop) + 2))
    idx = (np.arange(n) * hop).astype(int)
    c = np.concatenate([[0.0], np.cumsum(pad.astype(np.float64) ** 2)])
    e = (c[idx + win] - c[idx]) / win
    return np.sqrt(np.maximum(e, 0))


def smooth_env(x, fps=FPS, attack=0.010, release=0.090):
    """One-pole follower: fast attack, slower release (visual friendly)."""
    aa = math.exp(-1 / (attack * fps))
    ar = math.exp(-1 / (release * fps))
    y = np.empty_like(x)
    s = 0.0
    for i, v in enumerate(x):
        a = aa if v > s else ar
        s = a * s + (1 - a) * v
        y[i] = s
    return y


def norm01(x, pct=99.0):
    ref = np.percentile(x, pct)
    return np.clip(x / (ref + 1e-12), 0, 1)


# ---------------------------------------------------------------------------
def track_beats(drums, mix, sr):
    """Variable-tempo beat grid. Suno drifts the tempo (130.1 -> 133.8 BPM over the
    song), so a constant grid is off by up to 90 ms. librosa's DP beat tracker gives the
    beats; each beat is then re-fitted by a trimmed local linear fit (+-12 beats) of the
    kick + snare attacks on the half-beat grid (residual MAD ~2-4 ms)."""
    hop = 256
    y = librosa.resample(mix, orig_sr=sr, target_sr=22050)
    oe = librosa.onset.onset_strength(y=y, sr=22050, hop_length=hop)
    _, b = librosa.beat.beat_track(onset_envelope=oe, sr=22050, hop_length=hop,
                                   start_bpm=130, tightness=400, units="time")
    kt, _ = band_onsets(drums, sr, None, 120, win=0.012, min_gap=0.15, rel_db=12)
    (_, _), (st, _), _, _ = drum_onsets(drums, sr, None, None)
    ons = np.sort(np.concatenate([kt, st]))
    W = 12
    for _ in range(3):
        fi = np.interp(ons, b, np.arange(len(b)))
        half = np.round(fi * 2) / 2
        ok = np.abs(fi - half) < 0.18
        new = b.copy()
        for i in range(len(b)):
            m = ok & (np.abs(half - i) <= W)
            if m.sum() < 6:
                continue
            x, t = half[m], ons[m]
            for _r in range(3):
                X = np.vstack([np.ones_like(x), x]).T
                c, *_ = np.linalg.lstsq(X, t, rcond=None)
                r = t - X @ c
                keep = np.abs(r) < max(0.012, 2.5 * np.median(np.abs(r)))
                x, t = x[keep], t[keep]
                if len(x) < 6:
                    break
            new[i] = c[0] + c[1] * i
        b = new
    fi = np.interp(ons, b, np.arange(len(b)))
    res = (fi - np.round(fi * 2) / 2) * np.interp(ons, b[1:], np.diff(b))
    return b, res[np.abs(res) < 0.08]


# ---------------------------------------------------------------------------
def fit_grid(drums, mix, sr, duration):
    """Constant-tempo grid: coarse tempo/phase search on spectral-flux onset
    envelopes, then phase refinement on kick attack times."""
    hop = 64
    fps = sr / hop
    od = librosa.onset.onset_strength(y=librosa.resample(drums, orig_sr=sr, target_sr=22050),
                                      sr=22050, hop_length=hop // 2, lag=1, max_size=1)
    om = librosa.onset.onset_strength(y=librosa.resample(mix, orig_sr=sr, target_sr=22050),
                                      sr=22050, hop_length=hop // 2, lag=1, max_size=1)
    o = od / (np.percentile(od, 99) + 1e-9) + om / (np.percentile(om, 99) + 1e-9)
    ofps = 22050 / (hop // 2)

    def score(P, off):
        ts = off + P * np.arange(int(duration / P) + 1)
        idx = np.round(ts * ofps).astype(int)
        idx = idx[(idx > 2) & (idx < len(o) - 2)]
        return np.maximum.reduce([o[idx - 1], o[idx], o[idx + 1]]).mean()

    best = (0, None, None)
    for bpm in np.arange(125.0, 138.0, 0.02):
        P = 60 / bpm
        for off in np.arange(0, P, 0.004):
            s = score(P, off)
            if s > best[0]:
                best = (s, bpm, off)
    _, bpm, off = best
    for b2 in np.arange(bpm - 0.02, bpm + 0.02, 0.001):  # fine
        P = 60 / b2
        for o2 in np.arange(off - 0.01, off + 0.01, 0.001):
            s = score(P, o2)
            if s > best[0]:
                best = (s, b2, o2)
    _, bpm, off = best
    P = 60 / bpm
    # refine phase on kick attacks (steepest rise of low-band log energy)
    kick_t, _ = band_onsets(drums, sr, None, 120, win=0.012, min_gap=0.2, rel_db=12)
    n = np.round((kick_t - off) / P)
    res = kick_t - (off + n * P)
    res = res[np.abs(res) < 0.06]
    off = off + float(np.median(res))
    # first beat >= 0
    off = off - P * math.floor(off / P)
    return bpm, P, off, res


def band_onsets(x, sr, lo, hi, win=0.010, hop_s=0.002, min_gap=0.08, rel_db=10.0,
                decay_win=None):
    """Onsets in a frequency band: steepest rise of the band's log-energy
    envelope; strength = peak dB rise.  Returns (times, rise_db[, decay_db])."""
    xb = sosfiltfilt(band_sos(lo, hi, sr), x)
    h = int(hop_s * sr)
    w = int(win * sr)
    e = np.convolve(xb.astype(np.float64) ** 2, np.ones(w) / w, mode="same")[::h]
    db = 10 * np.log10(e + 1e-10)
    fps = sr / h  # exact frame rate (h is an integer number of samples)
    d = np.diff(db, prepend=db[0])
    d = uniform_filter1d(d, 3)
    # rise over ~20 ms
    lag = int(0.02 * fps)
    rise = db - np.concatenate([np.full(lag, db[0]), db[:-lag]])
    floor = median_filter(db, int(1.0 * fps) | 1)
    pk, _ = find_peaks(rise, height=rel_db, distance=int(min_gap * fps))
    times, strength = [], []
    for p in pk:
        a = max(0, p - lag)
        # attack time: steepest slope within the rise window
        q = a + int(np.argmax(d[a:p + 1]))
        peak_db = db[p:p + int(0.03 * fps)].max()
        if peak_db < floor[p] + 3:
            continue
        times.append(q / fps)
        strength.append(peak_db)
    return np.array(times), np.array(strength)


def drum_onsets(d, sr, grid_P, grid_off):
    """Kick / snare / hat onsets from the drums stem."""
    # KICK: <120 Hz
    kt, kdb = band_onsets(d, sr, None, 120, win=0.012, min_gap=0.15, rel_db=12)
    # SNARE (and the clap-like snare of the quiet chorus): candidates are
    # 1.5-5 kHz attacks; a snare has a long noisy 0.5-5 kHz tail 40-120 ms after
    # the attack.  Keep candidates whose tail is within 8 dB of the loudest tail
    # in +-2.5 s and within 25 dB of the song-wide level (rejects stem bleed).
    # Kick-only beats / hats have tails 12-30 dB lower.
    st, sdb = band_onsets(d, sr, 1500, 5000, win=0.010, min_gap=0.15, rel_db=10)
    xb = sosfiltfilt(band_sos(500, 5000, sr), d)
    e = np.sqrt(np.convolve(xb.astype(np.float64) ** 2, np.ones(441) / 441, mode="same"))
    tail = np.array([20 * np.log10(e[int((t + 0.04) * sr):int((t + 0.12) * sr)].mean() + 1e-9) for t in st])
    rel = np.array([tail[i] - tail[np.abs(st - st[i]) < 2.5].max() for i in range(len(st))])
    thr = np.percentile(tail, 95) - 25
    keep = (rel > -8) & (tail > thr)
    st, sdb, stail = st[keep], sdb[keep], tail[keep]
    # HAT: >7 kHz, short; drop those coinciding with snares (snare noise also
    # reaches 7k+)
    ht, hdb = band_onsets(d, sr, 7000, None, win=0.006, min_gap=0.06, rel_db=9)
    # (and those within 30 ms of a kick: the kick's beater click reaches 10 kHz)
    for other, gap in ((st, 0.04), (kt, 0.03)):
        if len(other) and len(ht):
            dist = np.min(np.abs(ht[:, None] - other[None, :]), axis=1)
            keep = dist > gap
            ht, hdb = ht[keep], hdb[keep]
    return (kt, kdb), (st, stail), (ht, hdb), thr


def strength01(db_vals, lo_pct=5, hi_pct=95):
    if len(db_vals) == 0:
        return db_vals
    lo, hi = np.percentile(db_vals, lo_pct), np.percentile(db_vals, hi_pct)
    return np.clip((db_vals - lo) / (hi - lo + 1e-9) * 0.8 + 0.2, 0, 1)


def vocal_onsets(v, sr):
    """Vocal note onsets: log-mel spectral flux peaks (5 ms hop) plus pitch
    jumps > 0.8 semitone while voiced, restricted to active vocal frames."""
    f = dict(np.load(common.WORK / "vocal_feats.npz"))
    hop = float(f["hop_s"])
    on = f["onset"]
    rms = f["rms_db"]
    loc = maximum_filter1d(rms, int(2.0 / hop))
    active = (rms > -45) & (rms > loc - 25)
    thr = uniform_filter1d(on, int(0.4 / hop)) * 1.5 + 0.15 * np.percentile(on, 99)
    pk, _ = find_peaks(on, height=0, distance=int(0.09 / hop))
    pk = [p for p in pk if on[p] > thr[p] and active[min(len(active) - 1, p + int(0.03 / hop))]]
    t_flux = np.array(pk) * hop
    s_flux = np.array([on[p] for p in pk])
    # pitch jumps (legato note changes that have little spectral flux)
    f0 = f["f0"]
    midi = librosa.hz_to_midi(np.where(f["voiced"] > 0, f0, np.nan))
    med = median_filter(np.nan_to_num(midi, nan=0), 9)
    jumps = []
    w = int(0.04 / hop)
    for i in range(w, len(med) - w):
        a, b = med[i - w], med[i + w]
        if a > 0 and b > 0 and abs(b - a) > 0.8 and active[i]:
            jumps.append(i)
    # collapse runs
    t_pitch, last = [], -1e9
    for i in jumps:
        if i - last > int(0.1 / hop):
            t_pitch.append(i * hop)
        last = i
    t_pitch = np.array(t_pitch)
    ts = list(zip(t_flux, s_flux / (np.percentile(s_flux, 95) + 1e-9)))
    for t in t_pitch:
        if len(t_flux) == 0 or np.min(np.abs(t_flux - t)) > 0.08:
            ts.append((t, 0.35))
    ts.sort()
    return [(float(t), float(min(1.0, max(0.1, s)))) for t, s in ts]


# ---------------------------------------------------------------------------
def main(plots=False):
    mix, _ = common.load_mix(SR)
    duration = len(mix) / SR
    stems = {n: common.load_stem(n, sr=SR)[0][: len(mix)] for n in ("vocals", "drums", "bass", "other")}
    for n in stems:
        if len(stems[n]) < len(mix):
            stems[n] = np.pad(stems[n], (0, len(mix) - len(stems[n])))

    beats, res = track_beats(stems["drums"], mix, SR)
    P = float(np.median(np.diff(beats)))
    off = float(beats[0])
    bpm = 60 * (len(beats) - 1) / (beats[-1] - beats[0])
    print(f"mean tempo {bpm:.3f} BPM ({60/np.diff(beats)[:40].mean():.2f} -> {60/np.diff(beats)[-40:].mean():.2f})"
          f"  first beat {off:.4f}s  drum residual MAD {np.median(np.abs(res))*1000:.1f} ms")
    # bar phase: beat index 0 is a downbeat (snares on beat indices 1 and 3 mod 4; every
    # section's first stressed word lands on beat 0 mod 4)
    downbeats = beats[0::4]
    def bar_t(k):
        if k < len(downbeats):
            return float(downbeats[k])
        return float(downbeats[-1] + (k - len(downbeats) + 1) * 4 * P)

    # envelopes -------------------------------------------------------------
    n = int(math.ceil(duration * FPS))
    env = {}
    env["rms"] = frame_rms(mix, SR)[:n]
    for name, (lo, hi) in {"low": (None, 150), "mid": (150, 2000), "high": (4000, None)}.items():
        env[name] = frame_rms(sosfiltfilt(band_sos(lo, hi, SR), mix), SR)[:n]
    for s in ("vocal", "drums", "bass", "other"):
        env[s] = frame_rms(stems["vocals" if s == "vocal" else s], SR)[:n]
    for k in env:
        e = smooth_env(env[k])
        env[k] = [round(float(x), 3) for x in norm01(e)]
        assert len(env[k]) == n

    # onsets -------------------------------------------------------------------
    (kt, kdb), (st, sdb), (ht, hdb), sn_thr = drum_onsets(stems["drums"], SR, P, off)
    onsets = {
        "kick": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(kt, strength01(kdb))],
        "snare": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(st, strength01(sdb))],
        "hat": [[round(float(t), 3), round(float(s), 3)] for t, s in zip(ht, strength01(hdb))],
        "vocal": [[round(t, 3), round(s, 3)] for t, s in vocal_onsets(stems["vocals"], SR)],
    }
    # snare / kick position statistics -> bar phase evidence
    def pos_hist(ts):
        ph = np.round((np.asarray(ts) - off) / (P / 2)).astype(int) % 8
        return np.bincount(ph, minlength=8).tolist()
    print("kick   8th-positions in bar:", pos_hist(kt))
    print("snare  8th-positions in bar:", pos_hist(st))
    print("hat    8th-positions in bar:", pos_hist(ht))

    # sections -------------------------------------------------------------------
    sections = []
    for name, a, b in SECTION_BARS:
        s = 0.0 if a is None else bar_t(a)
        e = duration if b is None else bar_t(b)
        sections.append(dict(name=name, start=round(s, 3), end=round(e, 3), bars=[a if a is not None else -1, b]))
    for s in sections:
        s.pop("bars")

    doc = dict(
        duration=round(duration, 3),
        bpm=round(bpm, 3),
        beat_period=round(P, 5),
        time_signature=4,
        beats=[round(float(t), 3) for t in beats],
        downbeats=[round(float(t), 3) for t in downbeats],
        sections=sections,
        fps=FPS,
        **env,
        onsets=onsets,
        notes=NOTES.format(bpm=bpm, sn=len(st), kk=len(kt), hh=len(ht)),
    )
    (common.DATA / "audio.json").write_text(json.dumps(doc, separators=(",", ":")))
    print("wrote", common.DATA / "audio.json", f"{len(beats)} beats, {len(downbeats)} downbeats, "
          f"{len(kt)} kicks, {len(st)} snares, {len(ht)} hats, {len(onsets['vocal'])} vocal onsets")
    if plots:
        make_plots(doc, stems)
    return doc


NOTES = (
    "Timeline = audio/baseline.wav (Suno WAV, 48 kHz). Tempo is NOT constant: it drifts from "
    "~130.1 to ~133.8 BPM (mean {bpm:.2f}); beats[] is a per-beat grid (librosa DP tracker re-fitted "
    "to kick + snare attacks of the Demucs drum stem, residual MAD ~2-4 ms), so use beats[] / "
    "downbeats[] (the engine interpolates between them), not bpm. Bar phase: beat 0 is a downbeat; "
    "snares on beats 2 and 4. Sections start on downbeats (see SECTION_BARS in analysis/analyze.py). "
    "Envelopes: 100 fps, 46 ms RMS window, one-pole smoothing (10 ms attack / 90 ms release), each "
    "normalised to its 99th percentile, 0..1. low <150 Hz, mid 150-2000 Hz, high >4 kHz of the mix; "
    "vocal/drums/bass/other = Demucs stem RMS. Onsets [time, strength 0-1]: kick ({kk}), snare ({sn}), "
    "hat ({hh}) from the drum stem; vocal = note onsets of the vocal stem (incl. vocal chops)."
)


def make_plots(doc, stems):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    wins = [(0, 12), (36, 48), (110, 122), (146, 160), (196, 208), (218, 232), (238, 247.2)]
    t = np.arange(len(doc["rms"])) / FPS
    for (t0, t1) in wins:
        fig, ax = plt.subplots(3, 1, figsize=(22, 11), sharex=True,
                               gridspec_kw=dict(height_ratios=[2, 1.6, 1.4]))
        d = stems["drums"][int(t0 * SR):int(t1 * SR)]
        S = librosa.amplitude_to_db(np.abs(librosa.stft(d, n_fft=1024, hop_length=128)), ref=np.max)
        ax[0].imshow(S, origin="lower", aspect="auto", cmap="magma", vmin=-60, vmax=0,
                     extent=[t0, t0 + S.shape[1] * 128 / SR, 0, SR / 2])
        ax[0].set_ylim(0, 12000)
        ax[0].set_ylabel("drums stem")
        m = (t >= t0) & (t <= t1)
        for k, c in [("rms", "k"), ("low", "tab:red"), ("mid", "tab:green"), ("high", "tab:blue")]:
            ax[1].plot(t[m], np.array(doc[k])[m], color=c, lw=1, label=k)
        ax[1].legend(loc="upper left", fontsize=8)
        for k, c in [("vocal", "tab:purple"), ("drums", "tab:orange"), ("bass", "tab:brown"), ("other", "tab:olive")]:
            ax[2].plot(t[m], np.array(doc[k])[m], color=c, lw=1, label=k)
        ax[2].legend(loc="upper left", fontsize=8)
        for b in doc["beats"]:
            if t0 <= b <= t1:
                for a_ in ax:
                    a_.axvline(b, color="gray", lw=0.6, alpha=0.6)
        for b in doc["downbeats"]:
            if t0 <= b <= t1:
                for a_ in ax:
                    a_.axvline(b, color="c" if a_ is ax[0] else "k", lw=1.8)
        for name, y, c in [("kick", 1500, "tab:red"), ("snare", 5000, "w"), ("hat", 9500, "yellow")]:
            for (ot, s) in doc["onsets"][name]:
                if t0 <= ot <= t1:
                    ax[0].plot([ot], [y], marker="v", color=c, ms=4 + 8 * s)
        for (ot, s) in doc["onsets"]["vocal"]:
            if t0 <= ot <= t1:
                ax[2].plot([ot], [1.02], marker="v", color="tab:purple", ms=3 + 6 * s)
        for s in doc["sections"]:
            if t0 <= s["start"] <= t1:
                ax[1].text(s["start"], 1.02, s["name"], fontsize=14, color="tab:red")
                for a_ in ax:
                    a_.axvline(s["start"], color="tab:red", lw=2.5)
        ax[2].set_xlim(t0, t1)
        ax[2].set_xticks(np.arange(np.ceil(t0), t1, 0.5))
        fig.tight_layout()
        fig.savefig(common.QA / f"audio_{int(t0):03d}.png", dpi=65)
        plt.close(fig)
    # overview
    fig, ax = plt.subplots(2, 1, figsize=(24, 7), sharex=True)
    for k, c in [("rms", "k"), ("low", "tab:red"), ("high", "tab:blue")]:
        ax[0].plot(t, doc[k], color=c, lw=0.6, label=k)
    for k, c in [("vocal", "tab:purple"), ("drums", "tab:orange"), ("bass", "tab:brown"), ("other", "tab:olive")]:
        ax[1].plot(t, doc[k], color=c, lw=0.6, label=k)
    for s in doc["sections"]:
        for a_ in ax:
            a_.axvline(s["start"], color="tab:red", lw=1.5)
        ax[0].text(s["start"] + 0.2, 1.03, s["name"], fontsize=10, color="tab:red")
    for a_ in ax:
        a_.legend(loc="upper right", fontsize=8)
    ax[1].set_xticks(np.arange(0, 248, 5))
    fig.tight_layout()
    fig.savefig(common.QA / "audio_overview.png", dpi=65)
    plt.close(fig)


if __name__ == "__main__":
    main(plots="--plots" in sys.argv)
