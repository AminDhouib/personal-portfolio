import { describe, it, expect } from "vitest";
import {
  pickCellValue,
  pickCellValueSeeded,
  randomFlipDelay,
  seededFlipDelay,
  seededFromCoords,
} from "../cell-values";

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++] ?? 0;
};

describe("pickCellValue", () => {
  it("is a bomb below 0.15 and consumes one draw", () => {
    let calls = 0;
    const rng = () => {
      calls += 1;
      return 0.149;
    };
    expect(pickCellValue(rng)).toBe("bomb");
    expect(calls).toBe(1);
  });

  it("maps the second draw onto 1, 2 or 3 otherwise", () => {
    expect(pickCellValue(seq(0.15, 0))).toBe(1);
    expect(pickCellValue(seq(0.15, 0.34))).toBe(2);
    expect(pickCellValue(seq(0.99, 0.999))).toBe(3);
  });
});

describe("seeded helpers", () => {
  it("are deterministic and within [0, 1)", () => {
    for (let r = 0; r < 4; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const v = seededFromCoords(r, c);
        expect(v).toBe(seededFromCoords(r, c));
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("gives the same starting value for the same cell, always a bomb or 1-3", () => {
    for (let r = 0; r < 3; r += 1) {
      for (let c = 0; c < 6; c += 1) {
        const v = pickCellValueSeeded(r, c);
        expect(v).toBe(pickCellValueSeeded(r, c));
        expect(v === "bomb" || [1, 2, 3].includes(v)).toBe(true);
      }
    }
  });

  it("derives the seeded flip delay from the shifted coordinates", () => {
    expect(seededFlipDelay(1, 2, 6)).toBe(seededFromCoords(2, 3) * 4.5);
  });
});

describe("randomFlipDelay", () => {
  it("scales one draw by the cycle minus 1.5 s", () => {
    expect(randomFlipDelay(6, () => 0.5)).toBe(2.25);
    expect(randomFlipDelay(6, () => 0)).toBe(0);
  });
});
