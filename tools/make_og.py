"""Renders docs/og.png, the 1280x640 social preview image for the repo and website."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
FONTS = os.path.join(ROOT, 'wwwroot', 'fonts')
font = lambda name, size: ImageFont.truetype(os.path.join(FONTS, name), size)

W, H = 1280, 640
img = Image.new('RGB', (W, H))
d = ImageDraw.Draw(img)
top, bottom = (13, 20, 48), (75, 58, 110)
for y in range(H):
    k = y / H
    d.line([(0, y), (W, y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * k) for i in range(3)))

shot = Image.open(os.path.join(ROOT, 'docs', 'editor.png')).convert('RGB')
sw = 600
shot = shot.resize((sw, int(shot.height * sw / shot.width)), Image.LANCZOS)
sx, sy = W - sw - 36, (H - shot.height) // 2 + 20
d.rectangle([sx - 6, sy - 6, sx + sw + 5, sy + shot.height + 5], fill=(0, 0, 0))
img.paste(shot, (sx, sy))
d.rectangle([sx - 6, sy - 6, sx + sw + 5, sy + shot.height + 5], outline=(140, 114, 230), width=3)

def extruded(x, y, text, f, face, side):
    for i in range(6, 0, -1):
        d.text((x, y + i * 3), text, font=f, fill=tuple(int(c * (0.45 + i * 0.05)) for c in side))
    d.text((x, y), text, font=f, fill=face)

big = font('monocraft-bold.ttf', 88)
extruded(56, 70, 'SKIN', big, (236, 236, 241), (184, 184, 196))
extruded(56, 180, 'CRAFT', big, (142, 224, 94), (99, 178, 60))

def shadowed(x, y, text, f, fill, sh=(30, 26, 44)):
    d.text((x + 3, y + 3), text, font=f, fill=sh)
    d.text((x, y), text, font=f, fill=fill)

shadowed(60, 318, '3D Minecraft Skin Editor', font('monocraft-bold.ttf', 30), (255, 255, 255))
shadowed(60, 366, 'for Windows PC', font('monocraft-bold.ttf', 30), (255, 255, 255))
small = font('monocraft.ttf', 24)
for i, line in enumerate(['Paint directly on the 3D model', 'Mirror, fill, layers & poses', 'Free for Windows 10 & 11']):
    shadowed(60, 438 + i * 38, '> ' + line, small, (255, 255, 85), (63, 63, 21))

out = os.path.join(ROOT, 'docs', 'og.png')
img.save(out, optimize=True)
print('saved', out)
