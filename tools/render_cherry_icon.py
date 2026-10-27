"""Render the complete classic Cherry Bomb idle pose, including both faces."""
from pathlib import Path
import json, math, argparse
from PIL import Image
ROOT = Path(__file__).resolve().parents[1]
source = ROOT / 'public/game/classic'
parser = argparse.ArgumentParser()
parser.add_argument('--plant', choices=['cherry', 'pepper', 'ice', 'doom'], default='cherry')
plant = parser.parse_args().plant
data = json.loads((source / (plant + '.json')).read_text(encoding='utf-8'))
frame = data['clips']['idle'][0]
scale = 3
canvas = Image.new('RGBA', (768, 768))
for track in data['tracks']:
    f = track['frames'][frame]
    if not f[8] or f[6] < 0 or f[7] <= 0:
        continue
    sprite = Image.open(source / (f[8] + '.png')).convert('RGBA')
    a = scale * f[4] * math.cos(math.radians(f[2]))
    b = scale * f[4] * math.sin(math.radians(f[2]))
    c = -scale * f[5] * math.sin(math.radians(f[3]))
    d = scale * f[5] * math.cos(math.radians(f[3]))
    x, y = 256 + scale * f[0], 256 + scale * f[1]
    determinant = a * d - b * c
    if abs(determinant) < 1e-8:
        continue
    inverse = (d/determinant, -c/determinant, (c*y-d*x)/determinant,
               -b/determinant, a/determinant, (b*x-a*y)/determinant)
    layer = sprite.transform(canvas.size, Image.Transform.AFFINE, inverse, Image.Resampling.BICUBIC)
    if f[7] < 1:
        layer.putalpha(layer.getchannel('A').point(lambda alpha: round(alpha * f[7])))
    canvas.alpha_composite(layer)
pose = canvas.crop(canvas.getbbox())
pose.thumbnail((120, 120), Image.Resampling.LANCZOS)
icon = Image.new('RGBA', (128, 128))
icon.alpha_composite(pose, ((128-pose.width)//2, (128-pose.height)//2))
icon.save(ROOT / ('public/game/power-' + plant + '.png'))
