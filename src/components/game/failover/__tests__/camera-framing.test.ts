// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cameraPose, initialCamera, panByPixels, projectToView } from "../scene/camera";
import { INTERNET_RADIUS } from "../scene/pick";
import { CONFIG } from "../sim/config";

// The default view on a phone, a tablet and a desktop: the Internet node, where
// every build starts, is fully on the board with room to spare. A narrow board
// sees less to each side, so its view sits further toward the Internet.

const MARGIN_PX = 8;
const SIZES: Array<[number, number]> = [
  [390, 844],
  [768, 1024],
  [1440, 900],
];

/** The corners of the Internet node's box: the ball sits on the ground, INTERNET_RADIUS round. */
function internetCorners(): Array<[number, number, number]> {
  const { x, z } = CONFIG.internetNodeStartPos;
  const r = INTERNET_RADIUS;
  const out: Array<[number, number, number]> = [];
  for (const dx of [-r, r]) {
    for (const dz of [-r, r]) for (const y of [0, 2 * r]) out.push([x + dx, y, z + dz]);
  }
  return out;
}

describe("the default camera", () => {
  it.each(SIZES)("shows all of the Internet node on a %i x %i board, 8 px in", (w, h) => {
    for (const corner of internetCorners()) {
      const p = projectToView(initialCamera(), corner, w, h)!;
      expect(p.x).toBeGreaterThanOrEqual(MARGIN_PX);
      expect(p.x).toBeLessThanOrEqual(w - MARGIN_PX);
      expect(p.y).toBeGreaterThanOrEqual(MARGIN_PX);
      expect(p.y).toBeLessThanOrEqual(h - MARGIN_PX);
    }
  });

  it("keeps the Internet in the left half on a phone, so the starting area to its right shows", () => {
    const p = projectToView(initialCamera(), [CONFIG.internetNodeStartPos.x, 0, 0], 390, 844)!;
    expect(p.x).toBeLessThan(195);
  });

  it("leaves a wide board's view as it was", () => {
    const s = initialCamera();
    expect(cameraPose(s, 1440 / 900)).toEqual(cameraPose(s));
  });

  it("still has a drag follow the finger on a narrow board: the framing is a fixed shift", () => {
    const s = initialCamera();
    const point: [number, number, number] = [s.x, 0, s.z];
    const before = projectToView(s, point, 390, 844)!;
    const after = projectToView(panByPixels(s, 60, 0, 844), point, 390, 844)!;
    expect(after.x - before.x).toBeCloseTo(60, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});
