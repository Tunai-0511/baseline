"""Top-2-of-8 routing with a toy gate on real token representations: which pair of experts wakes for each sung word.

  tools/.venv/bin/python tools/data/moe_router.py      -> app/public/data/moe_router.json

x = the film Transformer's final hidden state (tools/data/tiny_tf/acts.npz) of each word of "only some experts awake",
averaged over the word's BPE tokens (512-d). Gate: logits = W_g x, W_g ∈ R^{8 x 512} ~ N(0, 1/512) — a toy, untrained
router (sparsely-gated MoE form: softmax over the top-k logits, k = 2). The seed is the smallest one ≥ 0 for which the
4 words wake 4 different pairs (search documented in `seed_search`): a toy gate is a choice, the logits it then produces
are computed, not drawn. Experts sit in a 2 x 4 block, expert e at (row e // 4, col e % 4).

Consumers: verse3 S3 133.74-136.76 (DENSE splits into 8 expert rooms; ONLY / SOME / EXPERTS / AWAKE each on the dot
matrix of the pair the router picks; `TOP-2 OF 8`).
"""
import numpy as np

from _common import TDATA, save_json

E, K = 8, 2


def main():
    a = np.load(TDATA / 'tiny_tf' / 'acts.npz')
    hid = a['experts_hid'].astype(np.float64)
    toks = a['experts_tok']
    s0, s1 = a['experts_span']
    import json
    from _common import bpe_tokens
    btoks, _, vocab = bpe_tokens()
    words = ['only', 'some', 'experts', 'awake']
    # BPE pieces: Ġon ly | Ġso me | Ġexp er ts | Ġa w ake
    pieces = [[s0, s0 + 2], [s0 + 2, s0 + 4], [s0 + 4, s0 + 7], [s0 + 7, s1]]
    got = [''.join(vocab[t] for t in toks[p0:p1]).replace('Ġ', '') for p0, p1 in pieces]
    assert got == words, got
    X = np.stack([hid[p0:p1].mean(0) for p0, p1 in pieces])
    search = []
    for seed in range(100):
        Wg = np.random.default_rng(seed).normal(0, 1 / np.sqrt(512), (E, 512))
        L = X @ Wg.T
        pairs = [tuple(sorted(np.argsort(-l)[:K].tolist())) for l in L]
        search.append({'seed': seed, 'pairs': pairs})
        if len(set(pairs)) == 4:
            break
    out = []
    for w, l in zip(words, L):
        top = np.argsort(-l)[:K]
        gw = np.exp(l[top] - l[top].max())
        gw /= gw.sum()
        p = np.exp(l - l.max()); p /= p.sum()
        out.append({'word': w.upper(), 'logits': l, 'softmax': p, 'top2': top, 'gates': gw,
                    'cells': [[int(e) // 4, int(e) % 4] for e in top]})
        print(f'  {w:8s} top-2 {top.tolist()} gates {np.round(gw, 3).tolist()}')
    save_json('moe_router.json', {
        'what': 'top-2 of 8 routing; toy gate W_g ~ N(0, 1/512) on the film Transformer\'s hidden states',
        'seed': seed, 'seed_search': search, 'experts': E, 'k': K, 'layout': '2 x 4, expert e at (e // 4, e % 4)',
        'words': out, 'engraving': 'TOP-2 OF 8',
        'gate_rule': 'g = softmax over the 2 largest logits (other experts 0)',
    }, sig=6)


if __name__ == '__main__':
    main()
