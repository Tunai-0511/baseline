"""A tanh RNN on the song's BPE stream: the real 8-d hidden state the cart carries, and backprop-through-time gradient
norms that vanish (spectral radius < 1) or explode (> 1, chaotic regime).

  tools/.venv/bin/python tools/data/rnn_bptt.py      -> app/public/data/rnn_bptt.json

Part A — `state`: h_t = tanh(W h_{t-1} + U x_t + b), 8 hidden units, x_t = learned 16-d token embedding, trained as a
next-token LM on the song (Adam, truncated BPTT 32, seed 17). Exported: h_t for every one of the 1,065 tokens
(the cart's LED bar graph shows h at the token being sung), with the token list.

Part B — `bptt`: the same recurrence with 64 hidden units, W = g · N(0, 1/64) (spectral radius ≈ g), U fixed, driven by
64 real tokens of verse2 (from L16). Loss L = ½‖h_64 − h*‖² for a fixed target; ‖∂L/∂h_t‖ by exact backprop for
t = 64 … 1 (the 64 steps of the straightened loop). Two gains: g = 0.8 (vanish) and g = 3.0 (explode). The clipped
version (global norm ≤ 1, Pascanu et al.) is included for the explode case.

Consumers: verse2 64.68-66.88 (hidden-state cart, LED bars = real 8-d h), 67.885 loop -> line t = 1…64,
69.48-71.11 manometers + oscilloscope: the two real log10‖∂L/∂h_t‖ curves; VANISH needles to 0, EXPLODE pegs.
"""
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

from _common import bpe_tokens, find_token_span, save_json, torch_seed

SEED = 17


class RNN(nn.Module):
    def __init__(self, V, E=16, Hd=8):
        super().__init__()
        self.emb = nn.Embedding(V, E)
        self.U = nn.Linear(E, Hd)
        self.W = nn.Linear(Hd, Hd, bias=False)
        self.out = nn.Linear(Hd, V)
        self.Hd = Hd

    def forward(self, idx, h):
        hs = []
        x = self.emb(idx)
        for t in range(idx.shape[1]):
            h = torch.tanh(self.W(h) + self.U(x[:, t]))
            hs.append(h)
        hs = torch.stack(hs, 1)
        return self.out(hs), hs, h


def bptt(g, x, seed, T=64, n=64, clip=None):
    rng = np.random.default_rng(seed)
    W = torch.tensor(rng.normal(0, 1 / np.sqrt(n), (n, n)) * g, dtype=torch.float64)
    U = torch.tensor(rng.normal(0, 1 / np.sqrt(x.shape[1]), (n, x.shape[1])), dtype=torch.float64)
    target = torch.tensor(rng.normal(0, 0.5, n), dtype=torch.float64)
    rho = float(np.abs(np.linalg.eigvals(W.numpy())).max())
    h = torch.zeros(n, dtype=torch.float64, requires_grad=True)
    hs = []
    for t in range(T):
        h = torch.tanh(W @ h + U @ x[t])
        h.retain_grad()
        hs.append(h)
    L = 0.5 * ((h - target) ** 2).sum()
    L.backward()
    norms = [float(hh.grad.norm()) for hh in hs]          # t = 1..T
    sat = [float((hh.detach().abs() > 0.95).float().mean()) for hh in hs]
    out = {'gain': g, 'spectral_radius': rho, 'grad_norm': norms, 'log10': [float(np.log10(v)) for v in norms],
           'ratio_first_last': norms[0] / norms[-1], 'saturated_frac': sat,
           'h_rms': [float(hh.detach().pow(2).mean().sqrt()) for hh in hs]}
    if clip is not None:
        out['clipped'] = [min(v, clip) for v in norms]
        out['clip_threshold'] = clip
    return out


def main():
    torch_seed(SEED)
    toks, ids, vocab = bpe_tokens()
    V = len(vocab)
    data = torch.tensor(ids)
    m = RNN(V)
    opt = torch.optim.Adam(m.parameters(), lr=1e-2)
    g = torch.Generator().manual_seed(SEED)
    for ep in range(60):
        h = torch.zeros(1, m.Hd)
        tot = 0.0
        for s in range(0, len(data) - 33, 32):
            xb = data[s:s + 32][None]
            yb = data[s + 1:s + 33][None]
            lg, _, h = m(xb, h.detach())
            loss = Fn.cross_entropy(lg[0], yb[0])
            opt.zero_grad()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(m.parameters(), 1.0)
            opt.step()
            tot += loss.item()
        if ep % 10 == 0 or ep == 59:
            print(f'  epoch {ep} loss {tot / ((len(data) - 33) // 32 + 1):.3f}')
    m.eval()
    with torch.no_grad():
        lg, hs, _ = m(data[None], torch.zeros(1, m.Hd))
    H = hs[0].numpy()
    acc = float((lg[0, :-1].argmax(-1) == data[1:]).float().mean())
    a, b = find_token_span(toks, 'RNN kept a hidden state and carried it inside')
    a16, _ = find_token_span(toks, 'N-gram counting')
    emb = m.emb.weight.detach().double()
    x = emb[data[a16:a16 + 64]]
    vanish = bptt(0.8, x, 101)
    explode = bptt(3.0, x, 101, clip=1.0)
    print('  vanish rho %.3f  |g_1|/|g_64| = %.3g' % (vanish['spectral_radius'], vanish['ratio_first_last']))
    print('  explode rho %.3f |g_1|/|g_64| = %.3g' % (explode['spectral_radius'], explode['ratio_first_last']))
    assert vanish['ratio_first_last'] < 1e-3 and explode['ratio_first_last'] > 1e3
    save_json('rnn_bptt.json', {
        'what': 'tanh RNN on the song BPE: 8-d hidden state (cart LEDs) and BPTT gradient norms at two spectral radii',
        'state': {'hidden': 8, 'emb': 16, 'seed': SEED, 'next_token_acc': acc,
                  'tokens': toks, 'h': np.round(H, 4),
                  'L17_span': [a, b], 'L17_tokens': toks[a:b], 'L17_h': np.round(H[a:b], 4),
                  'note': 'h[i] = state after reading token i (row-major, 1065 x 8, in [-1, 1])'},
        'bptt': {'T': 64, 'n': 64, 'input_tokens': toks[a16:a16 + 64], 'loss': '0.5 * |h_64 - h*|^2',
                 'vanish': vanish, 'explode': explode,
                 'note': 'grad_norm[t-1] = |dL/dh_t|, t = 1..64 (t = 64 is next to the loss); log10 for the oscilloscope'},
    }, sig=6)


if __name__ == '__main__':
    main()
