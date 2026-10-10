"""Check a spliced master against the original (tools/video/splice.sh): every packet's timestamps, the packets
outside [K1, K2) the original's own, and the decoded frames on both sides of each splice point bit-identical to the
original's (60 fps).
   python3 check_splice.py <orig.mp4> <new.mp4> <K1> <K2> <workdir> [<segment.mp4>]"""
import subprocess, sys

orig, new, K1, K2, W = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]


def packets(f):
    o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts,dts,size,flags',
                        '-of', 'csv=p=0', f], capture_output=True, text=True, check=True).stdout
    return [l.split(',') for l in o.split('\n') if l.strip()]


po, pn = packets(orig), packets(new)
print('packets', len(po), len(pn))
assert len(po) == len(pn), 'frame count differs'
pts = sorted(int(r[0]) for r in pn)
bo, bn = min(int(r[0]) for r in po), pts[0]
print('first pts: orig', bo, 'new', bn)
step = pts[1] - pts[0]
assert [p - bn for p in pts] == [i * step for i in range(len(pts))], 'display timestamps are not exactly 0..N-1 frames'
dts = [int(r[1]) for r in pn]
assert all(b > a for a, b in zip(dts, dts[1:])), 'decode timestamps not strictly increasing'
# outside [K1, K2) the bitstream must be the original's, packet for packet (decode order == display order at IDRs)
same = sum(1 for i in range(len(po)) if (i < K1 or i >= K2) and po[i][2] == pn[i][2] and int(po[i][0]) - bo == int(pn[i][0]) - bn)
print('packets outside the splice identical (pts, size):', same, 'of', len(po) - (K2 - K1))
assert same == len(po) - (K2 - K1)
print('keyframes at the splice points:', pn[K1][3], pn[K2][3])
assert 'K' in pn[K1][3] and 'K' in pn[K2][3]


def md5s(f, a, b, fps=60):
    # decode display frames [a, b) and hash each (seek half a frame early: the first frame out is frame a)
    o = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{(a - 0.5) / fps:.6f}', '-i', f, '-map', '0:v:0', '-frames:v', str(b - a),
                        '-vsync', 'passthrough', '-f', 'framemd5', '-'], capture_output=True, text=True, check=True).stdout
    return [l.split(',')[-1].strip() for l in o.split('\n') if l and not l.startswith('#')]


for a, b in [(K1 - 30, K1), (K2, K2 + 30)]:
    mo, mn = md5s(orig, a, b), md5s(new, a, b)
    print(f'decoded frames {a}..{b - 1}: {sum(x == y for x, y in zip(mo, mn))}/{len(mo)} identical')
    assert mo == mn and len(mo) == b - a
# the spliced run itself decodes to the segment's own frames (its first and last 30)
if len(sys.argv) > 6:
    seg = sys.argv[6]
    n = K2 - K1
    for a, b in [(0, 30), (n - 30, n)]:
        ms, mn = md5s(seg, a, b), md5s(new, K1 + a, K1 + b)
        print(f'segment frames {a}..{b - 1} = new {K1 + a}..{K1 + b - 1}: {sum(x == y for x, y in zip(ms, mn))}/{len(ms)} identical')
        assert ms == mn and len(ms) == b - a
print('OK')
