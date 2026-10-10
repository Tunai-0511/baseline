#!/usr/bin/env python3
"""Contact sheet of PNG stills: tools/.venv/bin/python tools/qa/sheet.py <dir> <out.png> [cols] [width]"""
import sys, glob, os
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
cw = int(sys.argv[4]) if len(sys.argv) > 4 else 640
files = sorted(glob.glob(os.path.join(d, 'f_*.png')))
ims = [Image.open(f).convert('RGB') for f in files]
ch = int(cw * 9 / 16)
rows = (len(ims) + cols - 1) // cols
S = Image.new('RGB', (cols * cw + (cols - 1) * 4, rows * (ch + 18)), (30, 30, 30))
dr = ImageDraw.Draw(S)
for i, (f, im) in enumerate(zip(files, ims)):
    x, y = (i % cols) * (cw + 4), (i // cols) * (ch + 18)
    S.paste(im.resize((cw, ch), Image.LANCZOS), (x, y + 18))
    dr.text((x + 4, y + 3), os.path.basename(f)[2:-4] + 's', fill=(220, 220, 220))
S.save(out)
print(out, S.size)
