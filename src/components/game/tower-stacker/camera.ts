// The follow camera. World y grows upward (floor n sits at n * BLOCK_HEIGHT); the
// camera's y is the world height at the bottom edge of the view.
import { BLOCK_HEIGHT, topSlab, type TowerRun } from "./engine";

export interface Camera {
  x: number;
  y: number;
}

/** How long the camera takes to close about 63% of the gap to its target. */
const EASE_MS = 140;
/** Where the top slab sits in the view once the tower is tall, from the bottom. */
const TOP_FRACTION = 0.45;

export function cameraTarget(run: TowerRun, viewWorldHeight: number): Camera {
  const floors = run.slabs.length - 1;
  const top = topSlab(run);
  return {
    x: top.left + top.width / 2,
    y: Math.max(0, floors * BLOCK_HEIGHT - TOP_FRACTION * viewWorldHeight),
  };
}

/** Ease toward `target`; the factor is exponential in dt, so the frame rate cannot matter. */
export function stepCamera(camera: Camera, target: Camera, dtMs: number): Camera {
  const k = 1 - Math.exp(-dtMs / EASE_MS);
  return { x: camera.x + (target.x - camera.x) * k, y: camera.y + (target.y - camera.y) * k };
}
