"""A small Transformer trained on this song's own BPE stream: real attention maps (6 layers x 8 heads) and a real
512-d representation of GONE.

  tools/.venv/bin/python tools/data/tiny_tf.py      -> app/public/data/tiny_tf.json
                                                       tools/data/tiny_tf/{model.pt, acts.npz} (for norms / moe / flash)

Model: decoder-only (causal) Transformer with the base shape N = 6, h = 8, d_model = 512, d_ff = 2048, post-LN
"Add & Norm" as in the 2017 base, sinusoidal positions, tied input/output embedding, vocab 272 (data/bpe.json), context 64.
≈ 19M parameters (the 65M of the 2017 base is mostly its 37k-token embedding). Trained as a next-token LM on the
1,065-token song (AdamW, 1,200 steps, seed 65, CPU) until it has memorised it.

Exports
  * maps: softmax attention of every layer/head on the 32-token window that ends with "gone" (L31), uint8 = round(255 p),
    rows = query, cols = key, lower-triangular (causal). Plus per-head stats (mean distance, previous-token / self /
    first-token mass) so a scene can pick panels.
  * gone: the final-layer hidden state (512) at the last token of "gone" ('one', index 496), and the input embeddings of
    'Ġg' and 'one'. drop1 116.24: GONE melts into its 512-d embedding (512 bars).
  * The engraving for the drop1 base: `N = 6 · h = 8 · d_model = 512 · d_ff = 2048 · ≈ 65M PARAMS` describes the 2017 base,
    which this model copies in shape (not in vocabulary size).

Consumers: drop1 (112.335-119.641) head panels + 8 chops; 116.24 GONE -> 512 bars; norms.py / moe_router.py / flash_tiles.py
read tools/data/tiny_tf/acts.npz.
"""
import math

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as Fn

from _common import TDATA, b64, bpe_tokens, find_token_span, save_json, torch_seed

SEED = 65
D, H, N, DFF, CTX = 512, 8, 6, 2048, 64
OUT = TDATA / 'tiny_tf'


def sinusoid(n, d):
    pos = np.arange(n)[:, None]
    i = np.arange(d // 2)[None, :]
    ang = pos / (10000 ** (2 * i / d))
    pe = np.zeros((n, d))
    pe[:, 0::2] = np.sin(ang)
    pe[:, 1::2] = np.cos(ang)
    return torch.tensor(pe, dtype=torch.float32)


class Block(nn.Module):
    def __init__(self):
        super().__init__()
        self.qkv = nn.Linear(D, 3 * D)
        self.proj = nn.Linear(D, D)
        self.ln1 = nn.LayerNorm(D)
        self.ff1 = nn.Linear(D, DFF)
        self.ff2 = nn.Linear(DFF, D)
        self.ln2 = nn.LayerNorm(D)
        self.drop = nn.Dropout(0.1)

    def forward(self, x, keep=None):
        B, T, _ = x.shape
        q, k, v = self.qkv(x).view(B, T, 3, H, D // H).permute(2, 0, 3, 1, 4)
        s = q @ k.transpose(-1, -2) / math.sqrt(D // H)
        s = s.masked_fill(torch.triu(torch.ones(T, T, dtype=torch.bool), 1), float('-inf'))
        a = s.softmax(-1)
        if keep is not None:
            keep.append({'pre': x.detach(), 'q': q.detach(), 'k': k.detach(), 'v': v.detach(), 'att': a.detach()})
        o = (self.drop(a) @ v).transpose(1, 2).reshape(B, T, D)
        x = self.ln1(x + self.drop(self.proj(o)))                 # Add & Norm
        x = self.ln2(x + self.drop(self.ff2(Fn.relu(self.ff1(x)))))  # FFN 512 -> 2048 -> 512, Add & Norm
        return x


class TinyTF(nn.Module):
    def __init__(self, V):
        super().__init__()
        self.emb = nn.Embedding(V, D)
        nn.init.normal_(self.emb.weight, 0, D ** -0.5)
        self.register_buffer('pe', sinusoid(CTX, D))
        self.blocks = nn.ModuleList([Block() for _ in range(N)])

    def forward(self, idx, keep=None):
        x = self.emb(idx) * math.sqrt(D) + self.pe[:idx.shape[1]]
        for b in self.blocks:
            x = b(x, keep)
        return x @ self.emb.weight.T, x


def main():
    torch_seed(SEED)
    toks, ids, vocab = bpe_tokens()
    V = len(vocab)
    data = torch.tensor(ids)
    model = TinyTF(V)
    nparam = sum(p.numel() for p in model.parameters())
    print('  params', nparam)
    opt = torch.optim.AdamW(model.parameters(), lr=3e-4, betas=(0.9, 0.98), weight_decay=0.01)
    steps, bs = 1200, 16
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-4, total_steps=steps, pct_start=0.1)
    g = torch.Generator().manual_seed(SEED)
    losses = []
    model.train()
    for st in range(steps):
        start = torch.randint(0, len(data) - CTX - 1, (bs,), generator=g)
        xb = torch.stack([data[s:s + CTX] for s in start])
        yb = torch.stack([data[s + 1:s + CTX + 1] for s in start])
        logits, _ = model(xb)
        loss = Fn.cross_entropy(logits.reshape(-1, V), yb.reshape(-1))
        opt.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        opt.step()
        sched.step()
        if st % 50 == 0 or st == steps - 1:
            losses.append([st, loss.item()])
            print(f'  step {st:4d} loss {loss.item():.4f}', flush=True)
    model.eval()
    # whole-song next-token accuracy with sliding 64-token context
    with torch.no_grad():
        correct, tot = 0, 0
        for s in range(0, len(data) - 1, CTX):
            e = min(s + CTX, len(data) - 1)
            lo = max(0, e - CTX)
            lg, _ = model(data[lo:e][None])
            pred = lg[0].argmax(-1)
            tgt = data[lo + 1:e + 1]
            k0 = s - lo
            correct += int((pred[k0:] == tgt[k0:]).sum())
            tot += len(tgt[k0:])
    acc = correct / tot
    print('  next-token accuracy on the song', round(acc, 4))

    # window ending at "gone"
    a, b = find_token_span(toks, 'recurrence gone')
    end = b                       # exclusive, last token = 'one'
    W = 32
    lo = end - W
    keep = []
    with torch.no_grad():
        _, hid = model(data[lo:end][None], keep)
    att = np.stack([k['att'][0].numpy() for k in keep])     # N x H x W x W
    gone_vec = hid[0, -1].numpy()
    emb = model.emb.weight.detach().numpy()
    stats = []
    qi = np.arange(W)[:, None]
    ki = np.arange(W)[None, :]
    for l in range(N):
        for h in range(H):
            A = att[l, h]
            stats.append({'layer': l, 'head': h,
                          'mean_dist': float((A * (qi - ki)).sum(1).mean()),
                          'self': float(np.diag(A).mean()),
                          'prev': float(np.mean([A[i, i - 1] for i in range(1, W)])),
                          'first': float(A[:, 0].mean()),
                          'entropy': float(-(A * np.log(A + 1e-12)).sum(1).mean())})
    # activations for the other scripts: the full song in 64-token chunks is not needed; save the windows they use
    acts = {}
    for name, text in [('layernorm', 'LayerNorm'), ('experts', 'only some experts awake'), ('flash', 'FlashAttention tiles it all inside the SRAM')]:
        a2, b2 = find_token_span(toks, text)
        e2 = min(len(data), max(b2, 64))
        lo2 = e2 - 64
        kp = []
        with torch.no_grad():
            _, hd = model(data[lo2:e2][None], kp)
        acts[f'{name}_span'] = np.array([a2 - lo2, b2 - lo2])
        acts[f'{name}_pre0'] = kp[0]['pre'][0].numpy()        # input to layer 0 (emb*sqrt(d) + PE), 64 x 512
        acts[f'{name}_pre3'] = kp[3]['pre'][0].numpy()        # residual stream entering layer 3
        acts[f'{name}_hid'] = hd[0].numpy()                  # final hidden, 64 x 512
        acts[f'{name}_q0'] = kp[0]['q'][0].numpy()           # layer 0: H x 64 x 64
        acts[f'{name}_k0'] = kp[0]['k'][0].numpy()
        acts[f'{name}_v0'] = kp[0]['v'][0].numpy()
        acts[f'{name}_tok'] = data[lo2:e2].numpy()
    OUT.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(OUT / 'acts.npz', **acts)
    torch.save({'state': model.state_dict(), 'vocab': vocab}, OUT / 'model.pt')
    win_toks = toks[lo:end]
    u8 = np.clip(np.round(att * 255), 0, 255).astype(np.uint8)
    save_json('tiny_tf.json', {
        'what': 'decoder-only Transformer (N=6, h=8, d_model=512, d_ff=2048, post-LN) trained on this song\'s BPE stream',
        'params': nparam, 'vocab': V, 'context': CTX, 'steps': steps, 'seed': SEED,
        'loss_curve': losses, 'song_next_token_acc': acc,
        'engraving': 'N = 6 · h = 8 · d_model = 512 · d_ff = 2048 · ≈ 65M PARAMS',
        'engraving_note': '65M is the original base model (37k-token vocabulary); this film model has the same N/h/d_model/d_ff and '
                          f'{nparam / 1e6:.1f}M parameters with its 272-token vocabulary',
        'window': {'tokens': win_toks, 'start': lo, 'end': end, 'text': ''.join(win_toks).replace('Ġ', ' ').replace('Ċ', ' / ')},
        'maps': {'shape': [N, H, W, W], 'encoding': 'uint8 round(255 p), [layer][head][query][key], base64', 'u8': b64(u8, np.uint8)},
        'head_stats': stats,
        'gone': {'tokens': ['Ġg', 'one'], 'index': [end - 2, end - 1], 'hidden': gone_vec,
                 'emb_g': emb[vocab.index('Ġg')], 'emb_one': emb[vocab.index('one')],
                 'note': 'hidden = final-layer state at the last token of "gone" (LayerNorm output: mean 0, var 1 over 512)'},
    })


if __name__ == '__main__':
    main()
