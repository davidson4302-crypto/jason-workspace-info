#!/usr/bin/env python3
"""Final checks on a delivered film. Prints PASS/FAIL lines; exit 1 if any FAIL.

  verify.py <dir> <mp4>
"""
import json, os, re, subprocess, sys
import numpy as np
from PIL import Image
d, mp4 = sys.argv[1], sys.argv[2]
html = open(os.path.join(d, 'index.html')).read()
W = int(re.search(r'W:\s*(\d+)', html).group(1)); H = int(re.search(r'H:\s*(\d+)', html).group(1))
FPS = int(re.search(r'FPS:\s*(\d+)', html).group(1)); SECS = float(re.search(r'SECONDS:\s*([\d.]+)', html).group(1))
LOOP = re.search(r'LOOP:\s*(true|false)', html).group(1) == 'true'; N = round(FPS * SECS)
fails = 0
def check(ok, msg):
    global fails; fails += 0 if ok else 1; print(('PASS ' if ok else 'FAIL ') + msg)
p = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', mp4], capture_output=True, text=True).stdout)['streams']
v = next((s for s in p if s['codec_type'] == 'video'), None); a = next((s for s in p if s['codec_type'] == 'audio'), None)
check(v and v['width'] == W and v['height'] == H, f'video {v and v["width"]}x{v and v["height"]} (want {W}x{H})')
check(v and v['r_frame_rate'] == f'{FPS}/1' and int(v.get('nb_frames', 0)) == N, f'{v and v["r_frame_rate"]} fps, {v and v.get("nb_frames")} frames (want {FPS}, {N})')
check(v and v['pix_fmt'] == 'yuv420p', f'pix_fmt {v and v["pix_fmt"]}')
check(a is not None and int(a['sample_rate']) == 48000 and a['channels'] == 2, f'audio {a and a["codec_name"]} {a and a["sample_rate"]} Hz x{a and a["channels"]}')
if a:
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', mp4, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    s = r[r.rfind('Summary:'):]; I = float(re.search(r'I:\s+(-?[\d.]+) LUFS', s).group(1)); TP = float(re.search(r'Peak:\s+(-?[\d.]+) dBFS', s).group(1))
    check(abs(I + 14) <= 0.5, f'loudness {I} LUFS (target -14)'); check(TP <= -1.0, f'true peak {TP} dBTP (max -1.0)')
if LOOP:
    f0, fN = os.path.join(d, 'out/frames/00000.png'), os.path.join(d, f'out/frames/{N:05d}.png')
    if os.path.exists(fN):
        diff = np.abs(np.asarray(Image.open(f0), dtype=int) - np.asarray(Image.open(fN), dtype=int)).max()
        check(diff == 0, f'loop seam: frame {N} vs frame 0 max diff {diff}')
check('Math.random' not in html, 'no Math.random (seeded randomness only)')
check('window.renderAt' in html, 'window.renderAt contract present')
sys.exit(1 if fails else 0)
