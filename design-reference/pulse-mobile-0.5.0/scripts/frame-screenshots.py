# Puts each screenshot in an iPhone 17 Pro-style frame on a dark backdrop (docs/screenshots.md).
# usage: python3 scripts/frame-screenshots.py <dir of PNGs> <out dir>
import sys, glob, os
from PIL import Image, ImageDraw, ImageFilter

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
R, B, E, P = 150, 34, 14, 170          # screen radius, black bezel, titanium edge, padding
for path in sorted(glob.glob(os.path.join(src, "*.png"))):
    shot = Image.open(path).convert("RGBA")
    w, h = shot.size
    fw, fh = w + 2 * (B + E), h + 2 * (B + E)
    cw, ch = fw + 2 * P, fh + 2 * P
    # backdrop: vertical gradient
    bg = Image.new("RGBA", (cw, ch))
    top, bot = (30, 34, 42), (10, 11, 14)
    g = ImageDraw.Draw(bg)
    for y in range(ch):
        t = y / ch
        g.line([(0, y), (cw, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,))
    ox, oy = P, P
    # shadow
    sh = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([ox, oy + 40, ox + fw, oy + fh + 40], R + B + E, fill=(0, 0, 0, 170))
    bg.alpha_composite(sh.filter(ImageFilter.GaussianBlur(60)))
    d = ImageDraw.Draw(bg)
    # side buttons (left: action, volume up, volume down; right: power, camera control)
    btn = (70, 74, 80, 255)
    for y0, y1 in [(520, 640), (760, 960), (1010, 1210)]:
        d.rounded_rectangle([ox - 9, oy + y0, ox + 6, oy + y1], 6, fill=btn)
    for y0, y1 in [(860, 1180), (1700, 1900)]:
        d.rounded_rectangle([ox + fw - 6, oy + y0, ox + fw + 9, oy + y1], 6, fill=btn)
    # titanium edge, a lighter rim, then the black bezel
    d.rounded_rectangle([ox, oy, ox + fw, oy + fh], R + B + E, fill=(88, 92, 99, 255))
    d.rounded_rectangle([ox + 3, oy + 3, ox + fw - 3, oy + fh - 3], R + B + E - 3, fill=(52, 55, 60, 255))
    d.rounded_rectangle([ox + E, oy + E, ox + fw - E, oy + fh - E], R + B, fill=(0, 0, 0, 255))
    # screen with rounded corners
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, w - 1, h - 1], R, fill=255)
    bg.paste(shot, (ox + E + B, oy + E + B), mask)
    bg.convert("RGB").save(os.path.join(out, os.path.basename(path)), optimize=True)
    print(os.path.basename(path))
