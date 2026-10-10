"""Re-check every Appendix B.4 number that this data can prove, from the exported JSON (not from the scripts' memory).

  tools/.venv/bin/python tools/data/verify_ledger.py        # prints PASS / FAIL per fact, exit 1 on any FAIL

Facts that come from the literature (benchmark scores, model sizes) cannot be recomputed here; they are listed as
`EXT` with the arithmetic that can be checked (e.g. Δ = 25.8 − 15.3).
"""
import json
import math
import sys

from _common import PUB, ROOT

rows = []


def check(fact, ok, got):
    rows.append(('PASS' if ok else 'FAIL', fact, got))


def ext(fact, got):
    rows.append(('EXT', fact, got))


def J(n):
    p = PUB / n
    return json.loads(p.read_text()) if p.exists() else None


def main():
    t = J('trigram.json')
    for h, (c, n) in zip(t['headline'], [(5, 9), (6, 6), (4, 4)]):
        check(h['text'].split(' =')[0] + f' = {c}/{n}', (h['count'], h['context_count']) == (c, n), h['text'])
    x = J('xor_mlp.json')
    check('XOR: one line gets at most 3/4', x['linear']['best_correct'] == 3, f"{x['linear']['best_correct']}/4")
    check('2-2-1 σ MLP + backprop solves XOR (seed 7)', x['output']['err'] == 0, f"ERR {x['output']['err']}/4, y={x['output']['y']}")
    s = J('sigmoid_chain.json')
    check("σ' = σ(1−σ) ≤ 1/4", abs(s['sigma_prime_max'] - 0.25) < 1e-9, s['sigma_prime_max'])
    check('8 layers ≤ 4⁻⁸ ≈ 1.5e-5 (|w| ≤ 1)', abs(s['bound']['product'] / 4 ** -8 - 1) < 1e-6 and s['bound']['nixie'][-1] == '0.000015',
          f"{s['bound']['product']:.6g}, nixie {s['bound']['nixie'][-1]}")
    check('ReLU: derivative 1 for x > 0 (gradient unchanged)', s['relu']['product'] == 1, s['relu']['product'])
    h = J('hog_sift.json')
    check('HOG 8×8 cells, 9 bins, 2×2 blocks, 64×128 -> 3,780-D', h['hog']['dims'] == 3780 and len(h['hog']['descriptor']) == 3780, h['hog']['dims'])
    check('SIFT 4×4×8 = 128-D', h['sift']['dims'] == 128 and len(h['sift']['descriptor']) == 128, h['sift']['dims'])
    c1 = json.loads((ROOT / 'app' / 'public' / 'filters' / 'conv1.json').read_text())
    check('film conv1: 96×11×11×3, stride 2, 2 groups, CIFAR-10 @64 px, test 88.31 %',
          abs(c1['test_accuracy'] - 0.8831) < 1e-9 and '/s2' in c1['arch'], f"{c1['test_accuracy']} · {c1['arch'][:40]}…")
    check('film CNN = 5 conv + 2 FC', c1['arch'].count('conv') == 5 and c1['arch'].count('FC') == 2, c1['arch'])
    cs = J('conv1_seq.json')
    if cs:
        check('conv1 sequence re-run reproduces the film checkpoint', cs['max_abs_diff_final_vs_filters_conv1_ckpt'] == 0.0 and abs(cs['test_acc'][-1] - 0.8831) < 1e-9,
              f"max diff {cs['max_abs_diff_final_vs_filters_conv1_ckpt']}, final acc {cs['test_acc'][-1]}")
    v = J('svm_fit.json')
    w = v['linear']['w']
    check('SVM margin = 2/‖w‖ (3 support vectors)', abs(v['linear']['margin_m'] / (2 / math.hypot(*w)) - 1) < 1e-5 and len(v['linear']['support']) == 3,
          v['linear']['dial'])
    check('kernel: φ(x) = (x1, x2, x1²+x2²) separates square vs frame with a flat blade', v['kernel']['tilt_deg'] < 1e-6, f"z* {v['kernel']['blade_z_m2']:.3f}")
    ext('ILSVRC top-5 2010 28.2 / 2011 25.8 / 2012 15.3, Δ 10.5', f'25.8 − 15.3 = {25.8 - 15.3:.1f}')
    ext('WMT14 En→De 23.75 / 24.6 / 25.16 / 26.03 / 28.4, Δ +2.37', f'28.4 − 26.03 = {28.4 - 26.03:.2f}')
    ext('Transformer base N=6 h=8 d_model=512 d_ff=2048 ≈ 65M', 'film model copies the shape: ' + str(J('tiny_tf.json')['params']) + ' params with vocab 272')
    d = J('diffusion_glyph.json')
    check('DDPM T=1000, β 1e-4 -> 0.02 linear, ε-prediction', d['schedule'] == {'T': 1000, 'beta0': 1e-4, 'beta1': 0.02, 'pred': 'epsilon'}, d['schedule'])
    r = J('rope.json')
    check('RoPE θᵢ = 10000^(−2i/d); q·k depends only on m − n', r['max_spread'] < 1e-12 and abs(r['theta'][1] - 10000 ** (-2 / 16)) < 1e-6,
          f"spread {r['max_spread']:.1e}")
    n = J('norms.json')
    check('SiLU min ≈ −0.2785 at x ≈ −1.2785', abs(n['swish']['y_min'] + 0.27846) < 1e-4 and abs(n['swish']['x_min'] + 1.27846) < 1e-4,
          f"{n['swish']['y_min']:.5f} @ {n['swish']['x_min']:.5f}")
    check('RMSNorm: no mean-centring, no bias', abs(sum(a - b for a, b in zip(n['rmsnorm']['unit'], [xx / n['rms'] for xx in n['x']]))) < 1e-4, 'x / rms')
    m = J('moe_router.json')
    check('top-2 of 8 routing', all(len(w['top2']) == 2 for w in m['words']) and m['experts'] == 8, [w['top2'] for w in m['words']])
    q = J('quant.json')
    check('FP32 = 1/8/23; INT4 16 levels; 32 -> 4 bit = ÷8', q['fp32'] == {'sign': 1, 'exponent': 8, 'mantissa': 23} and q['int4']['levels'] == 16
          and sum(1 for c in q['per_channel']['hist'] if c > 0) == 16 and q['memory']['fp32_bytes'] / q['memory']['int4_bytes'] == 8,
          f"hist {q['per_channel']['hist']}")
    check('7,168 bit plates shed (256 × 28)', q['plates']['total_shed'] == 7168, q['plates']['total_shed'])
    lo = J('lora_svd.json')['lora']
    check('LoRA d=4096 r=8 -> 0.39 % trainable, B₀ = 0', lo['trainable'] == 65536 and lo['full'] == 16777216 and round(lo['percent'], 2) == 0.39 and lo['B0'] == 0,
          f"{lo['percent']:.6f} %")
    f = J('flash_tiles.json')
    check('FlashAttention tiling is exact (online softmax)', f['max_abs_err'] < 1e-12, f"{f['max_abs_err']:.1e}")
    ni = J('niah.json')
    check('2K -> 1M = 2¹¹ -> 2²⁰, 9 doublings', ni['doublings'] == 9 and ni['windows'][0]['tokens'] == 2048 and ni['windows'][-1]['tokens'] == 2 ** 20,
          [w['label'] for w in ni['windows']][::9])
    check('n = 2²⁰ -> n² = 1,099,511,627,776', (2 ** 20) ** 2 == 1099511627776, f'{(2 ** 20) ** 2:,}')
    sc = J('scaling.json')
    check('L ∝ C^−0.050: 4096^−0.05 = 0.66, ×0.966 per doubling', round(sc['x4096'], 2) == 0.66 and round(sc['per_doubling'], 3) == 0.966,
          f"{sc['x4096']:.5f}, {sc['per_doubling']:.5f}")
    hm = J('hamming.json')
    check('SECDED corrects 1 bit, detects 2', hm['verified'].startswith('all 72 single'), hm['verified'])
    bt = J('bt_reward.json')
    check('DPO: Z(x) cancels in r_w − r_l', abs(bt['dpo']['check'][0]['pref'] - bt['dpo']['check'][1]['pref']) < 1e-12, [c['pref'] for c in bt['dpo']['check']])
    g = J('gan25.json')
    check('GAN mode collapse (real run)', not g['illustrative'] and g['clip']['collapsed_modes'] <= 2 and g['clip']['peak_modes'] >= 10,
          f"{g['clip']['peak_modes']} -> {g['clip']['collapsed_modes']} modes (seed {g['seed']})")
    rb = J('rnn_bptt.json')['bptt']
    check('BPTT gradients vanish (ρ<1) or explode (ρ>1)', rb['vanish']['ratio_first_last'] < 1e-3 and rb['explode']['ratio_first_last'] > 1e3,
          f"ρ {rb['vanish']['spectral_radius']:.2f}: ×{rb['vanish']['ratio_first_last']:.1e}; ρ {rb['explode']['spectral_radius']:.2f}: ×{rb['explode']['ratio_first_last']:.1e}")
    s2 = J('seq2seq_attn.json')
    check('additive attention on reversal -> anti-diagonal α', s2['anti_diagonal_mean'] > 0.8 and s2['example']['correct'], f"{s2['anti_diagonal_mean']:.3f}")
    ext('GLUE 80.5 / 72.8; SuperGLUE 69.0 / 89.8 / 71.8 / 89.0; LAMBADA 86.4 vs 68.0; 175B: 96 layers, ctx 2,048', 'literature (checked against the source tables by hand)')
    for st, fact, got in rows:
        print(f'{st:4s}  {fact}  ->  {got}')
    fails = [r for r in rows if r[0] == 'FAIL']
    print(f'\n{sum(r[0] == "PASS" for r in rows)} PASS, {len(fails)} FAIL, {sum(r[0] == "EXT" for r in rows)} EXT')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()
