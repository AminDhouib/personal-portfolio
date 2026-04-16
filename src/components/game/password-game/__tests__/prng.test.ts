import { describe, it, expect } from "vitest";
import { mulberry32, pickOne, pickN, rangeInt } from "../prng";

describe("mulberry32", () => {
  it("returns numbers between 0 and 1", () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is deterministic for the same seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    for (let i = 0; i < 50; i++) {
      expect(a()).toBe(b());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });
});

describe("pickOne", () => {
  it("picks an element from the array", () => {
    const rng = mulberry32(1);
    const arr = ["a", "b", "c", "d"];
    const v = pickOne(rng, arr);
    expect(arr).toContain(v);
  });

  it("is deterministic with same seed", () => {
    const arr = ["a", "b", "c", "d", "e"];
    const a = pickOne(mulberry32(42), arr);
    const b = pickOne(mulberry32(42), arr);
    expect(a).toBe(b);
  });
});

describe("pickN", () => {
  it("picks N unique elements", () => {
    const rng = mulberry32(1);
    const arr = ["a", "b", "c", "d", "e"];
    const picked = pickN(rng, arr, 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
    picked.forEach((p) => expect(arr).toContain(p));
  });

  it("returns all elements if N >= array length", () => {
    const rng = mulberry32(1);
    const arr = ["a", "b", "c"];
    const picked = pickN(rng, arr, 5);
    expect(picked).toHaveLength(3);
    expect(new Set(picked)).toEqual(new Set(arr));
  });
});

describe("rangeInt", () => {
  it("returns an integer in [min, max]", () => {
    const rng = mulberry32(99);
    for (let i = 0; i < 100; i++) {
      const v = rangeInt(rng, 5, 10);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it("is deterministic for the same seed and bounds", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect(rangeInt(a, 1, 100)).toBe(rangeInt(b, 1, 100));
  });
});
