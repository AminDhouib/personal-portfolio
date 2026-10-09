import { CONFIG } from "../sim/config";
import type { Snapshot } from "../sim/snapshot";

// Pointer to board: where a ray from the camera meets the ground, which tile
// that is, and which node (if any) stands on it. Pure arithmetic; the scene
// feeds it the ray three's Raycaster built.

export interface Cell {
  x: number;
  z: number;
}

type Vec3 = { x: number; y: number; z: number };

/** Half the board plus half a tile: a tap past this is off the board. */
const BOARD_EDGE = (CONFIG.gridSize * CONFIG.tileSize) / 2 + CONFIG.tileSize / 2;

/** Where the ray meets the ground plane (y = 0), or null if it never does. */
export function groundPoint(origin: Vec3, dir: Vec3): { x: number; z: number } | null {
  if (Math.abs(dir.y) < 1e-9) return null;
  const t = -origin.y / dir.y;
  if (t < 0) return null;
  return { x: origin.x + dir.x * t, z: origin.z + dir.z * t };
}

/** The tile a ground point falls in (services sit on tile centres), or null off the board. */
export function cellAt(point: { x: number; z: number }): Cell | null {
  if (Math.abs(point.x) > BOARD_EDGE || Math.abs(point.z) > BOARD_EDGE) return null;
  const s = CONFIG.tileSize;
  return { x: Math.round(point.x / s) * s + 0, z: Math.round(point.z / s) * s + 0 };
}

/** The node on a tile: "internet", a service id, or null for an empty tile. */
export function nodeAt(cell: Cell, snapshot: Snapshot): string | null {
  if (snapshot.internet.x === cell.x && snapshot.internet.z === cell.z) return "internet";
  const service = snapshot.services.find((s) => s.x === cell.x && s.z === cell.z);
  return service ? service.id : null;
}
