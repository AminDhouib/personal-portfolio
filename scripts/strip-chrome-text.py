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

print("Done.")
