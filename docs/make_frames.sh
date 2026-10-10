#!/bin/sh
# docs/frames/: the whole film at one frame per second, 30 to a sheet (6 × 5), each with its time code.
#   sh docs/make_frames.sh out/Baseline-4K.mp4
set -e
IN="${1:-out/Baseline-4K.mp4}"
OUT="${2:-$(dirname "$0")/frames}"
mkdir -p "$OUT"
rm -f "$OUT"/sheet-*.jpg
ffmpeg -loglevel error -y -i "$IN" -vf "fps=1,scale=384:-2:flags=lanczos,drawbox=x=0:y=0:w=74:h=22:color=black@0.7:t=fill,drawtext=fontfile=/System/Library/Fonts/Menlo.ttc:text='%{pts\:hms}':x=5:y=4:fontsize=13:fontcolor=white,tile=6x5:padding=4:margin=4:color=0x222222" -q:v 4 "$OUT/sheet-%02d.jpg"
ls "$OUT"
