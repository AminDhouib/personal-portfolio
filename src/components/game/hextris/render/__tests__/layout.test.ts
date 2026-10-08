import { describe, it, expect } from "vitest";
import { SPAWN_ROWS } from "../../engine/state";
import { layout, ringRadius } from "../layout";

const SIZES: [string, number, number][] = [
  ["portrait phone", 390, 844],
  ["landscape desktop", 1440, 900],
];

describe("layout", () => {
  for (const [name, width, height] of SIZES) {
    for (const immersive of [false, true]) {
      it(`fits the limit ring and the spawn ring inside a ${name} canvas (immersive ${immersive})`, () => {
        const l = layout(width, height, immersive);
        expect(l.cx).toBe(width / 2);
        expect(l.cy).toBe(height / 2);
        expect(l.apothem).toBeGreaterThan(0);
        expect(l.rowHeight).toBeGreaterThan(0);
        for (const rows of [12, SPAWN_ROWS + 1]) {
          const r = ringRadius(l, rows);
          expect(l.cx - r).toBeGreaterThanOrEqual(0);
          expect(l.cx + r).toBeLessThanOrEqual(width);
          expect(l.cy - r).toBeGreaterThanOrEqual(0);
          expect(l.cy + r).toBeLessThanOrEqual(height);
        }
      });
    }
  }

  it("uses the room it has: bigger on the bigger canvas, and bigger when immersive", () => {
    const phone = layout(390, 844, false);
    const desk = layout(1440, 900, false);
    expect(desk.rowHeight).toBeGreaterThan(phone.rowHeight);
    expect(layout(390, 844, true).rowHeight).toBeGreaterThan(phone.rowHeight);
    // The short side decides: a portrait phone is limited by its width.
    expect(ringRadius(phone, SPAWN_ROWS + 1)).toBeGreaterThan(390 * 0.4);
  });
});
