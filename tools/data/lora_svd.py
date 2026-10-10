"""LoRA arithmetic and the rank-8 texture of the patch: the sung line's glyph image reconstructed from its top 8
singular vectors (a real low-rank approximation, used as background texture only — it carries no lyric).

  tools/.venv/bin/python tools/data/lora_svd.py      -> app/public/data/lora_svd.json (+ lora_rank8.png)

Image: "A LOW-RANK LITTLE PATCH" in Archivo w1000/700, 64 px tall (ink = 1). SVD G = U Σ Vᵀ; rank r reconstruction
G_r = Σ_{k<r} σ_k u_k v_kᵀ. Exported: σ (all), the energy fraction per rank, and factors A = U_8 Σ_8^{1/2} (H x 8),
B = V_8 Σ_8^{1/2} (W x 8) so a shader can rebuild any rank ≤ 8 (sum the first r columns of A·Bᵀ).
LoRA count: ΔW = BA with B ∈ R^{d x r}, A ∈ R^{r x d}, B₀ = 0 (ΔW starts at exactly zero: the patch has thickness 0).
d = 4096, r = 8: 2dr = 65,536 trainable of d² = 16,777,216 -> 0.390625 % (ledger: 0.39 %).

Consumers: verse3 S4 142.14-144.18 (`TO LORA`; the patch grows from thickness 0; its surface = this rank-8 texture;
plate `d = 4096 · r = 8 · 0.39% TRAINABLE · B₀ = 0`).
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from _common import PUB, ROOT, WIP, save_json

TEXT = 'A LOW-RANK LITTLE PATCH'
FONT = ROOT / 'app' / 'public' / 'fonts' / 'Archivo-w1000-700.ttf'
R = 8


def main():
    f = ImageFont.truetype(str(FONT), 64)
    bb = f.getbbox(TEXT)
    W, H = bb[2] - bb[0] + 16, 64
    im = Image.new('L', (W, H), 0)
    asc = -f.getbbox('H', anchor='ls')[1]
    ImageDraw.Draw(im).text((8 - bb[0], (H + asc) // 2), TEXT, font=f, fill=255, anchor='ls')
    G = np.asarray(im, np.float64) / 255
    U, s, Vt = np.linalg.svd(G, full_matrices=False)
    energy = np.cumsum(s ** 2) / (s ** 2).sum()
    Gr = (U[:, :R] * s[:R]) @ Vt[:R]
    A = U[:, :R] * np.sqrt(s[:R])
    Bf = Vt[:R].T * np.sqrt(s[:R])
    err = float(np.linalg.norm(G - Gr) / np.linalg.norm(G))
    print(f'  image {H}x{W}  rank-8 energy {energy[R - 1]:.4f}  rel. error {err:.4f}')
    d, r = 4096, 8
    frac = 2 * d * r / d ** 2
    assert 2 * d * r == 65536 and d * d == 16777216 and abs(frac * 100 - 0.390625) < 1e-12
    v = np.clip(Gr, 0, 1)
    Image.fromarray((v * 255).astype(np.uint8)).save(PUB / 'lora_rank8.png')
    sheet = np.concatenate([G, np.full((4, W), 0.15)] + sum([[np.clip((U[:, :k] * s[:k]) @ Vt[:k], 0, 1), np.full((4, W), 0.15)] for k in (1, 2, 4, 8, 16)], []), 0)
    Image.fromarray((sheet * 255).astype(np.uint8)).resize((W * 2, sheet.shape[0] * 2), Image.NEAREST).save(WIP / 'lora_svd_sheet.png')
    save_json('lora_svd.json', {
        'what': 'rank-8 SVD reconstruction of the glyph image of the sung line (texture), and the LoRA parameter count',
        'text': TEXT, 'image': [H, W], 'sigma': s, 'energy': energy, 'rank': R, 'rel_error_rank8': err,
        'A': A, 'B': Bf, 'texture_png': 'lora_rank8.png (rank-8 reconstruction clipped to 0..1)',
        'rebuild': 'G_r[y][x] = Σ_{k<r} A[y][k] B[x][k]',
        'lora': {'d': d, 'r': r, 'trainable': 2 * d * r, 'full': d * d, 'percent': frac * 100, 'B0': 0,
                 'plate': 'd = 4096 · r = 8 · 0.39% TRAINABLE · B₀ = 0'},
    }, sig=5)


if __name__ == '__main__':
    main()
