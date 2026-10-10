#!/bin/sh
# Splice a re-rendered run of frames [K1, K2) into the 4K master at its IDR frames; elsewhere the master's own
# packets, untouched. (Cutting the master into files first shifted their timestamps by the B-frame delay, so the
# concat list reads the master itself: out at the decode time of K1's IDR, back in at K2's, durations given;
# -auto_convert 0: the parameter sets match, so no SPS/PPS copied into every keyframe.)
#   sh splice.sh <master.mp4> <segment.mp4> <K1> <K2> <out.mp4> <workdir>
set -e
M="$1"; SEG="$2"; K1="$3"; K2="$4"; OUT="$5"; W="$6"
mkdir -p "$W"
xd() { ffprobe -v error -select_streams v:0 -show_streams -show_data "$1" | sed -n '/^extradata=/,/^DISPOSITION/p' | grep -v DISPOSITION; }
echo "== parameter sets (avcC) must match"
xd "$M" > "$W/xd-master.txt"; xd "$SEG" > "$W/xd-seg.txt"
if cmp -s "$W/xd-master.txt" "$W/xd-seg.txt"; then echo "identical"; else echo "DIFFERENT"; diff "$W/xd-master.txt" "$W/xd-seg.txt"; exit 1; fi
n=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of csv=p=0 "$SEG")
echo "== segment frames: $n (want $((K2 - K1)))"; [ "$n" -eq $((K2 - K1)) ]
echo "== the master's video alone (an audio packet past the out point would end the first part early)"
MV="$W/master-video.mp4"
ffmpeg -v error -y -i "$M" -map 0:v:0 -c copy "$MV"
echo "== concat list"
python3 - "$MV" "$SEG" "$K1" "$K2" > "$W/list.txt" <<'EOF'
import subprocess, sys
from fractions import Fraction as Fr
M, SEG, K1, K2 = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'packet=pts,dts,flags', '-of', 'csv=p=0', M],
                   capture_output=True, text=True, check=True).stdout
P = [l.split(',') for l in o.split('\n') if l.strip()]
m = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=time_base,r_frame_rate', '-of', 'default=nw=1', M],
                   capture_output=True, text=True, check=True).stdout
kv = dict(l.split('=', 1) for l in m.split('\n') if '=' in l)
tb, fps = Fr(kv['time_base']), Fr(kv['r_frame_rate'])
tick = 1 / (fps * tb)                   # time-base ticks per frame (256 at 60 fps in 1/15360)
assert tick.denominator == 1
for k in (K1, K2):
    assert 'K' in P[k][2] and int(P[k][0]) == k * tick, f'frame {k} is not an IDR at its own decode index'
us = lambda x: Fr(x) * 10**6
out_a = us(int(P[K1][1]) * tb)          # K1's IDR decode time: the master's packets stop there
in_c = us(int(P[K2][0]) * tb)           # K2's IDR: the master's packets start again there
d_a, d_b = us(K1 / fps), us((K2 - K1) / fps)
import math
f = lambda v: f'{v / 10**6:.6f}'
# (out: at or just before the IDR's decode time; in: at or just after its pts — both to the microsecond)
print(f"file '{M}'\noutpoint {f(math.floor(out_a))}\nduration {f(math.floor(d_a))}")
print(f"file '{SEG}'\nduration {f(round(d_b))}")
print(f"file '{M}'\ninpoint {f(math.ceil(in_c))}")
EOF
cat "$W/list.txt"
echo "== concat: master to K1, segment, master from K2; the master's audio"
ffmpeg -v error -y -f concat -safe 0 -auto_convert 0 -i "$W/list.txt" -i "$M" -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart "$OUT"
ffprobe -v error -show_entries format=duration,size:stream=codec_type,nb_frames,duration -of compact "$OUT"
