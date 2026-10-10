#!/usr/bin/env python3
"""Sheets of video frames: tools/qa/vsheet.py <dir of f_%04d.png> <t0 of frame 1> <fps> <out prefix> [per sheet] [cols]"""
import sys, glob, os
from PIL import Image, ImageDraw
d, t0, fps, pre = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]
per = int(sys.argv[5]) if len(sys.argv) > 5 else 30
cols = int(sys.argv[6]) if len(sys.argv) > 6 else 6
fs = sorted(glob.glob(os.path.join(d, 'f_*.png')))
for part in range(0, len(fs), per):
    sub = fs[part:part + per]
    w, h = Image.open(sub[0]).size
    rows = (len(sub) + cols - 1) // cols
    S = Image.new('RGB', (cols * w + (cols - 1) * 3, rows * (h + 14)), (30, 30, 30))
    dr = ImageDraw.Draw(S)
    for i, f in enumerate(sub):
        n = int(os.path.basename(f)[2:6]); t = t0 + (n - 1) / fps
        x, y = (i % cols) * (w + 3), (i // cols) * (h + 14)
        S.paste(Image.open(f), (x, y + 14)); dr.text((x + 3, y + 1), f"{t:.2f}", fill=(220, 220, 220))
    S.save(f'{pre}{part // per}.png')
    print(f'{pre}{part // per}.png')
