"""QA contact sheets of every data file (PIL only): out/wip/p0/data/sheet_*.png. Not used by the film.

  tools/.venv/bin/python tools/data/preview.py [names...]
Each panel draws the exported JSON (not the script's internals), so the sheets show what a scene will actually load.
"""
import base64
import json
import math
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

from _common import PUB, ROOT, WIP

INK, INK2, BONE, ASH, GRAPH, DIM = (11, 10, 13), (20, 19, 24), (237, 234, 242), (150, 148, 158), (70, 68, 78), (40, 39, 46)
FONT = ImageFont.truetype(str(ROOT / 'app' / 'public' / 'fonts' / 'Archivo-w1000-500.ttf'), 18)
FONT_S = ImageFont.truetype(str(ROOT / 'app' / 'public' / 'fonts' / 'Archivo-w1000-500.ttf'), 13)
PW, PH = 560, 400


def J(name):
    return json.loads((PUB / name).read_text())


def u8(s, shape):
    return np.frombuffer(base64.b64decode(s), np.uint8).reshape(shape)


def f16(s, shape):
    return np.frombuffer(base64.b64decode(s), np.dtype('<f2')).astype(np.float32).reshape(shape)


GREEK = str.maketrans({'ρ': 'rho', 'α': 'alpha', 'η': 'eta', 'θ': 'th', 'μ': 'mu', 'σ': 'sd', 'ℓ': 'l', '‖': '|',
                       'ᵢ': 'i', '₀': '0', '−': '-', '²': '^2', 'φ': 'phi'})


class Panel:
    def __init__(self, title, sub=''):
        title, sub = title.translate(GREEK), sub.translate(GREEK)
        self.im = Image.new('RGB', (PW, PH), INK2)
        self.d = ImageDraw.Draw(self.im)
        self.d.text((14, 10), title, font=FONT, fill=BONE)
        if sub:
            self.d.text((14, 34), sub, font=FONT_S, fill=ASH)
        self.box = (20, 58, PW - 20, PH - 18)

    def map(self, x, y, xr, yr, box=None):
        x0, y0, x1, y1 = box or self.box
        return (x0 + (x - xr[0]) / (xr[1] - xr[0]) * (x1 - x0), y1 - (y - yr[0]) / (yr[1] - yr[0]) * (y1 - y0))

    def poly(self, xs, ys, xr, yr, fill=BONE, w=2, box=None):
        pts = [self.map(x, y, xr, yr, box) for x, y in zip(xs, ys)]
        self.d.line(pts, fill=fill, width=w)

    def text(self, xy, s, fill=ASH, small=True):
        self.d.text(xy, s.translate(GREEK), font=FONT_S if small else FONT, fill=fill)


def grid_img(p, A, box, gamma=1.0, vmin=None, vmax=None):
    A = np.asarray(A, float)
    lo = A.min() if vmin is None else vmin
    hi = A.max() if vmax is None else vmax
    v = np.clip((A - lo) / max(hi - lo, 1e-12), 0, 1) ** gamma
    img = (v[..., None] * (np.array(BONE) - np.array(INK)) + np.array(INK)).astype(np.uint8)
    x0, y0, x1, y1 = box
    p.im.paste(Image.fromarray(img).resize((x1 - x0, y1 - y0), Image.NEAREST), (x0, y0))


def sheet(panels, name, cols=3):
    rows = math.ceil(len(panels) / cols)
    S = Image.new('RGB', (cols * (PW + 10) + 10, rows * (PH + 10) + 10), INK)
    for k, p in enumerate(panels):
        r, c = divmod(k, cols)
        S.paste(p.im, (10 + c * (PW + 10), 10 + r * (PH + 10)))
    S.save(WIP / name)
    print('  wrote', (WIP / name).relative_to(ROOT))


def p_xor():
    j = J('xor_mlp.json')
    out = []
    p = Panel('xor_mlp · input space', f'seed 7 · best single line {j["linear"]["best_correct"]}/4 · solved @ epoch {j["train"]["solved_at_epoch"]}')
    xr = yr = (-0.5, 1.5)
    X = j['posts']['x']
    for ln in j['linear']['sheets']:
        (a, b) = ln['ends']
        p.d.line([p.map(*a, xr, yr), p.map(*b, xr, yr)], fill=GRAPH, width=1)
    for ln in j['hidden']['lines_input_space']:
        (a, b) = ln['ends']
        p.d.line([p.map(*a, xr, yr), p.map(*b, xr, yr)], fill=BONE, width=2)
    for (x, y), lab in zip(X, j['posts']['label']):
        cx, cy = p.map(x, y, xr, yr)
        if lab:
            p.d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], fill=BONE)
        else:
            p.d.ellipse([cx - 12, cy - 12, cx + 12, cy + 12], outline=ASH, width=3)
    p.text((24, PH - 40), 'grey: K1 sheets (each 3/4)   bone: the 2 trained hidden-unit lines')
    out.append(p)
    p = Panel('xor_mlp · hidden space (h1, h2)', 'posts move here at 14.017; output line separates them')
    xr = yr = (-0.15, 1.15)
    ol = j['output']['line_hidden_space']
    (a, b) = ol['ends']
    p.d.line([p.map(*a, xr, yr), p.map(*b, xr, yr)], fill=BONE, width=2)
    for s in j['snapshots']:
        for h, lab in zip(s['h'], j['posts']['label']):
            cx, cy = p.map(*h, xr, yr)
            p.d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=GRAPH)
    for h, lab in zip(j['final']['h'], j['posts']['label']):
        cx, cy = p.map(*h, xr, yr)
        if lab:
            p.d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=BONE)
        else:
            p.d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], outline=ASH, width=3)
    p.text((24, PH - 40), f'y = {[round(v, 4) for v in j["final"]["y"]]}   min pair dist {j["hidden"]["min_pair_distance"]:.4f}')
    out.append(p)
    return out


def p_sigmoid():
    j = J('sigmoid_chain.json')
    p = Panel('sigmoid_chain · |dL/dh| after each valve (log10)', 'bound (bone) · signal (ash) · random (graphite) · relu (top line)')
    xr, yr = (0.5, 8.5), (-10, 0.5)
    for name, col in [('random', GRAPH), ('signal', ASH), ('bound', BONE), ('relu', BONE)]:
        g = [max(v, 1e-12) for v in j[name]['grad_back']]
        p.poly(range(1, 9), [math.log10(v) for v in g], xr, yr, fill=col, w=3 if name == 'bound' else 2)
    for k, s in enumerate(j['bound']['nixie']):
        x, y = p.map(k + 1, math.log10(j['bound']['grad_back'][k]), xr, yr)
        p.text((x - 24, y + 6), s, fill=BONE)
    p.text((24, PH - 40), 'x = valves crossed (tube 8 first);  4^-8 = %.6g' % j['bound_4_pow_minus_8'])
    return [p]


def p_trigram():
    j = J('trigram.json')
    p = Panel('trigram · counted on this song', f'{j["tokens"]} word tokens, {j["types"]} types, {j["trigram_types"]} trigram types')
    y = 70
    for h in j['headline']:
        p.text((24, y), h['text'], fill=BONE, small=False)
        p.text((24, y + 24), 'lines ' + ', '.join(map(str, h['lines'])) + '   ' + str(h['continuations']))
        y += 58
    y += 6
    for r in j['window_L16']:
        p.text((24, y), f'[{" ".join(r["window"])}]  c = {r["count"]} / {r["context_count"]}')
        y += 18
    return [p]


def p_conv1():
    try:
        j = J('conv1_seq.json')
    except FileNotFoundError:
        return []
    F = j['frames']
    U = u8(j['u8'], (F, 96, 11, 11, 3))
    p = Panel('conv1_seq · 96 filters through training', f'{F} frames · final test {j["test_acc"][-1] * 100:.2f}% · '
              f'order == filters/conv1.json: {j["order_matches_filters_conv1"]}')
    picks = [0, 3, 6, 9, 12, 15, 18, 24, F - 1]
    for k, f in enumerate(picks):
        cell = np.full((8 * 13 + 1, 12 * 13 + 1, 3), INK, np.uint8)
        for c in range(96):
            r, q = divmod(c, 12)
            cell[r * 13 + 1:r * 13 + 12, q * 13 + 1:q * 13 + 12] = U[f, c]
        im = Image.fromarray(cell).resize((141, 94), Image.LANCZOS)
        r, c = divmod(k, 3)
        x0, y0 = 26 + c * 176, 60 + r * 110
        p.im.paste(im, (x0, y0))
        acc = j['test_acc'][f]
        p.text((x0, y0 + 95), f'#{f} · ep {j["epoch"][f]:.3g} · {acc * 100:.0f}%', fill=ASH)
    return [p]


def p_rnn():
    j = J('rnn_bptt.json')
    out = []
    p = Panel('rnn_bptt · log10 |dL/dh_t|, t = 1..64', f'vanish ρ={j["bptt"]["vanish"]["spectral_radius"]:.2f} (ash) · '
              f'explode ρ={j["bptt"]["explode"]["spectral_radius"]:.2f} (bone)')
    xr, yr = (1, 64), (-21, 7)
    p.poly(range(1, 65), j['bptt']['vanish']['log10'], xr, yr, fill=ASH, w=3)
    p.poly(range(1, 65), j['bptt']['explode']['log10'], xr, yr, fill=BONE, w=3)
    y0 = p.map(1, 0, xr, yr)[1]
    p.d.line([(20, y0), (PW - 20, y0)], fill=GRAPH)
    out.append(p)
    p = Panel('rnn_bptt · cart LEDs: 8-d h over L17 tokens', ' '.join(j['state']['L17_tokens']).replace('Ġ', '·'))
    H = np.array(j['state']['L17_h'])
    T = len(H)
    for t in range(T):
        for k in range(8):
            v = H[t, k]
            x0 = 30 + t * 33
            yc = 230
            h = v * 140
            p.d.rectangle([x0 + k * 3.6, min(yc, yc - h), x0 + k * 3.6 + 2.6, max(yc, yc - h)], fill=BONE if v > 0 else ASH)
    out.append(p)
    return out


def p_lstm():
    j = J('lstm_gates.json')
    p = Panel('lstm_gates · display cell f / i / o along the 64-step road', ' '.join(j['tokens'][:12]).replace('Ġ', '·') + ' …')
    xr, yr = (0, 63), (-0.05, 1.05)
    for name, col, off in [('f', BONE, 0), ('i', ASH, 0), ('o', GRAPH, 0)]:
        box = (20, 70 + off, PW - 20, PH - 30)
        p.poly(range(64), j['display'][name], xr, yr, fill=col, w=2, box=box)
    p.text((24, PH - 26), 'f bone · i ash · o graphite (0 = plate closed, 1 = open)')
    return [p]


def p_s2s():
    j = J('seq2seq_attn.json')
    p = Panel('seq2seq_attn · α (decoder step x encoder brick)', f'anti-diagonal mean {j["anti_diagonal_mean"]:.3f} · '
              f'example reversed correctly: {j["example"]["correct"]}')
    grid_img(p, j['alpha'], (150, 64, 150 + 324, 64 + 324))
    for k, w in enumerate(j['example']['input']):
        p.text((20, 64 + k * 27 + 6), '', fill=ASH)
    for k, w in enumerate(j['example']['output']):
        p.text((24, 64 + k * 27 + 6), w[:14], fill=ASH)
    return [p]


def p_tiny():
    j = J('tiny_tf.json')
    A = u8(j['maps']['u8'], j['maps']['shape']).astype(float) / 255
    p = Panel('tiny_tf · 6 layers x 8 heads (drop1 panels)', f'{j["params"] / 1e6:.1f}M params · song next-token acc {j["song_next_token_acc"]:.3f}')
    for l in range(6):
        for h in range(8):
            x0, y0 = 22 + h * 66, 60 + l * 54
            grid_img(p, np.sqrt(A[l, h]), (x0, y0, x0 + 50, y0 + 50))
    out = [p]
    p = Panel('tiny_tf · GONE as 512 bars (final hidden state)', 'tokens Ġg + one, index 495-496')
    v = np.array(j['gone']['hidden'])
    m = np.abs(v).max()
    for k, x in enumerate(v):
        X = 20 + k * (PW - 40) / 512
        h = x / m * 150
        p.d.line([(X, 230), (X, 230 - h)], fill=BONE if x > 0 else ASH, width=1)
    out.append(p)
    return out


def p_attn():
    j = J('attn_lyrics.json')
    p = Panel('attn_lyrics · query light on the 4 bricks', 'left: before the wedge (head mean) · right: causal')
    for k, (M, x0) in enumerate([(j['full_mean'], 40), (j['causal_mean'], 300)]):
        grid_img(p, M, (x0, 90, x0 + 200, 290), vmin=0, vmax=1)
        for r in range(4):
            for c in range(4):
                p.text((x0 + c * 50 + 8, 90 + r * 50 + 18), f'{M[r][c]:.2f}', fill=(255, 120, 120) if False else ASH)
    for i, b in enumerate(j['bricks']):
        p.text((40 + i * 50, 296 + (i % 2) * 16), b, fill=BONE)
    p.text((24, PH - 40), f'self brightest: {j["self_brightest"]}')
    return [p]


def p_diff():
    j = J('diffusion_glyph.json')
    p = Panel('diffusion_glyph · DIFFUSION at 6 keyframes', 'exact mixture score, DDIM η=0 (PF-ODE)')
    w = j['words'][0]
    P = f16(w['pos'], (64, w['n'], 2))
    wd = w['width']
    for r, k in enumerate([0, 44, 50, 54, 58, 63]):
        box = (20, 58 + r * 56, PW - 20, 58 + r * 56 + 52)
        xr, yr = (-0.3 * wd, 1.3 * wd), (-1.0, 2.0)
        for x, y in P[k][::2]:
            X, Y = p.map(x, y, xr, yr, box)
            if box[0] <= X <= box[2] and box[1] <= Y <= box[3]:
                p.d.point((X, Y), fill=BONE)
        p.text((22, box[1]), f't={w["t"][k]}', fill=ASH)
    out = [p]
    g = j['grid']
    P = f16(g['pos'], (64, g['n'], 2))
    p = Panel('diffusion_glyph · 25-cluster grid', f'modes covered {g["modes_covered"]}/25')
    for c, k in enumerate([0, 40, 50, 63]):
        box = (20 + c * 132, 90, 20 + c * 132 + 124, 90 + 124)
        for x, y in P[k]:
            X, Y = p.map(x, y, (-1.6, 1.6), (-1.6, 1.6), box)
            if box[0] <= X <= box[2] and box[1] <= Y <= box[3]:
                p.d.point((X, Y), fill=BONE)
        p.text((box[0], box[3] + 6), f't={g["t"][k]}')
    out.append(p)
    return out


def p_quant():
    j = J('quant.json')
    p = Panel('quant · conv2 INT4 (per-channel absmax)', f'{j["n_weights"]:,} weights · SQNR {j["per_channel"]["sqnr_db"]:.1f} dB')
    h = np.array(j['per_channel']['hist'], float)
    for k, v in enumerate(h):
        x0 = 30 + k * 31
        p.d.rectangle([x0, 330 - v / h.max() * 240, x0 + 24, 330], fill=BONE)
        p.text((x0 + 2, 338), str(k - 8))
    out = [p]
    p = Panel('quant · 16 x 16 pillar wall (heights = INT4 code)', 'one real conv2 weight per output channel')
    for q in j['pillars']:
        x0, y0 = 40 + q['col'] * 30, 60 + q['row'] * 20
        hgt = (q['q'] + 8) / 15
        p.d.rectangle([x0, y0 + 18 - hgt * 18, x0 + 24, y0 + 18], fill=BONE)
    out.append(p)
    return out


def p_hog():
    im = Image.open(WIP / 'hog_sift_preview.png')
    p = Panel('hog_sift · relief, SIFT star, HOG cell stars', '3,780-D · 128-D')
    im.thumbnail((PW - 40, PH - 70))
    p.im.paste(im, (20, 60))
    return [p]


def p_svm():
    j = J('svm_fit.json')
    L = j['linear']
    p = Panel('svm_fit · rails on 3 support posts', L['dial'])
    xr, yr = (-15, 15), (-10, 10)
    for r in L['rails']:
        p.d.line([p.map(*r['a'], xr, yr), p.map(*r['b'], xr, yr)], fill=ASH, width=3)
    for k, ((x, z), lab) in enumerate(zip(L['posts'], L['label'])):
        X, Y = p.map(x, -z, xr, yr)
        rr = 7
        if k in L['support']:
            p.d.ellipse([X - 11, Y - 11, X + 11, Y + 11], outline=BONE, width=2)
        if lab > 0:
            p.d.rectangle([X - rr, Y - rr, X + rr, Y + rr], fill=BONE)
        else:
            p.d.rectangle([X - rr, Y - rr, X + rr, Y + rr], outline=ASH, width=2)
    out = [p]
    K = j['kernel']
    p = Panel('svm_fit · kernel lift (side view x1 vs z), blade', f'z* = {K["blade_z_m2"]:.2f} m² · tilt {K["tilt_deg"]:.1e}° · 60 posts')
    pts = np.array(K['posts'])
    zs = np.array(K['z_m2'])
    xr, yr = (-7.5, 7.5), (-3, 92)
    y0 = p.map(0, 0, xr, yr)[1]
    p.d.line([(20, y0), (PW - 20, y0)], fill=GRAPH)
    for (x, y), z, lab in zip(pts.tolist(), zs.tolist(), K['label']):
        X, Y = p.map(x + 0.12 * y, z, xr, yr)
        p.d.line([(X, y0), (X, Y)], fill=DIM, width=1)
        p.d.ellipse([X - 4, Y - 4, X + 4, Y + 4], fill=BONE if lab > 0 else ASH)
    Yb = p.map(0, K['blade_z_m2'], xr, yr)[1]
    p.d.line([(30, Yb), (PW - 30, Yb)], fill=BONE, width=2)
    p.text((30, Yb - 18), 'blade (flat)')
    out.append(p)
    return out


def p_misc():
    out = []
    j = J('hamming.json')
    p = Panel('hamming · MEMORY\'S register + (72,64) SECDED', j['panel'] + ' · ' + j['verified'])
    for r, row in enumerate(j['register']):
        p.text((30, 70 + r * 30), row['char'], fill=BONE, small=False)
        for b, bit in enumerate(row['bits']):
            x0, y0 = 70 + b * 28, 70 + r * 30
            p.d.rectangle([x0, y0, x0 + 22, y0 + 22], fill=BONE if bit else DIM)
    for b, bit in enumerate([j['overall_parity']] + j['check_bits']):
        x0 = 330 + b * 26
        p.d.rectangle([x0, 70, x0 + 20, 92], fill=ASH if bit else DIM)
    p.text((330, 100), 'p0 + 7 check bits')
    out.append(p)
    j = J('rope.json')
    p = Panel('rope · 8 dials at position m = 5 (q needle bone, k at n = 3 ash)', 'θᵢ = 10000^(−2i/16); spread at fixed m−n ' + f'{j["max_spread"]:.1e}')
    for i in range(8):
        cx, cy = 60 + (i % 4) * 130, 140 + (i // 4) * 150
        p.d.ellipse([cx - 50, cy - 50, cx + 50, cy + 50], outline=ASH, width=2)
        for ang, col in [(j['q_needle'][5][i], BONE), (j['k_needle'][3][i], ASH)]:
            p.d.line([(cx, cy), (cx + 45 * math.cos(ang), cy - 45 * math.sin(ang))], fill=col, width=3)
        p.text((cx - 30, cy + 54), f'θ{i}={j["theta"][i]:.2g}')
    out.append(p)
    j = J('norms.json')
    p = Panel('norms · 16 real dims: x, LayerNorm, RMSNorm', f'μ={j["mu"]:.3f} σ={j["sigma"]:.3f} rms={j["rms"]:.3f}')
    for r, (vals, lab) in enumerate([(j['x'], 'x'), (j['layernorm']['unit'], 'LN (unit)'), (j['rmsnorm']['unit'], 'RMS (unit)')]):
        yc = 120 + r * 100
        p.d.line([(80, yc), (540, yc)], fill=GRAPH)
        p.text((20, yc - 8), lab)
        for k, v in enumerate(vals):
            x0 = 90 + k * 28
            p.d.rectangle([x0, min(yc, yc - v * 25), x0 + 18, max(yc, yc - v * 25)], fill=BONE if v > 0 else ASH)
    out.append(p)
    j = J('moe_router.json')
    p = Panel('moe_router · top-2 of 8 per word', f'toy gate seed {j["seed"]}')
    for r, w in enumerate(j['words']):
        p.text((24, 80 + r * 72), w['word'], fill=BONE, small=False)
        for e in range(8):
            x0, y0 = 170 + (e % 4) * 46, 70 + r * 72 + (e // 4) * 30
            on = e in w['top2']
            p.d.rectangle([x0, y0, x0 + 40, y0 + 26], fill=BONE if on else DIM)
        p.text((370, 86 + r * 72), ' '.join(f'{g:.2f}' for g in w['gates']))
    out.append(p)
    j = J('flash_tiles.json')
    p = Panel('flash_tiles · m and ℓ per row, Q tile 3 over K tiles 0..3', f'max |O_tiled − O_exact| = {j["max_abs_err"]:.1e}')
    t = j['tiles'][3]
    for s, st in enumerate(t['steps']):
        for r in range(16):
            p.text((30 + s * 130, 64 + r * 20), f'{st["m"][r]:6.2f} {st["l"][r]:6.2f}', fill=BONE if s == 3 else ASH)
    out.append(p)
    p = Panel('lora_svd · rank-8 texture of the sung line', '')
    im = Image.open(PUB / 'lora_rank8.png')
    im = im.resize((PW - 40, int(im.height * (PW - 40) / im.width)))
    p.im.paste(Image.merge('RGB', [im] * 3), (20, 80))
    jj = J('lora_svd.json')
    p.text((24, 160), f'energy at rank 8: {jj["energy"][7]:.3f} · rel. error {jj["rel_error_rank8"]:.3f}')
    p.text((24, 180), jj['lora']['plate'] + f'  ({jj["lora"]["percent"]:.6f} %)')
    out.append(p)
    j = J('niah.json')
    p = Panel('niah · context windows on the tape', f'{j["tokens"]:,} tokens, {j["length_m"]:,.1f} m, needle P @ index 0')
    for r, w in enumerate(j['windows']):
        frac = w['tokens'] / j['tokens']
        p.d.rectangle([40 + (1 - frac) * 460, 70 + r * 30, 500, 70 + r * 30 + 20], fill=BONE if w['contains_needle'] else ASH)
        p.text((44, 72 + r * 30), w['label'], fill=ASH)
    p.d.rectangle([36, 66, 40, 370], fill=BONE)
    out.append(p)
    j = J('bt_reward.json')
    p = Panel('bt_reward · Bradley–Terry scores of 4 answers', f'rank {j["rank"]} · L_DPO = {j["dpo"]["L_DPO"]:.4f}')
    for k, sc in enumerate(j['scores']):
        p.d.rectangle([60 + k * 110, min(230, 230 - sc * 50), 140 + k * 110, max(230, 230 - sc * 50)], fill=BONE if sc > 0 else ASH)
        p.text((60 + k * 110, 70 + (k % 2) * 18), f'ans {k}: #{j["rank"][k]} r={sc:.2f}', fill=BONE)
    out.append(p)
    return out


def p_gan():
    j = J('gan25.json')
    S = j['snapshots']
    c = j['clip']
    p = Panel('gan25 · 64 balls, peak → collapse', f'seed {j["seed"]} · modes {c["peak_modes"]} → {c["collapsed_modes"]} · switch @ {j["switch_step"]}')
    picks = np.linspace(c['from'], c['to'], 4).round().astype(int).tolist()
    for k, f in enumerate(picks):
        box = (20 + k * 132, 80, 20 + k * 132 + 124, 80 + 124)
        for cx, cy in j['centres']:
            X, Y = p.map(cx, cy, (-2.6, 2.6), (-2.6, 2.6), box)
            p.d.ellipse([X - 4, Y - 4, X + 4, Y + 4], outline=GRAPH)
        for (x, y) in S[f]['balls']:
            X, Y = p.map(x, y, (-2.6, 2.6), (-2.6, 2.6), box)
            p.d.ellipse([X - 1.5, Y - 1.5, X + 1.5, Y + 1.5], fill=BONE)
        p.text((box[0], box[3] + 6), f'step {S[f]["step"]}')
        p.text((box[0], box[3] + 22), f'{S[f]["modes"]} modes · q {S[f]["quality"]:.2f}')
    xr, yr = (0, len(S) - 1), (0, 25)
    p.poly(range(len(S)), [s['modes'] for s in S], xr, yr, fill=BONE, box=(20, 262, PW - 20, PH - 24))
    return [p]


ALL = {'xor': p_xor, 'sigmoid': p_sigmoid, 'trigram': p_trigram, 'conv1': p_conv1, 'rnn': p_rnn, 'lstm': p_lstm,
       's2s': p_s2s, 'tiny': p_tiny, 'attn': p_attn, 'diff': p_diff, 'quant': p_quant, 'hog': p_hog, 'svm': p_svm,
       'misc': p_misc, 'gan': p_gan}

if __name__ == '__main__':
    names = sys.argv[1:] or list(ALL)
    panels = []
    for n in names:
        panels += ALL[n]()
    p0 = [p for p in panels]
    if len(p0) > 15:
        sheet(p0[:15], 'sheet_data_A.png')
        sheet(p0[15:], 'sheet_data_B.png')
    else:
        sheet(p0, 'sheet_data_' + '_'.join(names) + '.png' if sys.argv[1:] else 'sheet_data_A.png')
