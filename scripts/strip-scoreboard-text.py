"""
Generate textless variants of the scoreboard chrome so their labels can be
rendered by React and become per-theme editable.

Strategy: the scoreboard frames are a white rounded box containing black text
and an inset black digit area. We replace every near-black pixel that is *not*
inside the digit area (right side of the box) with white. That erases the text
while preserving the box border and the digit-strip chrome.
"""

from PIL import Image

SRC_DIR = "public/games/super-voltorb-flip/sprites/chrome"


def strip(src_name: str, out_name: str, label_box: tuple[int, int, int, int]) -> None:
    """
    Paint the label region (x0, y0, x1, y1) solid white so the React layer
    can render the label text on top. Leaves the digit strip on the right
    untouched.
    """
    src = f"{SRC_DIR}/{src_name}"
    out = f"{SRC_DIR}/{out_name}"
    with Image.open(src).convert("RGBA") as img:
        w, h = img.size
        px = img.load()
        assert px is not None
        x0, y0, x1, y1 = label_box
        for y in range(y0, y1):
            for x in range(x0, x1):
                px[x, y] = (255, 255, 255, 255)
        img.save(out, "PNG", optimize=True)
        print(f"  {out_name} ({w}x{h}) from {src_name}, label box {label_box}")


# The white label area inside each scoreboard: roughly x=14..158 (left of the
# digit strip) and y=5..35 (inside the top/bottom frame borders).
strip("scoreboard-total.png",   "scoreboard-total-frame.png",   (14, 3, 158, 40))
strip("scoreboard-current.png", "scoreboard-current-frame.png", (14, 3, 158, 40))
print("Done.")
