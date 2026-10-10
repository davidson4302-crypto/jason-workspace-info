#!/usr/bin/env python3
"""Sample the graded colour at every CHECK.probes point in rendered stills (median of a small patch,
upper-luminance half so voxel seams and edges don't drag it down). Compare against CHECK.notes targets.

  measure.py <dir>/out/stills [radius]
"""
import glob, json, os, sys
import numpy as np
from PIL import Image
d = sys.argv[1]; R = int(sys.argv[2]) if len(sys.argv) > 2 else 7
hexs = lambda c: '#%02X%02X%02X' % tuple(int(v) for v in c)
def patch(img, x, y):
    a = np.asarray(img)[max(0, int(y) - R):int(y) + R + 1, max(0, int(x) - R):int(x) + R + 1, :3].reshape(-1, 3).astype(float)
    if not len(a): return None
    lum = a @ [0.2126, 0.7152, 0.0722]
    return a[lum >= np.percentile(lum, 50)].mean(axis=0)
for png in sorted(glob.glob(os.path.join(d, 'f*.png'))):
    js = png[:-4] + '.json'
    if not os.path.exists(js): continue
    info = json.load(open(js)); img = Image.open(png).convert('RGB'); notes = info.get('notes') or {}
    row = []
    for k, (x, y) in info['probes'].items():
        c = patch(img, x, y)
        if c is None: row.append(f'{k}=offscreen'); continue
        tgt = notes.get(k + 'Target')
        if tgt:
            t = np.array([int(tgt[i:i + 2], 16) for i in (1, 3, 5)])
            row.append(f'{k}={hexs(c)} (target {tgt}, delta {"/".join(str(int(v)) for v in c - t)})')
        else: row.append(f'{k}={hexs(c)}')
    print(os.path.basename(png), '  '.join(row))
