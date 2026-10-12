# Sample graded colours from rendered stills: mascot front face, lit diamonds, backdrop.
import json, sys, glob, os
import numpy as np
from PIL import Image
d = sys.argv[1] if len(sys.argv) > 1 else 'out/stills'
def patch(img, x, y, r=5, pct=None):
    x, y = int(round(x)), int(round(y))
    a = np.asarray(img)[max(0,y-r):y+r+1, max(0,x-r):x+r+1, :3].reshape(-1, 3).astype(float)
    if pct is None: return tuple(int(v) for v in np.median(a, axis=0))
    lum = a @ [0.2126, 0.7152, 0.0722]
    sel = a[lum >= np.percentile(lum, pct)]
    return tuple(int(v) for v in sel.mean(axis=0))
hexs = lambda c: '#%02X%02X%02X' % c
for png in sorted(glob.glob(os.path.join(d, 'f*.png'))):
    js = png[:-4] + '.json'
    if not os.path.exists(js): continue
    info = json.load(open(js)); img = Image.open(png).convert('RGB')
    ff = patch(img, *info['frontFace'], r=9, pct=60)
    dia = [hexs(patch(img, x, y, 3, pct=40)) for x, y in info['diamonds']]
    print(os.path.basename(png), 'face', hexs(ff), 'diamonds', ' '.join(dia), 'backdrop-br', hexs(patch(img, 1000, 1000, 8)), 'top', hexs(patch(img, 540, 30, 8)), 'slab', hexs(patch(img, *info['slabTop'], 4)), 'pool in/out', hexs(patch(img, *info['poolIn'], 4)), hexs(patch(img, *info['poolOut'], 4)))
