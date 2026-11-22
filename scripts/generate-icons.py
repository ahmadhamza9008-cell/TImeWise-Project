#!/usr/bin/env python3
"""Generate TimeWise PWA icons (192px and 512px) with Pillow."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "assets" / "img"
OUT.mkdir(parents=True, exist_ok=True)


def make(size):
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    pad = int(s * 0.06)
    radius = int(s * 0.22)
    draw.rounded_rectangle(
        [pad, pad, s - pad, s - pad],
        radius=radius,
        fill=(15, 23, 42, 255),
    )

    cx = cy = s // 2
    r = int(s * 0.29)
    width = max(2, int(s * 0.045))
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(45, 212, 191, 255), width=width)
    draw.line([(cx, cy), (cx, cy - int(r * 0.62))], fill=(248, 250, 252, 255), width=width)
    draw.line([(cx, cy), (cx + int(r * 0.48), cy + int(r * 0.24))], fill=(248, 250, 252, 255), width=width)

    return img.resize((size, size), Image.Resampling.LANCZOS)


for dimension in (192, 512):
    path = OUT / f"icon-{dimension}.png"
    make(dimension).save(path)
    print(f"wrote {path.relative_to(OUT.parent.parent)}")
