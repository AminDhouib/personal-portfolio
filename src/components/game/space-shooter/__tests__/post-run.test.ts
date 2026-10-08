import { describe, it, expect } from "vitest";
import { countUp } from "../post-run";

describe("countUp", () => {
  it("is 0 at 0 ms and the target at or past the duration", () => {
    expect(countUp(1234, 0, 900)).toBe(0);
    expect(countUp(1234, 900, 900)).toBe(1234);
    expect(countUp(1234, 5000, 900)).toBe(1234);
  });

  it("is monotone and always an integer", () => {
    let prev = -1;
    for (let ms = 0; ms <= 900; ms += 30) {
      const v = countUp(777, ms, 900);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("eases out: more than half the target is shown at half the time", () => {
    expect(countUp(1000, 450, 900)).toBeGreaterThan(500);
  });

  it("handles a zero target and a zero duration", () => {
    expect(countUp(0, 300, 900)).toBe(0);
    expect(countUp(50, 0, 0)).toBe(50);
  });
});
