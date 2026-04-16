import { describe, it, expect } from "vitest";
import { formatTime, computeDifficultyRating, pickResultTitle } from "../result-card-util";

describe("formatTime", () => {
  it("formats seconds to MM:SS", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(5)).toBe("00:05");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3599)).toBe("59:59");
  });

  it("handles > 1h as H:MM:SS", () => {
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(7265)).toBe("2:01:05");
  });
});

describe("computeDifficultyRating", () => {
  it("returns a number between 1 and 5", () => {
    expect(computeDifficultyRating([1, 1, 1, 1])).toBeGreaterThanOrEqual(1);
    expect(computeDifficultyRating([5, 5, 5, 5, 5])).toBeLessThanOrEqual(5);
  });

  it("higher tiers = higher difficulty", () => {
    const low = computeDifficultyRating([1, 1, 1, 1]);
    const high = computeDifficultyRating([5, 5, 5, 5]);
    expect(high).toBeGreaterThan(low);
  });
});

describe("pickResultTitle", () => {
  it("returns a string title", () => {
    expect(typeof pickResultTitle({ timeSeconds: 60, rulesCleared: 7, tiers: [1, 1, 2, 2] })).toBe("string");
  });

  it("gives different titles for very fast vs very slow runs", () => {
    const fast = pickResultTitle({ timeSeconds: 20, rulesCleared: 7, tiers: [1, 1, 2, 2] });
    const slow = pickResultTitle({ timeSeconds: 1000, rulesCleared: 7, tiers: [1, 1, 2, 2] });
    expect(fast).not.toBe(slow);
  });
});
