"""
Audit sprite transparency: report which active sprites have an opaque
background that would benefit from being made transparent.
"""

from PIL import Image
import os

ROOT = "public/games/super-voltorb-flip/sprites"

paths = []
for dirpath, _, files in os.walk(ROOT):
    if "/unused" in dirpath.replace("\\", "/"):
        continue
    for f in files:
        if f.endswith(".png"):
            paths.append(os.path.join(dirpath, f))

print(f"Auditing {len(paths)} active sprites\n")

for p in sorted(paths):
    with Image.open(p).convert("RGBA") as img:
        w, h = img.size
        px = img.load()
        # Sample 4 corners + center
        corners = [px[0, 0], px[w-1, 0], px[0, h-1], px[w-1, h-1], px[w//2, h//2]]
        opaque_corners = sum(1 for c in corners[:4] if c[3] > 200)
        rel = p.replace(ROOT + os.sep, "").replace("\\", "/")
        if opaque_corners >= 3:
            print(f"  OPAQUE  {rel} {w}x{h} corners={corners[:4]}")
