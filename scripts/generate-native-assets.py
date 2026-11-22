#!/usr/bin/env python3
"""Generate Android launcher icons and splash screens from the PWA icon."""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICON = Image.open(ROOT / "assets" / "img" / "icon-512.png").convert("RGBA")
RES = ROOT / "android" / "app" / "src" / "main" / "res"

DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}


def launcher(size, round_mask):
    canvas = Image.new("RGBA", (size, size), (15, 23, 42, 255))
    canvas.alpha_composite(ICON.resize((size, size), Image.Resampling.LANCZOS))
    if round_mask:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
        canvas.putalpha(mask)
    return canvas.convert("RGB")


for density, (legacy_size, foreground_size) in DENSITIES.items():
    folder = RES / f"mipmap-{density}"
    launcher(legacy_size, False).save(folder / "ic_launcher.png")
    launcher(legacy_size, True).save(folder / "ic_launcher_round.png")
    ICON.resize((foreground_size, foreground_size), Image.Resampling.LANCZOS).save(
        folder / "ic_launcher_foreground.png"
    )
    print(f"icons: {density}")

for splash in sorted(RES.glob("drawable*/splash.png")):
    width, height = Image.open(splash).size
    canvas = Image.new("RGB", (width, height), (15, 23, 42))
    art_size = int(min(width, height) * 0.34)
    art = ICON.resize((art_size, art_size), Image.Resampling.LANCZOS)
    canvas.paste(art, ((width - art_size) // 2, (height - art_size) // 2), art)
    canvas.save(splash)
    print(f"splash: {splash.parent.name}")

print("Native assets generated.")
