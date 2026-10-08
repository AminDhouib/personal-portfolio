import { describe, it, expect } from "vitest";
import { fallRowsPerSecond } from "../../engine/director";
import { SPAWN_ROWS, START_LIMIT_ROWS } from "../../engine/state";
import { layout, ringRadius } from "../layout";

const SIZES: [string, number, number][] = [
  ["portrait phone", 390, 844],
  ["landscape desktop", 1440, 900],
];

describe("layout", () => {
  for (const [name, width, height] of SIZES) {
    for (const immersive of [false, true]) {
      it(`fits the limit ring and one more row inside a ${name} canvas (immersive ${immersive})`, () => {
        const l = layout(width, height, immersive);
        expect(l.cx).toBe(width / 2);
        expect(l.cy).toBe(height / 2);
        expect(l.apothem).toBeGreaterThan(0);
        expect(l.rowHeight).toBeGreaterThan(0);
        for (const rows of [START_LIMIT_ROWS, START_LIMIT_ROWS + 1]) {
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
    expect(ringRadius(phone, START_LIMIT_ROWS + 1)).toBeGreaterThan(390 * 0.4);
  });

  it("lets a fresh piece start beyond the shorter edge (spec sections 1.4 and 10.11)", () => {
    const phone = layout(390, 844, false);
    expect(ringRadius(phone, SPAWN_ROWS + 1)).toBeGreaterThan(390 / 2);
  });

  it("matches the derived on-screen speeds at the start of a run (spec section 10.11)", () => {
    const phone = layout(390, 844, false);
    const desk = layout(1440, 900, false);
    expect(phone.rowHeight).toBeCloseTo(9.8, 1);
    expect(desk.rowHeight).toBeCloseTo(22.6, 1);
    const pxPerSecond = (rowHeight: number) => rowHeight * fallRowsPerSecond(1);
    expect(pxPerSecond(phone.rowHeight)).toBeCloseTo(57, 0);
    expect(pxPerSecond(desk.rowHeight)).toBeCloseTo(131, 0);
    // Before T5-4: the spawn ring fitted (17.5 rows) at 2.6 rows per second. The A/B measured
    // that at 0.4 times the old game, so the target is 2.5 times, within 15 percent.
    const before = ((390 / 2 - 390 * 0.05) * (Math.sqrt(3) / 2)) / 17.5;
    const ratio = pxPerSecond(phone.rowHeight) / (before * 2.6);
    expect(ratio).toBeGreaterThan(2.5 * 0.85);
    expect(ratio).toBeLessThan(2.5 * 1.15);
    // A level 1 piece reaches the hexagon in about 2.4 s.
    expect(SPAWN_ROWS / fallRowsPerSecond(1)).toBeCloseTo(2.4, 1);
  });
});
