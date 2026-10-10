#!/bin/sh
# Rebuild every data file of the data agent in dependency order (fixed seeds; the outputs are deterministic).
#   sh tools/data/run_all.sh            # everything except the 45-minute conv1 re-run
#   sh tools/data/run_all.sh conv1      # also re-run the conv1 training sequence (MPS)
set -e
cd "$(dirname "$0")"
PY=../.venv/bin/python
if [ "$1" = "conv1" ]; then $PY conv1_seq.py train; fi
[ -f conv1_seq/snaps.npz ] && $PY conv1_seq.py export
for s in trigram xor_mlp sigmoid_chain quant hog_sift svm_fit hamming scaling \
         tiny_tf attn_lyrics rnn_bptt lstm_gates seq2seq_attn \
         norms moe_router flash_tiles rope lora_svd niah bt_reward gan25 diffusion_glyph; do
  echo "== $s"; $PY $s.py
done
$PY verify_ledger.py
$PY preview.py
