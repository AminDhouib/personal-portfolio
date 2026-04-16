"""
Slice public/games/super-voltorb-flip/sprites/background.png into per-component
chrome assets so each React component owns its own visual asset.

Boundaries chosen by inspection of the source (samualtnorman/voltorb-flip)
plus the known coordinates of overlaid dynamic sprites:
  - Level digit at y=11  -> header is the first band
  - Total coins digits at y=117  -> total scoreboard frame spans ~y 101-140
  - Current coins digits at y=157 -> current scoreboard frame spans ~y 141-180
  - Tiles at y=204 onward -> board section starts at y=181

After running this script, each React component uses its own dedicated asset
under public/games/super-voltorb-flip/sprites/chrome/.
"""

from PIL import Image
import os

SRC = "public/games/super-voltorb-flip/sprites/background.png"
OUT = "public/games/super-voltorb-flip/sprites/chrome"

os.makedirs(OUT, exist_ok=True)

with Image.open(SRC) as img:
    assert img.size == (262, 399), f"unexpected bg size {img.size}"

    slices = [
        # (filename, x0, y0, x1, y1)
        ("header.png",             0,   0, 262,  40),
        ("legend.png",             0,  40, 262,  70),
        ("voltorb-message.png",    0,  70, 262, 100),
        ("scoreboard-total.png",   0, 100, 262, 140),
        ("scoreboard-current.png", 0, 140, 262, 180),
        ("board-section.png",      0, 180, 262, 399),
    ]

    for name, x0, y0, x1, y1 in slices:
        crop = img.crop((x0, y0, x1, y1))
        crop.save(os.path.join(OUT, name), "PNG", optimize=True)
        print(f"  {name} -> {x1-x0}x{y1-y0} at ({x0},{y0})")

print("Done.")
