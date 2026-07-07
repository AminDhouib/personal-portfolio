import { describe, it, expect } from "vitest";
import { asNumberArray } from "@/lib/safe-storage";

describe("asNumberArray", () => {
  it("passes through an array of numbers", () => {
    expect(asNumberArray([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("filters a mixed array down to just the numbers", () => {
    expect(asNumberArray([1, "a", 3])).toEqual([1, 3]);
  });

  it("returns [] for a plain object", () => {
    expect(asNumberArray({})).toEqual([]);
  });

  it("returns [] for a number", () => {
    expect(asNumberArray(5)).toEqual([]);
  });

  it("returns [] for null", () => {
    expect(asNumberArray(null)).toEqual([]);
  });

  it("returns [] for undefined", () => {
    expect(asNumberArray(undefined)).toEqual([]);
  });

  it("returns [] for a string", () => {
    expect(asNumberArray("1,2,3")).toEqual([]);
  });
});
