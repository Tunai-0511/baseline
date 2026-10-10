# tools/data — the film's real numbers

Every number the film puts on a machine comes from a script here. The scripts use fixed seeds and no clock or
network, so a rebuild gives the same bytes. Each script writes compact JSON with floats rounded to float32 precision
into `app/public/data/`, and its docstring names the shot that consumes it.
Sources are listed only in TREATMENT.md Appendix B.4. They are never engraved.

```sh
sh tools/data/run_all.sh                 # rebuild everything (the conv1 training run is kept unless you pass `conv1`)
tools/.venv/bin/python tools/data/verify_ledger.py   # re-checks every B.4 number these files can prove; exits 1 on failure
tools/.venv/bin/python tools/data/preview.py         # QA contact sheets -> out/wip/p0/data/sheet_data_{A,B}.png
```

**Loading.** Load JSON with `fetchData('<name>.json')` from `src/engine/lyricreg.ts`. In the dev server `/data/*`
points at the repo's `data/`, so `fetchData` falls back to `public/data/`. Load PNGs the same way: try
`data/<name>.png`, then `public/data/<name>.png`.

**Binary payloads.** Some fields hold base64 strings in little-endian order. Decode them like this:

```ts
const bytes = Uint8Array.from(atob(s), c => c.charCodeAt(0));
const u8 = bytes;                                        // 'u8' fields
const f16 = new Uint16Array(bytes.buffer);               // 'pos' fields: half floats -> THREE.DataUtils.fromHalfFloat(h)
                                                         // or upload as HalfFloatType / RG16F directly
```

## Script → output → shot

| script | output (`app/public/data/`) | consumed by | key fields |
|---|---|---|---|
| `xor_mlp.py` | `xor_mlp.json` | verse1 S1 9.405–15.86: K1 light sheet (best line 3/4, `ERR 1/4`); 13.49 the hidden-unit lines; 14.017 posts move to (h1, h2); `2-2-1 · σ · SEED 7`; 15.40 `ERR 0/4` | `linear.sheets[4]` (one wrong post each), `hidden.coords`, `hidden.lines_input_space`, `output.line_hidden_space`, `snapshots` |
| `sigmoid_chain.py` | `sigmoid_chain.json` | verse1 S2 16.07–21.87: tube nixies, bead brightness, D1 at full brightness | `bound.grad_back` / `bound.nixie` (valve 8 first: 0.250000 … 0.000015), `relu` (all 1) |
| `conv1_seq.py` (train / export) | `conv1_seq.json` + `conv1_seq.png` | verse1 S3 28.20–28.60 (pin heights = weights); chorus1 58.52–59.5 (16th-note waves from noise to filters) | 45 frames (init, 14 steps inside epoch 1, every epoch end). `u8` [frame][cell][11][11][rgb], per-cell `lo`/`hi` (true weight = lo + u8/255·(hi−lo)), `order`, `test_acc`, `similarity_to_final`. The PNG atlas stacks 156×104 frames vertically |
| `trigram.py` | `trigram.json` | verse2 60.995–63.29: window gantry, drum counters (`c = 1`), beam `P(art \| of the) = 5/9 · COUNTED ON THIS SONG` | `headline[3]`, `window_L16` |
| `rnn_bptt.py` | `rnn_bptt.json` | verse2 64.68–66.88: cart LEDs (real 8-d h); 69.48–71.11: manometers and the oscilloscope's two log‖∂L/∂h_t‖ curves | `state.h` (1065 × 8), `state.L17_h`, `bptt.vanish/explode.log10` (t = 1…64) |
| `lstm_gates.py` | `lstm_gates.json` | verse2 72.02–74.76: gate road, f/i/o plates per step | `display.{f,i,o,c}` (64 steps), full `f,i,o,c` 64 × 16, `mean` |
| `seq2seq_attn.py` | `seq2seq_attn.json` | verse2 80.28–81.20: 12 light arms, brightness = α (anti-diagonal) | `alpha` 12 × 12 [decoder step][encoder brick], `example` |
| `tiny_tf.py` | `tiny_tf.json` (+ `tools/data/tiny_tf/{model.pt,acts.npz}`) | drop1: 48 head panels and the 8 chops; 116.24 GONE → 512 bars | `maps.u8` [6][8][32][32], `head_stats`, `gone.hidden` (512) |
| `attn_lyrics.py` | `attn_lyrics.json` | pre3 148.62–150.58: query light on ATTENTION'S / ALL / YOU / NEED; 153.26 causal wedge | `full_mean` (before the wedge), `causal_mean` (after it), per-head `full`/`causal`, `self_brightest` |
| `diffusion_glyph.py` | `diffusion_glyph.json` | verse3 123.48–126.33: DIFFUSION, then LEARNED TO DENOISE IN A, condense along the PF-ODE; odometer t; 25-cluster grid at the column top | `words[i].pos` (f16 [64][n][2], cap-height units, origin at the left end of the baseline), `t`, `k90`, `k90_ink`, `frac_*`; `grid` likewise ([-1,1]²) |
| `quant.py` | `quant.json` | verse3 137.18–138.77: 256 pillars × 32 bit plates, 7,168 plates shed, INT4 snap, histogram | `pillars[256]` (w, fp32 hex/sign/exp/mant, q, deq), `per_channel.hist` (codes −8…7) |
| `hog_sift.py` | `hog_sift.json` | verse1 S3 23.47–27.39: stele relief, a 9-ray star per 8×8 cell, 24.09 the 4×4×8 arrow star | `capsules`, `relief.height` (128 × 64), `hog.cells` [16][8][9], `hog.descriptor` (3,780), `sift.descriptor` (128) |
| `svm_fit.py` | `svm_fit.json` | verse1 S4 31.08–34.09: rails stop on 3 support posts, dial `2/‖w‖ = 3.29 m`; kernel pistons and the flat blade | `linear.{posts,label,rails,support,margin_m}`, `kernel.{posts,z_m2,blade_z_m2}` |
| `hamming.py` | `hamming.json` | pre2 90.34–94.90: the ASCII register of MEMORY'S; ECC panel; `CORRECTS 1 BIT · DETECTS 2` | `register[8].bits`, `codeword` (72), `clean.display` = `00` |
| `rope.py` | `rope.json` | verse3 S2 126.93–129.67: sine plates, 8 dials with q/k needles, `q·k DEPENDS ONLY ON m − n` | `theta`, `q_needle/k_needle` [64][8], `plates`, `invariance` |
| `norms.py` | `norms.json` | verse3 130.10–132.92: 16 real activation bars, LayerNorm then RMSNorm; Swish dip | `x`, `layernorm`, `rmsnorm`, `g`, `b`, `swish.{x_min,y_min}`, `curves` |
| `moe_router.py` | `moe_router.json` | verse3 135.68–136.76: which pair of experts lights for each word | `words[4].{top2,gates,cells}` |
| `flash_tiles.py` | `flash_tiles.json` | bridge B2 178.18–179.64: each row's m and ℓ 7-segments | `tiles[4].steps[j].{m,l}` (16 rows each), `max_abs_err` |
| `lora_svd.py` | `lora_svd.json` + `lora_rank8.png` | verse3 S4 142.14–144.18: the patch texture (background only); plate numbers | `A`, `B` (rebuild at any rank ≤ 8), `energy`, `lora.*` |
| `niah.py` | `niah.json` | bridge B3 184.54–191.17: window doublings, odometer labels, haystack tape, needle `P` at index 0 | `windows[10]`, `helix` (default square helix on the ring roads), `needle` |
| `bt_reward.py` | `bt_reward.json` | bridge B1 171.72–175.50: comparator pointers, rank cards, DPO Z(x) cancellation | `scores`, `P`, `rank`, `dpo.check` |
| `gan25.py` | `gan25.json` | verse3 S1 119.84–123.29: G throws balls between dimples, D's 8×8 lamps, coverage drops to 1 mode | `snapshots[91]` (64 balls, `d_fake`, `modes`, `score_GD`), `clip.{from,to}` |
| `scaling.py` | `scaling.json` | pre4 199.43–204.83: the scaling gauge, −3.4 % per doubling, nameplate `EXTRAPOLATED` | `gauge[13]`, `per_doubling`, `x4096` |
| `verify_ledger.py` | (stdout) | — | 32 PASS / 0 FAIL / 4 EXT (literature) |
| `preview.py` | `out/wip/p0/data/sheet_data_{A,B}.png` | QA only | — |

Shared code lives in `_common.py`: paths, `save_json` (compact, float32-rounded), `lyric_words`, `bpe_tokens`,
`find_token_span` and `torch_seed`.
The other owner's scripts in this directory are `add_syl.py`, `export_pitch.py` and `ibp.py` (pre1-assets). The data
files they write (`syl.json`, `pitch/`, `ibp.json`) are not covered here.

## Choices worth knowing

- **conv1_seq.** This re-runs `tools/conv1/train.py` with the exact recipe of `tools/data/conv1/log.json`. The run
  matches the original bit for bit on MPS: every epoch's accuracy is identical, and the final weights differ from
  `tools/data/conv1/last.pt` by 0. So the last frame is exactly the film's `filters/conv1.png`, in the same cell order,
  without its 0.4 desaturation.
- **sigmoid_chain.** The engraved `0.000015` is 4⁻⁸, the bound itself. It is reached by the best-case chain
  (`bound`: w = 1 and z = 0 at every valve), and only after all 8 valves. At tube 4 (ZERO) the bound reads 0.000977.
  The realistic chains (`signal`, `random`) fall faster.
- **xor_mlp.** Seed 7 finds the "x1 AND NOT x2 / x2 AND NOT x1" solution. Both graphite posts (class 0) land on almost
  the same hidden point (≈ (0.01, 0.01), 0.004 apart). The bone posts go to (0.98, 0) and (0, 0.98).
- **tiny_tf.** It has 6 layers × 8 heads with d_model 512 and d_ff 2048, so each of drop1's 48 panels shows its own
  real weights. B.1 says "1 layer"; drop1 says each layer has its own weights, and the 6-layer model satisfies drop1.
  The model has 19.1M parameters. The base engraving's 65M is the 2017 model with its 37k vocabulary.
- **attn_lyrics.** The trained LM's queries look back. The sung brick is its own brightest key for ATTENTION'S and ALL.
  YOU looks hardest at ALL, and NEED looks hardest at ATTENTION'S (see `self_brightest`).
- **diffusion_glyph.** Data is normalised per axis (word width, 0.75 cap). Long words therefore condense late in the
  schedule (`k90_ink` ≈ keyframe 58–60), and short words earlier (≈ 49–51). Keyframes are spaced uniformly in log-SNR.
  Map song time to keyframe per word.
- **gan25.** With the stable recipe alone, 40 seeds all reached 20–25 modes and none collapsed. The collapse comes
  from a real hyperparameter change at step 3,000: G's learning rate goes to 5e-3 and β1 to 0.9. Seed 1 goes from 20
  modes at step 2,850 to 1 mode holding 98 % of samples at step 3,350, so the display is `MODES 1/25`. This is a real
  run, not the ILLUSTRATIVE fallback.
- **quant.** Scales are symmetric absmax per output channel, in Q4_0 style (d = m/−8, so all 16 codes −8…7 occur).
  Pillar k is output channel k, and one real weight per channel sits at a seeded tap.
- **hamming.** The 64 register bits are exactly one (72, 64) SECDED word. Its syndrome has 8 bits, so the panel
  should read `SYNDROME 00` (hex) or `00000000`. The sung ’ is stored as ASCII ' (0x27).
- **lora_svd.** The rank-8 reconstruction keeps 97.8 % of the energy and is fully legible. Rank 4 is still legible.
  Ranks 1–2 read as a barcode. To keep the patch a texture rather than a second lyric carrier, rebuild at rank 1–2
  from the `A`/`B` columns, or show rank 8 only after the line is sung.
