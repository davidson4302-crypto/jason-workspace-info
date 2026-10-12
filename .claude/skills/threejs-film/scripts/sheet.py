#!/usr/bin/env python3
"""Tile rendered stills into one review sheet, frame number on each tile.

  sheet.py <stills_dir> <out.png> 0,6,12,...            full frames
  sheet.py <stills_dir> <out.png> 0,6,12 --crop hero     crops centred on a CHECK.props / CHECK.probes entry
           [--size 360]                                  crop size in source pixels (default 1/3 of the frame)
"""
import json, os, sys
from PIL import Image, ImageDraw
args = sys.argv[1:]
def opt(name, default=None):
    if f'--{name}' in args:
        i = args.index(f'--{name}'); return args[i + 1]
    return default
sdir, out, frames = args[0], args[1], [int(x) for x in args[2].split(',') if x]
crop, size = opt('crop'), opt('size')
tiles = []
for f in frames:
    base = os.path.join(sdir, f'f{f:03d}')
    im = Image.open(base + '.png').convert('RGB'); W, H = im.size
    if crop:
        info = json.load(open(base + '.json'))
        r = (info.get('props') or {}).get(crop)
        if r: cx, cy = (r['x0'] + r['x1']) / 2, (r['y0'] + r['y1']) / 2
        else: cx, cy = info['probes'][crop]
        s = int(size or min(W, H) / 3); h = s // 2
        im = im.crop((int(cx - h), int(cy - h), int(cx + h), int(cy + h))); tw, th = 300, 300
    else:
        tw = 360 if W >= H else 240; th = round(tw * H / W)
    t = im.resize((tw, th), Image.LANCZOS)
    d = ImageDraw.Draw(t); d.rectangle((0, 0, 46, 22), fill=(0, 0, 0)); d.text((5, 5), str(f), fill=(255, 255, 255))
    tiles.append(t)
cols = 6 if crop or tiles[0].width < 300 else 4
tw, th = tiles[0].size; rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), (30, 30, 30))
for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
sheet.save(out); print(out)
