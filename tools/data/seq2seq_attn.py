"""Encoder-decoder with additive (Bahdanau) attention trained on sequence reversal: the real α that forms the anti-diagonal.

  tools/.venv/bin/python tools/data/seq2seq_attn.py      -> app/public/data/seq2seq_attn.json

Model: word embedding 32 over the song's word types, bidirectional GRU encoder (2 x 64), GRU decoder 128, additive
attention e_tj = vᵀ tanh(W s_{t-1} + U h_j), α = softmax_j(e), trained to output the input reversed (random 12-word
sequences from the song vocabulary, Adam, seed 21, CPU). The shown example is 12 sung words: L20 + the first 4 of L21,
"seq2seq would squeeze a sentence through a bottleneck attention let the decoder".

Consumers: verse2 78.447-81.20: 12 telescoping light arms from the decoder reach back to the encoder bricks,
brightness = α (anti-diagonal); LOOK / BACK; double-check lamps.
"""
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

from _common import lyric_words, save_json, torch_seed

SEED = 21
L = 12


class S2S(nn.Module):
    def __init__(self, V):
        super().__init__()
        self.V = V
        self.emb = nn.Embedding(V + 1, 32)              # V = BOS
        self.enc = nn.GRU(32, 64, batch_first=True, bidirectional=True)
        self.dec = nn.GRUCell(32 + 128, 128)
        self.Wa = nn.Linear(128, 64, bias=False)
        self.Ua = nn.Linear(128, 64)
        self.va = nn.Linear(64, 1, bias=False)
        self.init = nn.Linear(128, 128)
        self.out = nn.Linear(128 + 128, V)

    def forward(self, src, tgt_in):
        Hs, _ = self.enc(self.emb(src))                 # B x L x 128
        s = torch.tanh(self.init(Hs[:, 0]))
        UH = self.Ua(Hs)
        logits, alphas = [], []
        for t in range(tgt_in.shape[1]):
            e = self.va(torch.tanh(self.Wa(s)[:, None] + UH)).squeeze(-1)
            a = e.softmax(-1)
            ctx = (a[:, :, None] * Hs).sum(1)
            s = self.dec(torch.cat([self.emb(tgt_in[:, t]), ctx], -1), s)
            logits.append(self.out(torch.cat([s, ctx], -1)))
            alphas.append(a)
        return torch.stack(logits, 1), torch.stack(alphas, 1)


def main():
    torch_seed(SEED)
    W = lyric_words()
    vocab = sorted({w[3] for w in W})
    V = len(vocab)
    wid = {w: i for i, w in enumerate(vocab)}
    m = S2S(V)
    opt = torch.optim.Adam(m.parameters(), lr=2e-3)
    g = torch.Generator().manual_seed(SEED)

    def batch(n):
        src = torch.randint(0, V, (n, L), generator=g)
        tgt = src.flip(1)
        tin = torch.cat([torch.full((n, 1), V), tgt[:, :-1]], 1)
        return src, tin, tgt
    for st in range(4000):
        src, tin, tgt = batch(64)
        lg, _ = m(src, tin)
        loss = Fn.cross_entropy(lg.reshape(-1, V), tgt.reshape(-1))
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
        opt.step()
        if st % 500 == 0 or st == 3999:
            print(f'  step {st} loss {loss.item():.4f}', flush=True)
    m.eval()
    with torch.no_grad():
        src, tin, tgt = batch(1000)
        # greedy decoding for the accuracy
        Hs_lg, _ = m(src, tin)
        acc_tf = float((Hs_lg.argmax(-1) == tgt).float().mean())
    ex_words = [w[3] for w in W if w[0] == 20] + [w[3] for w in W if w[0] == 21][:4]
    ex_raw = [w[2] for w in W if w[0] == 20] + [w[2] for w in W if w[0] == 21][:4]
    assert len(ex_words) == L
    src = torch.tensor([[wid[w] for w in ex_words]])
    with torch.no_grad():
        out, prev = [], torch.tensor([[V]])
        tin = torch.full((1, 1), V)
        for t in range(L):
            lg, al = m(src, tin)
            nxt = lg[0, -1].argmax()
            tin = torch.cat([tin, nxt.view(1, 1)], 1)
        lg, al = m(src, tin[:, :L])
    alpha = al[0].numpy()                                # decoder step t x encoder position j
    pred = [vocab[i] for i in lg[0].argmax(-1).tolist()]
    anti = float(np.mean([alpha[t, L - 1 - t] for t in range(L)]))
    print('  teacher-forced acc', round(acc_tf, 4), ' example ok', pred == ex_words[::-1], ' mean anti-diagonal α', round(anti, 3))
    print('  ', pred)
    save_json('seq2seq_attn.json', {
        'what': 'GRU encoder-decoder with additive attention trained on 12-word sequence reversal (song vocabulary)',
        'seed': SEED, 'vocab': V, 'length': L, 'acc_random_sequences': acc_tf,
        'example': {'input': ex_words, 'input_sung': ex_raw, 'output': pred, 'correct': pred == ex_words[::-1]},
        'alpha': alpha, 'anti_diagonal_mean': anti,
        'note': 'alpha[t][j]: decoder step t attends to encoder brick j; reversal => peak at j = 11 - t (anti-diagonal)',
    }, sig=5)


if __name__ == '__main__':
    main()
