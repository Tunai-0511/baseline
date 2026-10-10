"""A small LSTM on the song's BPE stream: the real forget / input / output gate values at every step of the gate road.

  tools/.venv/bin/python tools/data/lstm_gates.py      -> app/public/data/lstm_gates.json

Model: embedding 16, one LSTM layer with 16 cells (forget-gate bias initialised to +1), linear readout; next-token LM on
the song (Adam, truncated BPTT 32, seed 19). The road: 64 steps = the 64 tokens that start at "LSTM put gates along
the road" (L19). For each step: f, i, o for all 16 cells, the cell state c, and per-step means. `display_cell` is the
cell whose three gates move the most along the road (largest summed std) — the one gantry plates follow.

Consumers: verse2 72.019-74.76 (gate road: one gantry per step with f / i / o hydraulic plates opening to the real gate
values; constant error carousel = cell state), plate `FORGET GATE · ADDED 2000`.
"""
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

from _common import bpe_tokens, find_token_span, save_json, torch_seed

SEED = 19
Hd = 16


class Net(nn.Module):
    def __init__(self, V):
        super().__init__()
        self.emb = nn.Embedding(V, 16)
        self.cell = nn.LSTMCell(16, Hd)
        with torch.no_grad():
            self.cell.bias_ih[Hd:2 * Hd].fill_(1.0)    # PyTorch gate order i, f, g, o: forget bias +1
            self.cell.bias_hh[Hd:2 * Hd].zero_()
        self.out = nn.Linear(Hd, V)

    def forward(self, idx, state, record=False):
        h, c = state
        x = self.emb(idx)
        hs, rec = [], []
        for t in range(idx.shape[1]):
            if record:
                gates = self.cell.weight_ih @ x[:, t].T + self.cell.bias_ih[:, None] + self.cell.weight_hh @ h.T + self.cell.bias_hh[:, None]
                gi, gf, gg, go = gates.T.chunk(4, 1)
                rec.append((torch.sigmoid(gf), torch.sigmoid(gi), torch.sigmoid(go)))
            h, c = self.cell(x[:, t], (h, c))
            hs.append(h)
            if record:
                rec[-1] = rec[-1] + (c,)
        return self.out(torch.stack(hs, 1)), (h, c), rec


def main():
    torch_seed(SEED)
    toks, ids, vocab = bpe_tokens()
    V = len(vocab)
    data = torch.tensor(ids)
    m = Net(V)
    opt = torch.optim.Adam(m.parameters(), lr=1e-2)
    for ep in range(60):
        st = (torch.zeros(1, Hd), torch.zeros(1, Hd))
        tot, nb = 0.0, 0
        for s in range(0, len(data) - 33, 32):
            lg, st, _ = m(data[s:s + 32][None], (st[0].detach(), st[1].detach()))
            loss = Fn.cross_entropy(lg[0], data[s + 1:s + 33])
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step()
            tot += loss.item()
            nb += 1
        if ep % 10 == 0 or ep == 59:
            print(f'  epoch {ep} loss {tot / nb:.3f}')
    m.eval()
    a, _ = find_token_span(toks, 'LSTM put gates along the road')
    with torch.no_grad():
        lg, _, _ = m(data[None], (torch.zeros(1, Hd), torch.zeros(1, Hd)))
        acc = float((lg[0, :-1].argmax(-1) == data[1:]).float().mean())
        # warm the state on everything before the road, then record the 64 road steps
        _, st, _ = m(data[:a][None], (torch.zeros(1, Hd), torch.zeros(1, Hd)))
        _, _, rec = m(data[a:a + 64][None], st, record=True)
    f = np.stack([r[0][0].numpy() for r in rec])     # 64 x 16
    i = np.stack([r[1][0].numpy() for r in rec])
    o = np.stack([r[2][0].numpy() for r in rec])
    c = np.stack([r[3][0].numpy() for r in rec])
    score = f.std(0) + i.std(0) + o.std(0)
    dc = int(score.argmax())
    print('  display cell', dc, 'f', np.round(f[:12, dc], 2), '\n  i', np.round(i[:12, dc], 2), '\n  o', np.round(o[:12, dc], 2))
    save_json('lstm_gates.json', {
        'what': 'LSTM (16 cells) next-token LM on the song BPE; gate values along the 64-step road from L19',
        'seed': SEED, 'next_token_acc': acc, 'forget_bias_init': 1.0,
        'tokens': toks[a:a + 64], 'start_token': a,
        'f': np.round(f, 4), 'i': np.round(i, 4), 'o': np.round(o, 4), 'c': np.round(c, 4),
        'mean': {'f': f.mean(1), 'i': i.mean(1), 'o': o.mean(1)},
        'display_cell': dc,
        'display': {'f': f[:, dc], 'i': i[:, dc], 'o': o[:, dc], 'c': c[:, dc]},
        'note': 'f/i/o in (0, 1): 0 = plate closed, 1 = open; rows = road step (token), cols = cell',
    }, sig=5)


if __name__ == '__main__':
    main()
