import { CONFIG } from "../sim/config";
import type { Snapshot } from "../sim/snapshot";
import { nodeStyle } from "./nodes";

// Pointer to board: where a ray from the camera meets the ground, which tile
// that is, and which node (if any) the ray passes through or stands on that
// tile. Pure arithmetic; the scene feeds it the ray three's Raycaster built.

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

/** The Internet's ball (an icosahedron this wide, resting on the ground). */
export const INTERNET_RADIUS = 2.2;
/** Half the widest node footprint: the queue diamond (the box is 1.4, the drum 1.5). */
const NODE_HALF_WIDTH = 1.6;

/** Where the ray enters the box [min, max], as a ray parameter, or null if it misses. */
function rayBox(origin: Vec3, dir: Vec3, min: Vec3, max: Vec3): number | null {
  let near = 0;
  let far = Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    if (Math.abs(dir[axis]) < 1e-9) {
      if (origin[axis] < min[axis] || origin[axis] > max[axis]) return null;
      continue;
    }
    const a = (min[axis] - origin[axis]) / dir[axis];
    const b = (max[axis] - origin[axis]) / dir[axis];
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return null;
  }
  return near;
}

/**
 * The nearest node the ray passes through, against each node's drawn bounds: so a
 * click on the top of the Internet's ball or a tall node picks it, though the ground
 * behind it is another tile.
 */
export function pickNode(
  origin: Vec3,
  dir: Vec3,
  snapshot: Snapshot,
): { id: string; cell: Cell } | null {
  const { internet } = snapshot;
  const nodes = [
    {
      id: "internet",
      cell: { x: internet.x, z: internet.z },
      half: INTERNET_RADIUS,
      height: INTERNET_RADIUS * 2,
    },
    ...snapshot.services.map((service) => ({
      id: service.id,
      cell: { x: service.x, z: service.z },
      half: NODE_HALF_WIDTH,
      height: nodeStyle(service, null).height,
    })),
  ];
  let best: { id: string; cell: Cell } | null = null;
  let bestT = Infinity;
  for (const { id, cell, half, height } of nodes) {
    const t = rayBox(
      origin,
      dir,
      { x: cell.x - half, y: 0, z: cell.z - half },
      { x: cell.x + half, y: height, z: cell.z + half },
    );
    if (t !== null && t < bestT) {
      best = { id, cell };
      bestT = t;
    }
  }
  return best;
}
