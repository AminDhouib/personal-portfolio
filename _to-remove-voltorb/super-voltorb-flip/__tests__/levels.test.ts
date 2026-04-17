import { describe, it, expect } from "vitest";
import { LEVELS } from "../levels";

describe("LEVELS table", () => {
  it("has 8 levels", () => {
    expect(LEVELS).toHaveLength(8);
  });

  it("each level has 5 configs", () => {
    for (const level of LEVELS) {
      expect(level).toHaveLength(5);
    }
  });

  it("each config has 4 numbers", () => {
    for (const level of LEVELS) {
      for (const config of level) {
        expect(config).toHaveLength(4);
      }
    }
  });

  it("maxCoins equals 2^twos * 3^threes for every config", () => {
    for (const level of LEVELS) {
      for (const [twos, threes, , maxCoins] of level) {
        expect(maxCoins).toBe(Math.pow(2, twos) * Math.pow(3, threes));
      }
    }
  });

  it("total special tile count is <= 25 (fits in 5x5 grid)", () => {
    for (const level of LEVELS) {
      for (const [twos, threes, voltorbs] of level) {
        expect(twos + threes + voltorbs).toBeLessThanOrEqual(25);
      }
    }
  });
});
