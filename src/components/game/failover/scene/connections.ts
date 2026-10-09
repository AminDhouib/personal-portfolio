import type { Snapshot } from "../sim/snapshot";

// Every link on the board is one LineSegments: two vertices per link, written
// from the snapshot each frame. Pure, so it is tested without WebGL.

/** Height of a link above the ground, under the requests that fly along it. */
export const LINK_Y = 0.4;

/**
 * Fill `positions` (3 floats per vertex) with one segment per connection whose
 * two ends are both on the board. Returns the number of vertices written.
 */
export function writeConnectionSegments(snapshot: Snapshot, positions: Float32Array): number {
  const at = new Map<string, { x: number; z: number }>();
  at.set("internet", snapshot.internet);
  for (const s of snapshot.services) at.set(s.id, s);

  let v = 0;
  for (const c of snapshot.connections) {
    if ((v + 2) * 3 > positions.length) break;
    const from = at.get(c.from);
    const to = at.get(c.to);
    if (!from || !to) continue;
    positions.set([from.x, LINK_Y, from.z, to.x, LINK_Y, to.z], v * 3);
    v += 2;
  }
  return v;
}
