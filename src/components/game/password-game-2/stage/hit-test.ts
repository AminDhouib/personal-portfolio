import type { PointerTarget } from "../engine/types";
import type { HitRegion, RectLike } from "./painters";

interface PickOptions {
  /** A coarse (touch) pointer gets the 44 px floor; a fine one gets the glyph's own box. */
  coarse: boolean;
  /** Every glyph's own box, so a coarse tap on a neighbour reaches its caret. */
  cells: readonly RectLike[];
}

function inRect(r: RectLike, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

/** Whether (x, y) counts for region h under the pointer ruling. */
function covers(h: HitRegion, x: number, y: number, opts: PickOptions): boolean {
  if (h.shape === "circle") {
    const dx = x - h.x;
    const dy = y - h.y;
    return dx * dx + dy * dy <= h.r * h.r;
  }
  if (!h.core) return inRect(h, x, y);
  if (inRect(h.core, x, y)) return true;
  // Past the glyph's own box only a coarse pointer reaches, and never into a neighbour.
  if (!opts.coarse || !inRect(h, x, y)) return false;
  for (const c of opts.cells) if (c !== h.core && inRect(c, x, y)) return false;
  return true;
}

/**
 * The target under (x, y) in canvas-local CSS pixels, or null to let the press through
 * to the caret. Where regions overlap the nearest centre wins; a tie goes to the newest,
 * which paints on top.
 */
export function pickHit(
  hits: readonly HitRegion[],
  x: number,
  y: number,
  opts: PickOptions,
): PointerTarget | null {
  let best: PointerTarget | null = null;
  let bestD = Infinity;
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i]!;
    if (!covers(h, x, y, opts)) continue;
    const cx = h.shape === "rect" ? h.x + h.w / 2 : h.x;
    const cy = h.shape === "rect" ? h.y + h.h / 2 : h.y;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestD) {
      best = h.target;
      bestD = d;
    }
  }
  return best;
}
