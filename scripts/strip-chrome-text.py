"""
Strip baked-in text from chrome slices so each React component can render
its own text (editable per-theme). Fills the text region with the sampled
background color of that chrome piece, leaving borders intact.

Output lives beside the original slices under sprites/chrome/.
"""

from PIL import Image

SRC_DIR = "public/games/super-voltorb-flip/sprites/chrome"


def strip(src_name: str, out_name: str, sample_xy: tuple[int, int],
          region: tuple[int, int, int, int]) -> None:
    src = f"{SRC_DIR}/{src_name}"
    out = f"{SRC_DIR}/{out_name}"
    with Image.open(src).convert("RGBA") as img:
        bg = img.getpixel(sample_xy)
        px = img.load()
        assert px is not None
        x0, y0, x1, y1 = region
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = bg  # type: ignore[index]
        img.save(out, "PNG", optimize=True)
        print(f"  {out_name} ({x1-x0}x{y1-y0} stripped, bg {bg})")


# Header: two text rows in the green interior of the banner. Sample green
# from (20, 17), which sits in the narrow gap between the two text lines.
# Widened region to fully clear anti-aliased edges above/below each row.
strip("header.png", "header-frame.png",
      sample_xy=(20, 17), region=(6, 3, 256, 37))

# Voltorb message: single text row "Game Over! 0!" — voltorb icon on the
# left stays (we keep the whole left band); strip only the right side where
# the text runs.
strip("voltorb-message.png", "voltorb-message-frame.png",
      sample_xy=(30, 2), region=(100, 2, 258, 28))

# Legend: keep the three 1/2/3 tile boxes on the left side, strip the
# "...x1! ...x2! ...x3!" text to the right. Sample green from the right-
# most area which is always background.
strip("legend.png", "legend-frame.png",
      sample_xy=(255, 4), region=(96, 3, 256, 27))


# Scoreboards: each has a white label panel on the LEFT with two lines of
# baked text ("TOTAL" + "Collected Coins" or "Coins Collected in" + "Current
# Game"). Strip the entire white panel interior so React can render the
# theme-defined label cleanly.
def strip_white(src_name: str, out_name: str,
                region: tuple[int, int, int, int]) -> None:
    src = f"{SRC_DIR}/{src_name}"
    out = f"{SRC_DIR}/{out_name}"
    with Image.open(src).convert("RGBA") as img:
        px = img.load()
        assert px is not None
        x0, y0, x1, y1 = region
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = (255, 255, 255, 255)  # type: ignore[index]
        img.save(out, "PNG", optimize=True)
        print(f"  {out_name} ({x1-x0}x{y1-y0} cleared to white)")


# scoreboard-total: white panel runs roughly x=14..156, y=12..40.
# The baked "Collected Coins" subtitle text extends down to y=39, so
# strip the FULL panel interior to be safe.
strip_white("scoreboard-total.png", "scoreboard-total-frame.png",
            region=(14, 12, 156, 40))

# scoreboard-current: same panel layout.
strip_white("scoreboard-current.png", "scoreboard-current-frame.png",
            region=(14, 12, 156, 40))


# Bleed-over from the previous slice: the original DS chrome was a single
# tall image, so cutting it into rows leaves the BOTTOM of the previous
# panel's text bleeding into the TOP of the next one.
#
#   scoreboard-total  y=0..3  has the bottom of the header subtitle text
#                              over the green chrome bg → fill with green.
#   scoreboard-current y=0     has the bottom of the total panel's
#                              "Collected Coins" subtitle over white → fill with white.
def overpaint(src_name: str, region: tuple[int, int, int, int],
              fill: tuple[int, int, int, int]) -> None:
    path = f"{SRC_DIR}/{src_name}"
    with Image.open(path).convert("RGBA") as img:
        px = img.load()
        assert px is not None
        x0, y0, x1, y1 = region
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = fill  # type: ignore[index]
        img.save(path, "PNG", optimize=True)
        print(f"  {src_name} ({x1-x0}x{y1-y0} overpaint at top, fill {fill})")


overpaint("scoreboard-total-frame.png",
          region=(14, 0, 156, 4),
          fill=(41, 165, 107, 255))

overpaint("scoreboard-current-frame.png",
          region=(14, 0, 156, 4),
          fill=(255, 255, 255, 255))


# board-section: y=0 still has the bottom of the current scoreboard's
# "Current Game" subtitle text, since the slice grabbed a few extra rows
# of the white panel above. The visible band is just the panel continuation,
# so paint it white to match.
def overpaint_existing(src_name: str, region: tuple[int, int, int, int],
                       fill: tuple[int, int, int, int]) -> None:
    path = f"{SRC_DIR}/{src_name}"
    with Image.open(path).convert("RGBA") as img:
        px = img.load()
        assert px is not None
        x0, y0, x1, y1 = region
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = fill  # type: ignore[index]
        img.save(path, "PNG", optimize=True)
        print(f"  {src_name} ({x1-x0}x{y1-y0} overpaint, fill {fill})")


# board-section.png is loaded as-is by BoardSection.tsx (no _frame variant).
# Strip the text bleed at the very top of the slice.
overpaint_existing("board-section.png",
                   region=(14, 0, 156, 1),
                   fill=(255, 255, 255, 255))

print("Done.")
