"""LayerNorm vs RMSNorm on a real 16-d activation bundle, plus the activation curves of the FFN cartridges
(ReLU, Swish/SiLU, SwiGLU) with the exact Swish minimum.

  tools/.venv/bin/python tools/data/norms.py      -> app/public/data/norms.json

Bundle: 16 consecutive dimensions of the film Transformer's residual input (tools/data/tiny_tf/acts.npz, layer-0 input =
token embedding · √512 + sinusoidal position) at the token 'L' of "LayerNorm" (L35). The 16-dim slice is the one of the
32 aligned slices whose own mean is largest relative to its spread (so the centring step is visible) — chosen by that
rule, not by hand. The gain g and bias b are the trained layer-0 Add & Norm (ln1) parameters of those 16 dims.
LayerNorm(x) = (x − μ) / √(σ² + ε) · g + b ; RMSNorm(x) = x / √(mean(x²) + ε) · g  (no centring, no bias), ε = 1e-5,
statistics over the 16 shown dims.
Swish(x) = x σ(x): minimum solved by Newton on 1 + x(1 − σ(x)) = 0 -> x* ≈ −1.27846, Swish(x*) ≈ −0.27846.

Consumers: verse3 S2 130.10-131.05 (centring frame drops; bars only scale; `x / √(mean(x²) + ε) · g`),
131.70-132.92 cartridges (ReLU out, SwiGLU in; `SWISH MIN ≈ −0.278 @ x ≈ −1.278`).
"""
import numpy as np
import torch

from _common import TDATA, save_json


def sig(x):
    return 1 / (1 + np.exp(-x))


def main():
    a = np.load(TDATA / 'tiny_tf' / 'acts.npz')
    st = torch.load(TDATA / 'tiny_tf' / 'model.pt', map_location='cpu')['state']
    span = a['layernorm_span']
    v = a['layernorm_pre0'][span[0]]                      # 512, the 'L' token
    best, bi = -1, 0
    for s in range(0, 512, 16):
        x = v[s:s + 16]
        r = abs(x.mean()) / (x.std() + 1e-9)
        if r > best:
            best, bi = r, s
    x = v[bi:bi + 16].astype(np.float64)
    g = st['blocks.0.ln1.weight'].numpy()[bi:bi + 16].astype(np.float64)
    b = st['blocks.0.ln1.bias'].numpy()[bi:bi + 16].astype(np.float64)
    eps = 1e-5
    mu, var = x.mean(), x.var()
    centred = x - mu
    ln_unit = centred / np.sqrt(var + eps)
    ln = ln_unit * g + b
    rms = np.sqrt((x ** 2).mean() + eps)
    rn_unit = x / rms
    rn = rn_unit * g
    print(f'  slice {bi}:{bi + 16}  mean {mu:.4f}  std {np.sqrt(var):.4f}  rms {rms:.4f}  |mean|/std {best:.3f}')
    # Swish minimum
    z = -1.2
    for _ in range(50):
        f = 1 + z * (1 - sig(z))
        df = (1 - sig(z)) - z * sig(z) * (1 - sig(z))
        z -= f / df
    smin = z * sig(z)
    print(f'  Swish min x* = {z:.8f}, value = {smin:.8f}')
    assert abs(z + 1.27846) < 1e-4 and abs(smin + 0.27846) < 1e-4
    xs = np.linspace(-6, 4, 201)
    save_json('norms.json', {
        'what': 'LayerNorm vs RMSNorm on 16 real residual dims of the film Transformer; FFN activation curves',
        'source': f'tiny_tf layer-0 input at the token "L" of LayerNorm, dims {bi}..{bi + 15}',
        'x': x, 'mu': mu, 'sigma': float(np.sqrt(var)), 'rms': rms, 'eps': eps, 'g': g, 'b': b,
        'layernorm': {'centred': centred, 'unit': ln_unit, 'out': ln},
        'rmsnorm': {'unit': rn_unit, 'out': rn},
        'formulas': {'layernorm': '(x − μ) / √(σ² + ε) · g + b', 'rmsnorm': 'x / √(mean(x²) + ε) · g'},
        'swish': {'x_min': z, 'y_min': smin, 'engraving': 'SWISH MIN ≈ −0.278 @ x ≈ −1.278'},
        'curves': {'x': xs, 'relu': np.maximum(0, xs), 'swish': xs * sig(xs), 'sigmoid': sig(xs)},
        'swiglu': 'SwiGLU(x) = Swish(xW) ⊙ xV',
    }, sig=6)


if __name__ == '__main__':
    main()
