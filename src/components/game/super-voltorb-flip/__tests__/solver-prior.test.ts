import { describe, it, expect } from "vitest";
import { BOARD_CONFIGS } from "../hgss";
import { ACCEPT_RATE, estimateAcceptRate, layoutCount } from "../solver-prior";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("layoutCount", () => {
  it("is the multinomial 25! / (V! twos! threes! ones!)", () => {
    // 6 Voltorbs, 3 twos, 1 three, 15 ones: 25 * 24 * ... * 16 / (6! * 3! * 1!).
    expect(
      layoutCount({ voltorbs: 6, twos: 3, threes: 1, maxFreePerRowCol: 3, maxFreeTotal: 3 }),
    ).toBe((25 * 24 * 23 * 22 * 21 * 20 * 19 * 18 * 17 * 16) / (720 * 6 * 1));
  });
});

describe("ACCEPT_RATE", () => {
  it("has one rate in (0, 1] per board", () => {
    expect(ACCEPT_RATE).toHaveLength(80);
    for (const rate of ACCEPT_RATE) {
      expect(rate).toBeGreaterThan(0);
      expect(rate).toBeLessThanOrEqual(1);
    }
  });

  it("matches a fresh seeded estimate for every board", () => {
    const samples = 3000;
    BOARD_CONFIGS.forEach((config, id) => {
      const fresh = estimateAcceptRate(config, mulberry32(1000 + id), samples);
      const p = ACCEPT_RATE[id] ?? 0;
      const tolerance = 5 * Math.sqrt((p * (1 - p)) / samples) + 0.002;
      expect(Math.abs(fresh - p), `board ${id}`).toBeLessThanOrEqual(tolerance);
    });
  });

  it("tighter caps never accept more often than the looser twin", () => {
    // Within a level, boards k and k + 5 share card counts; the second has caps no looser.
    for (let level = 0; level < 8; level++) {
      for (let k = 0; k < 5; k++) {
        const loose = ACCEPT_RATE[level * 10 + k] ?? 0;
        const tight = ACCEPT_RATE[level * 10 + k + 5] ?? 0;
        expect(tight, `board ${level * 10 + k + 5}`).toBeLessThanOrEqual(loose + 0.01);
      }
    }
  });
});
