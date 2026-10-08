// @vitest-environment node
import { describe, expect, it } from "vitest";
import { graphPath, niceMax } from "../graph-path";

describe("graphPath", () => {
  it("is empty for no values", () => {
    expect(graphPath([], { w: 100, h: 50, max: 100 })).toBe("");
  });
  it("spaces x evenly across the width and maps max to the top", () => {
    expect(graphPath([0, 50, 100], { w: 100, h: 50, max: 100 })).toBe("M0,50 L50,25 L100,0");
  });
  it("rounds to one decimal", () => {
    expect(graphPath([10, 20, 30], { w: 100, h: 33, max: 60 })).toBe("M0,27.5 L50,22 L100,16.5");
    expect(graphPath([1, 2, 3, 4], { w: 10, h: 10, max: 7 })).toBe(
      "M0,8.6 L3.3,7.1 L6.7,5.7 L10,4.3",
    );
  });
  it("draws a single value as a flat line across the width", () => {
    expect(graphPath([50], { w: 100, h: 50, max: 100 })).toBe("M0,25 L100,25");
  });
  it("clamps values above max to the top and below zero to the bottom", () => {
    expect(graphPath([200, -5], { w: 10, h: 10, max: 100 })).toBe("M0,0 L10,10");
  });
});

describe("niceMax", () => {
  it("rounds the peak up to the next multiple of 20 with a minimum of 40", () => {
    expect(niceMax([])).toBe(40);
    expect(niceMax([0, 12])).toBe(40);
    expect(niceMax([40])).toBe(40);
    expect(niceMax([41])).toBe(60);
    expect(niceMax([10, 99.5, 30])).toBe(100);
    expect(niceMax([100])).toBe(100);
  });
});
