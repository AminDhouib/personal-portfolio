import { describe, expect, it } from "vitest";
import { accuracyPercent, isNewBest, wpm } from "../metrics";

describe("typing-speed metrics", () => {
  it("wpm is (chars / 5) per minute", () => {
    expect(wpm(250, 60000)).toBe(50);
  });

  it("wpm is 0 when no characters were typed", () => {
    expect(wpm(0, 1000)).toBe(0);
  });

  it("wpm is 0 when no time has elapsed", () => {
    expect(wpm(100, 0)).toBe(0);
  });

  it("accuracyPercent is correct over total keystrokes", () => {
    expect(accuracyPercent(47, 100)).toBe(47);
  });

  it("accuracyPercent is 100 when nothing was typed", () => {
    expect(accuracyPercent(0, 0)).toBe(100);
  });

  it("the first ever run is not a new best", () => {
    expect(isNewBest(60, null)).toBe(false);
  });

  it("a tie is not a new best", () => {
    expect(isNewBest(60, 60)).toBe(false);
  });

  it("beating the previous best is a new best", () => {
    expect(isNewBest(61, 60)).toBe(true);
  });
});
