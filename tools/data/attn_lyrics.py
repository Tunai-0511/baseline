"""A one-layer attention LM on the song's words: the real softmax weights the query light throws on the 4 bricks of
"Attention’s all you need" (pre3), before and after the causal mask locks.

  tools/.venv/bin/python tools/data/attn_lyrics.py      -> app/public/data/attn_lyrics.json

Model: word-level (the sung words, lower-cased, punctuation stripped; vocab = the song's word types), learned token +
sinusoidal position embedding, ONE causal self-attention layer (8 heads, d_model 64) + output projection, trained as a
next-word LM on the song (Adam, seed 40, CPU). The bricks are the 4 words of L40.

Exports (for each head and for the head average):
  * full[q][k]   : softmax over the 4 bricks of the trained q·k scores with NO mask (the bricks before the wedge
                   locks; every brick sees every brick)
  * causal[q][k] : the same scores with the causal mask (upper triangle = −∞), i.e. what the trained LM actually uses
                   once the wedge has slid in (153.26 "guaranteed")
  * display      : the 8-head mean (`full_mean` before the wedge, `causal_mean` after). `self_brightest[q]` says
                   whether the sung brick is its own brightest key: true for ATTENTION'S and ALL, false for YOU (looks
                   back at ALL) and NEED (looks back at ATTENTION'S) — a trained LM's queries look back, they do not
                   simply light themselves (the bible's "the sung brick is brightest" holds only for the first two).

Consumers: pre3 148.62-150.58 (query = ATTENTION'S, ALL, YOU, NEED in turn; brick brightness = weight), 153.26 causal wedge.
"""
import math

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

from _common import lyric_words, save_json, torch_seed

SEED = 40
D, H = 64, 8


class AttnLM(nn.Module):
    def __init__(self, V, ctx):
        super().__init__()
        self.emb = nn.Embedding(V, D)
        pos = torch.arange(ctx)[:, None]
        i = torch.arange(D // 2)[None]
        ang = pos / 10000 ** (2 * i / D)
        pe = torch.zeros(ctx, D)
        pe[:, 0::2], pe[:, 1::2] = torch.sin(ang), torch.cos(ang)
        self.register_buffer('pe', pe)
        self.q = nn.Linear(D, D, bias=False)
        self.k = nn.Linear(D, D, bias=False)
        self.v = nn.Linear(D, D, bias=False)
        self.o = nn.Linear(D, D)
        self.out = nn.Linear(D, V)

    def scores(self, idx):
        x = self.emb(idx) + self.pe[:idx.shape[1]]
        B, T, _ = x.shape
        q = self.q(x).view(B, T, H, D // H).transpose(1, 2)
        k = self.k(x).view(B, T, H, D // H).transpose(1, 2)
        v = self.v(x).view(B, T, H, D // H).transpose(1, 2)
        return x, q @ k.transpose(-1, -2) / math.sqrt(D // H), v

    def forward(self, idx):
        x, s, v = self.scores(idx)
        T = idx.shape[1]
        s = s.masked_fill(torch.triu(torch.ones(T, T, dtype=torch.bool), 1), float('-inf'))
        o = (s.softmax(-1) @ v).transpose(1, 2).reshape(idx.shape[0], T, D)
        return self.out(x + self.o(o))


def main():
    torch_seed(SEED)
    W = lyric_words()
    words = [w[3] for w in W]
    vocab = sorted(set(words))
    wid = {w: i for i, w in enumerate(vocab)}
    data = torch.tensor([wid[w] for w in words])
    CTX = 24
    model = AttnLM(len(vocab), CTX)
    opt = torch.optim.Adam(model.parameters(), lr=3e-3)
    g = torch.Generator().manual_seed(SEED)
    for st in range(2500):
        s0 = torch.randint(0, len(data) - CTX - 1, (32,), generator=g)
        xb = torch.stack([data[s:s + CTX] for s in s0])
        yb = torch.stack([data[s + 1:s + CTX + 1] for s in s0])
        loss = Fn.cross_entropy(model(xb).reshape(-1, len(vocab)), yb.reshape(-1))
        opt.zero_grad()
        loss.backward()
        opt.step()
        if st % 500 == 0 or st == 2499:
            print(f'  step {st} loss {loss.item():.4f}')
    model.eval()
    # the 4 bricks of L40 inside their real left context (CTX words ending at "need")
    l40 = [k for k, w in enumerate(W) if w[0] == 40]
    end = l40[-1] + 1
    lo = end - CTX
    with torch.no_grad():
        _, s, _ = model.scores(data[lo:end][None])
    s = s[0].numpy()                                 # H x T x T
    bi = [k - lo for k in l40]                       # brick positions inside the window
    sub = s[:, bi][:, :, bi]                         # H x 4 x 4 raw scores among the bricks
    tri = np.triu(np.ones((4, 4), bool), 1)

    def softmax(x, mask=None):
        x = x.copy()
        if mask is not None:
            x[mask] = -np.inf
        x = x - x.max(-1, keepdims=True)
        e = np.exp(x)
        return e / e.sum(-1, keepdims=True)
    full = np.stack([softmax(sub[h]) for h in range(H)])
    causal = np.stack([softmax(sub[h], tri) for h in range(H)])
    # display head: the strongest diagonal (min over queries of self-weight minus the best other weight)
    margin = []
    for h in range(H):
        F_ = full[h]
        margin.append(min(F_[i, i] - max(F_[i, j] for j in range(4) if j != i) for i in range(4)))
    hd = int(np.argmax(margin))
    print('  diagonal margins per head', np.round(margin, 3), '-> display head', hd)
    print('  full (display head)\n', np.round(full[hd], 3))
    print('  causal (display head)\n', np.round(causal[hd], 3))
    # also the full in-context causal attention of each brick over its whole left context (what the LM really reads)
    ctx_att = []
    for h in range(H):
        A = softmax(s[h], np.triu(np.ones((CTX, CTX), bool), 1))
        ctx_att.append(A[bi])                        # 4 x CTX
    save_json('attn_lyrics.json', {
        'what': 'one-layer causal attention LM (8 heads, d 64) trained on the song\'s words; weights among the 4 bricks of L40',
        'bricks': [W[k][2].upper().rstrip(',') for k in l40], 'brick_word_index': [W[k][1] for k in l40], 'line': 40,
        'seed': SEED, 'vocab': len(vocab), 'final_loss': loss.item(),
        'full': full, 'causal': causal, 'full_mean': full.mean(0), 'causal_mean': causal.mean(0),
        'display': 'mean', 'sharpest_diagonal_head': hd, 'diag_margin': margin,
        'self_brightest': [bool(full.mean(0)[i].argmax() == i) for i in range(4)],
        'brightest_key': [int(full.mean(0)[i].argmax()) for i in range(4)],
        'context_words': words[lo:end], 'context_attention': np.stack(ctx_att),
        'note': 'rows = query brick (the sung one), cols = key brick. full = before the causal wedge (unmasked softmax of '
                'the trained scores among the 4 bricks); causal = after it (upper triangle −∞, row renormalised).',
    })


if __name__ == '__main__':
    main()
