// Falling offcuts. Pure state, stepped by the frame loop and drawn by the painter.
// World y grows upward, so a falling piece's y decreases.
import { BLOCK_HEIGHT, type Slab } from "./engine";

export interface DebrisPiece {
  left: number;
  width: number;
  /** World height of the piece's bottom edge. */
  y: number;
  /** Downward speed, units per ms. */
  vy: number;
  /** Radians, positive is clockwise on the canvas. */
  angle: number;
  spin: number;
}

const GRAVITY = 0.0025;
const SPIN = 0.004;

/** `side` is the side of the tower the cut hangs off; it spins away from the tower. */
export function spawnDebris(cut: Slab, floorY: number, side: "left" | "right"): DebrisPiece {
  return {
    left: cut.left,
    width: cut.width,
    y: floorY,
    vy: 0,
    angle: 0,
    spin: side === "left" ? -SPIN : SPIN,
  };
}

/** Advance every piece by `dtMs` and drop those that fell below `viewBottomY`. */
export function stepDebris(
  pieces: DebrisPiece[],
  dtMs: number,
  viewBottomY: number,
): DebrisPiece[] {
  const next: DebrisPiece[] = [];
  for (const p of pieces) {
    const vy = p.vy + GRAVITY * dtMs;
    const moved: DebrisPiece = {
      ...p,
      vy,
      y: p.y - vy * dtMs,
      angle: p.angle + p.spin * dtMs,
    };
    if (moved.y + BLOCK_HEIGHT >= viewBottomY) next.push(moved);
  }
  return next;
}
