import { describe, it, expect } from "vitest";
import { buildConfetti } from "../confetti";

describe("buildConfetti", () => {
  it("builds exactly count pieces with sequential ids", () => {
    const pieces = buildConfetti(28, 220);
    expect(pieces).toHaveLength(28);
    expect(pieces.map((p) => p.id)).toEqual(Array.from({ length: 28 }, (_, i) => i));
  });

  it("is deterministic: the same arguments give identical pieces", () => {
    expect(buildConfetti(10, 100)).toEqual(buildConfetti(10, 100));
  });

  it("places piece 0 straight right and lifts every piece by 80", () => {
    const [first] = buildConfetti(4, 100);
    expect(first?.dx).toBeCloseTo(70);
    expect(first?.dy).toBeCloseTo(-80);
    expect(first?.rot).toBe(0);
    expect(first?.color).toBe("#22c55e");
  });

  it("cycles the six colours and wraps rotation at 360", () => {
    const pieces = buildConfetti(8, 100);
    expect(pieces[6]?.color).toBe(pieces[0]?.color);
    expect(pieces[7]?.rot).toBe((7 * 53) % 360);
  });

  it("returns an empty list for zero pieces", () => {
    expect(buildConfetti(0, 100)).toEqual([]);
  });
});
