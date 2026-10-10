# Tile mascot-centred crops from out/stills/fNNN.png using each still's frameCheck json.
import json, sys, os
from PIL import Image, ImageDraw
frames = [int(x) for x in sys.argv[2].split(',')]; name = sys.argv[1]; size = int(sys.argv[3]) if len(sys.argv) > 3 else 320
cols = 6; tiles = []
for f in frames:
    base = f'out/stills/f{f:03d}'
    info = json.load(open(base + '.json')); im = Image.open(base + '.png').convert('RGB')
    m = info['mascot']; cx = (m['x0'] + m['x1']) / 2; cy = (m['y0'] + m['y1']) / 2
    half = size // 2
    box = (int(cx - half), int(cy - half), int(cx + half), int(cy + half))
    t = im.crop(box).resize((300, 300), Image.LANCZOS)
    d = ImageDraw.Draw(t); d.rectangle((0, 0, 44, 22), fill=(0, 0, 0)); d.text((5, 5), str(f), fill=(255, 255, 255))
    tiles.append(t)
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new('RGB', (cols * 300, rows * 300), (40, 40, 40))
for i, t in enumerate(tiles): sheet.paste(t, ((i % cols) * 300, (i // cols) * 300))
sheet.save(f'out/crops_{name}.png'); print(f'out/crops_{name}.png')
