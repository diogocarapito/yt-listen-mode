#!/usr/bin/env python3
"""Generate the toolbar and store icons for Listen Mode for YouTube.

The mark is an equaliser: a few rounded bars on a rounded square.
  * icon-on-*.png   teal, used while Listen Mode is on
  * icon-off-*.png  grey, used while it is off

Usage (from the repository root):
    pip install pillow
    python3 scripts/generate_icons.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "extension" / "icons"

SIZES = (16, 32, 48, 128)
SUPERSAMPLE = 8  # draw large, then downscale for smooth edges

THEMES = {
    "on": {"bg": (23, 112, 107), "fg": (230, 246, 242)},
    "off": {"bg": (128, 137, 135), "fg": (238, 241, 240)},
}

# Bar heights as a fraction of the glyph box.
BARS_LARGE = (0.45, 0.92, 0.66, 0.34)
BARS_SMALL = (0.55, 1.0, 0.7)  # 16 px is too small for four bars


def draw_icon(size: int, theme: dict) -> Image.Image:
    s = size * SUPERSAMPLE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    inset = round(s * 0.04)
    draw.rounded_rectangle(
        (inset, inset, s - inset - 1, s - inset - 1),
        radius=round(s * 0.24),
        fill=theme["bg"],
    )

    bars = BARS_SMALL if size <= 16 else BARS_LARGE
    count = len(bars)
    box = s * (0.58 if size <= 16 else 0.54)
    gap_ratio = 0.62
    bar_w = box / (count + (count - 1) * gap_ratio)
    gap = bar_w * gap_ratio
    x0 = (s - box) / 2
    cy = s / 2

    for i, height in enumerate(bars):
        bar_h = box * height
        x = x0 + i * (bar_w + gap)
        draw.rounded_rectangle(
            (round(x), round(cy - bar_h / 2), round(x + bar_w), round(cy + bar_h / 2)),
            radius=round(bar_w / 2),
            fill=theme["fg"],
        )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for state, theme in THEMES.items():
        for size in SIZES:
            path = OUT_DIR / f"icon-{state}-{size}.png"
            draw_icon(size, theme).save(path, optimize=True)
            print(f"wrote {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
