"""
Knock out solid-color backgrounds on overlay sprites so they composite
cleanly on top of arbitrary chrome:

  number/big_*.png   -> drop white background (was clashing with dark digit panels)
  number/thin_*.png  -> drop green background (level digit floats over any theme)
  tile/memo_*.png    -> drop green background (memo markers stack over tile face)
  tile/explode_*.png -> drop red tile-face background (explosion overlays voltorb)

Each transformation matches a sampled background color within a small
tolerance and zeros the alpha. Source pixels close to the target colour
go transparent; everything else (the actual glyph / explosion / icon) is
preserved.
"""

from PIL import Image
import os

ROOT = "public/games/super-voltorb-flip/sprites"


def knock_out_color(path: str, target: tuple[int, int, int], tol: int = 20) -> int:
    """Replace any pixel within `tol` of `target` (in each RGB channel) with full
    alpha-zero. Returns the count of pixels modified."""
    with Image.open(path).convert("RGBA") as img:
        w, h = img.size
        px = img.load()
        assert px is not None
        tr, tg, tb = target
        n = 0
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]  # type: ignore[misc]
                if (
                    abs(r - tr) <= tol
                    and abs(g - tg) <= tol
                    and abs(b - tb) <= tol
                ):
                    px[x, y] = (0, 0, 0, 0)
                    n += 1
        img.save(path, "PNG", optimize=True)
        return n


def each(rel_dir: str, predicate, target, tol=20):
    full = os.path.join(ROOT, rel_dir)
    for f in sorted(os.listdir(full)):
        if not f.endswith(".png") or not predicate(f):
            continue
        n = knock_out_color(os.path.join(full, f), target, tol)
        print(f"  {rel_dir}/{f}  -knocked {n} px")


# big digits (white bg)
each("number", lambda f: f.startswith("big_"), (255, 255, 255), tol=10)

# thin level digits (header green bg)
each("number", lambda f: f.startswith("thin_"), (24, 132, 99), tol=20)

# memo markers (tile-face green bg)
each("tile", lambda f: f.startswith("memo_"), (24, 132, 99), tol=20)

# explode frames (tile-face red bg) — separates explosion from underlying tile
each("tile", lambda f: f.startswith("explode_"), (165, 90, 82), tol=25)

print("Done.")
