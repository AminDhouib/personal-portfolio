import { describe, it, expect } from "vitest";
import { shakeOffset } from "../shake";

describe("shakeOffset", () => {
  it("draws x before y and scales each by the amplitude", () => {
    const draws = [0.75, 0.25];
    let i = 0;
    const { dx, dy } = shakeOffset(10, () => draws[i++] ?? 0);
    expect(dx).toBe(5);
    expect(dy).toBe(-5);
    expect(i).toBe(2);
  });

  it("stays within +/- amp and is zero at amplitude zero", () => {
    expect(shakeOffset(0, () => 0.9)).toEqual({ dx: 0, dy: 0 });
    const lo = shakeOffset(4, () => 0);
    expect(lo).toEqual({ dx: -4, dy: -4 });
  });
});
