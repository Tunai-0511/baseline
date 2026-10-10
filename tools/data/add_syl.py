"""Syllable timings of the sung words (TREATMENT §7.3, Appendix B.1) -> app/public/data/syl.json.

Every multi-syllable word of the song (dictionary below; acronyms and numbers are split into the units that are
actually sung, e.g. XOR = X|O|R sung "ex-oh-are", 32 = 3|2 sung "thirty-two") plus the single-syllable words the
bible asks for (STATE). One entry per sung occurrence:

    { "line": 9, "word": 2, "text": "guaranteed", "parts": ["guar", "an", "teed"], "syl": [[t0, t1], ...] }

`parts` concatenate to the word's letters (punctuation dropped) and map 1:1 onto `syl`, so a laser/cursor can
reach letter k at the time of the syllable that contains it (B5 schedule). syl[0][0] = word.start and
syl[-1][1] = word.end (data/lyrics.json is the authority for word edges); the inner boundaries come from

  1. a local CTC forced alignment of the word's pronunciation letters against the vocal stem (the fused
     MMS_FA + wav2vec2-LV60K emissions the lyric aligner already cached in analysis/work, 20 ms frames): the
     boundary is the first frame of the first letter of the next syllable;
  2. a refinement on the 5 ms vocal features (analysis/work/vocal_feats.npz): within +-40 ms the boundary snaps
     to the strongest spectral-flux onset or the deepest loudness dip (consonant), if one is clearly there;
  3. clamps: monotone, every syllable >= 40 ms.

Run with the analysis venv (numba, torchaudio labels, librosa features):
    analysis/.venv/bin/python tools/data/add_syl.py [--plots]     # plots -> out/wip/p0/pre1-assets/syl/
"""
import json, re, sys, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'analysis'))
import common  # noqa: E402  (sets the analysis caches)
import numpy as np  # noqa: E402

OUT = ROOT / 'app' / 'public' / 'data' / 'syl.json'
PLOTS = ROOT / 'out' / 'wip' / 'p0' / 'pre1-assets' / 'syl'

# display parts (| between syllables); an optional ":pron" gives the sung spelling of a part (CTC target letters)
SYL = """
Perceptron=Per|cep|tron  XOR=X:ex|O:oh|R:are  unresolved=un|re|solved  another=an|oth|er  hidden=hid|den
layer=lay|er  problem's=prob|lem's  Sigmoid=Sig|moid  signal=sig|nal  gradients=gra|di|ents  fading=fa|ding
zero=ze|ro  ReLU=Re:ray|LU:loo  negatives=neg|a|tives  hero=he|ro  Hand-tuned=Hand|tuned  every=ev|ery
feature=fea|ture  convolution=con|vo|lu|tion  filters=fil|ters  nobody=no|bo|dy  SVM=S:ess|V:vee|M:em
widest=wid|est  margin=mar|gin  kernel=ker|nel  Kernel=Ker|nel  benchmarks=bench|marks  margins=mar|gins  abstract=ab|stract
guaranteed=guar|an|teed  baseline=base|line  leaderboard=lead|er|board  until=un|til  deadline=dead|line
hand-made=hand|made  features=fea|tures  frozen=fro|zen  network=net|work  itself=it|self  N-gram=N:en|gram
counting=count|ing  window=win|dow  tokens=to|kens  RNN=R:are|N:en|N:en  carried=car|ried  inside=in|side
Backprop=Back|prop  vanish=van|ish  explode=ex|plode  LSTM=L:el|S:ess|T:tee|M:em  along=a|long
Seq2seq=Seq:seek|2:to|seq:seek  sentence=sen|tence  bottleneck=bot|tle|neck  attention=at|ten|tion
decoder=de|co|der  double-check=dou|ble|check  Recurrence=Re|cur|rence  recurrence=re|cur|rence  order=or|der
transformers=trans|form|ers  parallel=par|al|lel  behind=be|hind  Memory's=Mem|o|ry's  memory=mem|o|ry
two-player=two|play|er  collapsed=col|lapsed  diffusion=dif|fu|sion  denoise=de|noise  thousand=thou|sand
tiny=ti|ny  Sinusoids=Si|nu|soids  rotation=ro|ta|tion  LayerNorm=Lay|er|Norm  RMS=R:are|M:em|S:ess
SwiGLU=Swi:swee|GLU:glue  activation=ac|ti|va|tion  became=be|came  mixture=mix|ture  only=on|ly
experts=ex|perts  awake=a|wake  32=3:thirty|2:two  throughput's=through|put's  fine-tune=fine|tune
LoRA=Lo|RA:ra  low-rank=low|rank  little=lit|tle  context=con|text  Context=Con|text  gradient=gra|di|ent
Attention's=At|ten|tion's  bidirectional=bi|di|rec|tion|al  decoder-only=de|co|der|on|ly  optional=op|tion|al
RLHF=R:are|L:el|H:aitch|F:eff  reward=re|ward  model=mod|el  DPO=D:dee|P:pee|O:oh  middleman=mid|dle|man
FlashAttention=Flash|At|ten|tion  SRAM=S:ess|RAM:ram  HBM=H:aitch|B:bee|M:em  traffic=traf|fic  2K=2:two|K:kay
million=mil|lion  needle=nee|dle  haystack=hay|stack  remembers=re|mem|bers  Every=Ev|ery  paper=pa|per
breakthrough's=break|through's  running=run|ning  quadratic=quad|rat|ic  linear-time=lin|e|ar|time
successor's=suc|ces|sor's  training=train|ing  becomes=be|comes  footnote=foot|note  related=re|lat|ed
remember=re|mem|ber  state=state
"""


def parse_dict():
    d = {}
    for tok in SYL.split():
        key, val = tok.split('=')
        parts = []
        for p in val.split('|'):
            disp, _, pr = p.partition(':')
            parts.append((disp, pr or re.sub(r"[^a-z']", '', disp.lower().replace('’', "'")).strip("'")))
        d[key] = parts
    return d


def clean(w):
    """display token -> dictionary key (drop trailing punctuation, straight apostrophes)."""
    return re.sub(r"[,.;:!?\"“”]+$", '', w.replace('’', "'"))


def ctc_starts(E, parts, t0, t1):
    """Local CTC Viterbi of the pronunciation letters inside [t0, t1] -> start time of each part."""
    from ctcalign import _viterbi, AIDX, FRAME
    a, b = max(0, int(t0 / FRAME)), min(len(E), int(np.ceil(t1 / FRAME)))
    sub = E[a:b]
    tgt, first = [], []
    for _, pr in parts:
        letters = [c for c in pr if c in AIDX and c != '-']
        first.append(len(tgt))
        tgt.extend(AIDX[c] for c in letters)
    tgt = np.array(tgt, np.int64)
    lo = np.zeros(len(tgt), np.int64); hi = np.full(len(tgt), len(sub) - 1, np.int64)
    path, _ = _viterbi(sub, tgt, lo, hi)
    tokpos = np.where(path % 2 == 1, (path - 1) // 2, -1)
    starts = []
    for f in first:
        fr = np.where(tokpos == f)[0]
        starts.append((a + fr.min()) * FRAME if len(fr) else None)
    return starts


def refine(tb, feats, lo, hi):
    """Snap a boundary to a clear onset peak or loudness dip within +-40 ms (else keep it)."""
    hop = float(feats['hop_s'])
    i0, i1 = int((tb - 0.04) / hop), int((tb + 0.04) / hop) + 1
    i0, i1 = max(i0, int(lo / hop) + 1), min(i1, int(hi / hop) - 1)
    if i1 - i0 < 3:
        return tb
    on = feats['onset'][i0:i1]
    rms = feats['rms_db'][i0:i1]
    ctx_on = feats['onset'][max(0, i0 - 40):i1 + 40]
    w = np.exp(-0.5 * ((np.arange(i0, i1) * hop - tb) / 0.02) ** 2)
    k = int(np.argmax(on * w))
    if on[k] > np.median(ctx_on) * 2.0 and on[k] > np.percentile(ctx_on, 75):
        return (i0 + k) * hop
    dip = rms.min()
    if rms.max() - dip > 6.0:      # a consonant gap of >= 6 dB
        return (i0 + int(np.argmin(rms + 0.0 * w))) * hop
    return tb


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--plots', action='store_true')
    a = ap.parse_args()
    from ctcalign import emissions
    lyr = json.loads((ROOT / 'data' / 'lyrics.json').read_text())
    D = parse_dict()
    E = emissions('fused6')
    feats = dict(np.load(common.WORK / 'vocal_feats.npz'))
    out, missing = [], set()
    for li, line in enumerate(lyr['lines']):
        for wi, w in enumerate(line['words']):
            key = clean(w['w'])
            parts = D.get(key)
            if parts is None:
                if len(re.sub(r"[^a-zA-Z0-9]", '', key)) > 5:
                    missing.add(key)
                continue
            ws, we = float(w['start']), float(w['end'])
            n = len(parts)
            if n == 1:
                spans = [[ws, we]]
            else:
                st = ctc_starts(E, parts, ws - 0.05, we + 0.05)
                b = [ws]
                for i in range(1, n):
                    t = st[i] if st[i] is not None else ws + (we - ws) * i / n
                    t = refine(t, feats, b[-1] + 0.04, we - 0.04 * (n - i))
                    t = min(max(t, b[-1] + 0.04), we - 0.04 * (n - i))
                    b.append(t)
                b.append(we)
                spans = [[round(b[i], 3), round(b[i + 1], 3)] for i in range(n)]
            disp = ''.join(p for p, _ in parts)
            letters = re.sub(r"[^A-Za-z0-9']", '', key.replace('’', "'"))
            assert disp.replace("'", '') == letters.replace("'", ''), (key, disp, letters)
            out.append(dict(line=li, word=wi, text=w['w'], parts=[p for p, _ in parts], syl=spans))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(dict(
        source='tools/data/add_syl.py: local CTC (fused MMS_FA + wav2vec2-LV60K) + 5 ms onset/dip refinement; edges = data/lyrics.json',
        words=out), indent=None, separators=(',', ':')).replace('},{', '},\n{'))
    print('wrote', OUT, len(out), 'entries; words without a dictionary entry:', sorted(missing))
    req = ['Perceptron', 'state', 'leaderboard', 'deadline', 'guaranteed', 'baseline', 'bidirectional', 'decoder']
    for e in out:
        if clean(e['text']).lower().split('-')[0] in [r.lower() for r in req]:
            print(f"L{e['line']:02d}_w{e['word']:02d} {e['text']:>16s} " + ' '.join(f"{p}[{s[0]:.2f}-{s[1]:.2f}]" for p, s in zip(e['parts'], e['syl'])))
    if a.plots:
        plot(out, feats, req)


def plot(out, feats, req):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    PLOTS.mkdir(parents=True, exist_ok=True)
    hop = float(feats['hop_s'])
    sel = [e for e in out if clean(e['text']).lower().split('-')[0] in [r.lower() for r in req] and len(e['parts']) > 1]
    fig, axs = plt.subplots(len(sel), 1, figsize=(12, 1.5 * len(sel)))
    for ax, e in zip(axs, sel):
        t0, t1 = e['syl'][0][0] - 0.15, e['syl'][-1][1] + 0.15
        i0, i1 = int(t0 / hop), int(t1 / hop)
        tt = np.arange(i0, i1) * hop
        ax.plot(tt, feats['rms_db'][i0:i1], 'k', lw=0.8)
        ax2 = ax.twinx(); ax2.plot(tt, feats['onset'][i0:i1], color='tab:blue', lw=0.6, alpha=0.7)
        for p, s in zip(e['parts'], e['syl']):
            ax.axvline(s[0], color='tab:red', lw=1)
            ax.text((s[0] + s[1]) / 2, ax.get_ylim()[1] - 3, p, ha='center', va='top', fontsize=8)
        ax.axvline(e['syl'][-1][1], color='tab:red', lw=1, ls='--')
        ax.set_ylabel(f"L{e['line']:02d}w{e['word']}", fontsize=7); ax.tick_params(labelsize=6); ax2.tick_params(labelsize=6)
    fig.tight_layout(); fig.savefig(PLOTS / 'syl_required.png', dpi=110)
    print('plot', PLOTS / 'syl_required.png')


if __name__ == '__main__':
    main()
