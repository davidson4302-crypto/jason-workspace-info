#!/usr/bin/env bash
# Verify the delivered MP4: streams, duration, frame count, loop seam, loudness of the muxed audio.
set -e
mp4=${1:-out/principles-loop.mp4}
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate,nb_frames,pix_fmt,sample_rate,channels,duration -of compact "$mp4"
python3 - <<'PY'
import numpy as np
from PIL import Image
a = np.asarray(Image.open('out/frames/00000.png').convert('RGB')).astype(int)
b = np.asarray(Image.open('out/frames/00480.png').convert('RGB')).astype(int)
print('frame 480 vs frame 0: max abs diff', np.abs(a - b).max())
PY
ffmpeg -hide_banner -nostats -i "$mp4" -map 0:a -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
ffmpeg -hide_banner -nostats -i out/score.wav -af ebur128=peak=true -f null - 2>&1 | grep -E "I:|Peak:" | tail -2
ffmpeg -hide_banner -loglevel error -y -ss 5.95 -i "$mp4" -frames:v 1 out/encoded_f357.png && echo "pulled frame 357 from the encode"
