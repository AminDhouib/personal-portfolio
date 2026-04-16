"""
Generate per-theme tinted variants of chrome PNGs by selectively shifting
green pixels to each theme's primary hue. Preserves reds (voltorb icons,
1/2/3 number tiles), whites (panel boxes, digits), and dark borders.

CSS hue-rotate shifts every color; this script targets only the green
chrome so the colored elements baked into the sprite stay correct.

Outputs to chrome/{theme}/X.png and tile/{theme}/blank.png so React can
load the right sprite per theme.
"""

import colorsys
import os
from PIL import Image

ROOT = "public/games/super-voltorb-flip/sprites"

# Source files to tint (relative to ROOT)
CHROME_SRC = [
    "chrome/header-frame.png",
    "chrome/legend-frame.png",
    "chrome/voltorb-message-frame.png",
    "chrome/scoreboard-total-frame.png",
    "chrome/scoreboard-current-frame.png",
    "chrome/board-section.png",
]
TILE_SRC = ["tile/blank.png"]
# Memo UI sprites — open/close button and 5-mark panel + copy toggle.
# These have green chrome backgrounds that should match the active theme.
MEMO_SRC = [
    "button/memo/open.png",
    "button/memo/close.png",
    "button/memo/0_off.png",
    "button/memo/0_on.png",
    "button/memo/1_off.png",
    "button/memo/1_on.png",
    "button/memo/2_off.png",
    "button/memo/2_on.png",
    "button/memo/3_off.png",
    "button/memo/3_on.png",
    "button/memo/s_off.png",
    "button/memo/s_on.png",
    "memo/frame.png",
]

# Theme target hues in HLS hue space [0,1].
# 0=red, 0.083=orange, 0.167=yellow, 0.333=green (source),
# 0.5=cyan, 0.667=blue, 0.833=magenta
THEMES = {
    "meadow":   {"target_hue": 0.28, "sat_mul": 0.85, "lit_add": 0.05},   # softer yellow-green
    "twilight": {"target_hue": 0.95, "sat_mul": 1.00, "lit_add": -0.05},  # red-pink sunset
    "thunder":  {"target_hue": 0.13, "sat_mul": 1.10, "lit_add": -0.05},  # yellow-gold
    "rainbow":  {"target_hue": 0.88, "sat_mul": 1.20, "lit_add": 0.00},   # magenta-pink
}

# Source green hue range. The DS chrome bg uses a cyan-leaning green
# (hue ~0.42, RGB 41,165,107). The row/col INFO PANELS in board-section.png
# use a yellow-leaning green (hue ~0.333, RGB 66,173,66) that signals
# "0 voltorbs in this row" — that color is gameplay-significant and must
# stay the same across themes. Likewise the orange/yellow/red panels for
# higher voltorb counts must not shift. So we narrow the detection window
# to cyan-greens only.
GREEN_HUE_LO = 0.38
GREEN_HUE_HI = 0.48
MIN_SAT = 0.15  # skip near-grays (white panels, dark borders)


def is_green(h: float, l: float, s: float) -> bool:
    return GREEN_HUE_LO <= h <= GREEN_HUE_HI and s >= MIN_SAT and 0.05 < l < 0.95


def tint_pixel(r: int, g: int, b: int, target_hue: float, sat_mul: float, lit_add: float) -> tuple[int, int, int]:
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if not is_green(h, l, s):
        return r, g, b
    new_l = max(0.0, min(1.0, l + lit_add))
    new_s = max(0.0, min(1.0, s * sat_mul))
    nr, ng, nb = colorsys.hls_to_rgb(target_hue, new_l, new_s)
    return int(nr * 255), int(ng * 255), int(nb * 255)


def process(src: str, dst: str, target_hue: float, sat_mul: float, lit_add: float) -> int:
    with Image.open(src).convert("RGBA") as img:
        w, h = img.size
        pixels = img.load()
        assert pixels is not None
        changed = 0
        for y in range(h):
            for x in range(w):
                r, g, b, a = pixels[x, y]  # type: ignore[misc]
                if a == 0:
                    continue
                nr, ng, nb = tint_pixel(r, g, b, target_hue, sat_mul, lit_add)
                if (nr, ng, nb) != (r, g, b):
                    pixels[x, y] = (nr, ng, nb, a)  # type: ignore[index]
                    changed += 1
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        img.save(dst, "PNG", optimize=True)
        return changed


def main() -> None:
    for theme_id, params in THEMES.items():
        print(f"\n=== {theme_id} (target_hue={params['target_hue']}) ===")
        for src_rel in CHROME_SRC + TILE_SRC + MEMO_SRC:
            src = f"{ROOT}/{src_rel}"
            # button/memo/open.png -> button/memo/{theme}/open.png
            # chrome/header-frame.png -> chrome/{theme}/header-frame.png
            parts = src_rel.rsplit("/", 1)
            dst_rel = f"{parts[0]}/{theme_id}/{parts[1]}"
            dst = f"{ROOT}/{dst_rel}"
            changed = process(
                src, dst,
                target_hue=params["target_hue"],
                sat_mul=params["sat_mul"],
                lit_add=params["lit_add"],
            )
            print(f"  {dst_rel} ({changed} px tinted)")
    print("\nDone.")


if __name__ == "__main__":
    main()
