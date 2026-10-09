import type { RequestSnapshot } from "../sim/snapshot";
import type { TrafficType } from "../sim/config";

// Requests in flight are one InstancedMesh: this fills its instance buffers
// from the snapshot. Pure, so the index arithmetic is tested without WebGL.

/** Height of a request above the ground. */
export const REQUEST_Y = 1.6;
/** A failed request is drawn this much larger, in red, for the moment it lingers. */
const FAILED_SCALE = 1.5;

export type Rgb = readonly [number, number, number];

/**
 * Write up to `max` requests into `matrices` (16 floats each, column-major, a
 * scale plus a translation) and `colors` (3 floats each). Returns how many were
 * written; the sim keeps running every request, the view draws the first `max`.
 */
export function writeRequestInstances(
  requests: readonly RequestSnapshot[],
  max: number,
  matrices: Float32Array,
  colors: Float32Array,
  colorOf: (type: TrafficType) => Rgb,
  failColor: Rgb,
): number {
  const count = Math.min(requests.length, max, matrices.length / 16, colors.length / 3);
  for (let i = 0; i < count; i++) {
    const r = requests[i] as RequestSnapshot;
    const x = r.fromX + (r.toX - r.fromX) * r.progress;
    const z = r.fromZ + (r.toZ - r.fromZ) * r.progress;
    const s = r.failed ? FAILED_SCALE : 1;
    const m = i * 16;
    matrices.fill(0, m, m + 16);
    matrices[m] = s;
    matrices[m + 5] = s;
    matrices[m + 10] = s;
    matrices[m + 12] = x;
    matrices[m + 13] = REQUEST_Y;
    matrices[m + 14] = z;
    matrices[m + 15] = 1;
    const [cr, cg, cb] = r.failed ? failColor : colorOf(r.type);
    colors[i * 3] = cr;
    colors[i * 3 + 1] = cg;
    colors[i * 3 + 2] = cb;
  }
  return count;
}
