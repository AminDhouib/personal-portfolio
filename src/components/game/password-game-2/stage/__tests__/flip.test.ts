import { describe, expect, it } from "vitest";
import { FLIP_MS, planFlip } from "../flip";

describe("planFlip", () => {
  it("returns the inverse translate for items that moved", () => {
    const prev = new Map([
      ["a", 0],
      ["b", 60],
      ["c", 120],
    ]);
    const next = new Map([
      ["a", 60],
      ["b", 0],
      ["c", 120],
    ]);
    expect(planFlip(prev, next)).toEqual([
      { id: "a", dy: -60 },
      { id: "b", dy: 60 },
    ]);
  });

  it("skips sub-pixel moves, new items and removed items", () => {
    const prev = new Map([
      ["a", 10],
      ["gone", 50],
    ]);
    const next = new Map([
      ["a", 10.4],
      ["fresh", 80],
    ]);
    expect(planFlip(prev, next)).toEqual([]);
  });

  it("exports the 490ms reorder duration", () => {
    expect(FLIP_MS).toBe(490);
  });
});
