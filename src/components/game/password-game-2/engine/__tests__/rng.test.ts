import { describe, expect, it } from "vitest";
import {
  dailySeed,
  dailySeedForDay,
  fnv1a,
  mulberry32,
  pickN,
  pickOne,
  rangeInt,
  subSeed,
} from "../rng";

describe("rng", () => {
  it("fnv1a distinguishes different strings", () => {
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });

  it("subSeed forks distinct streams per label", () => {
    expect(subSeed(1, "x")).not.toBe(subSeed(1, "y"));
  });

  it("mulberry32 is deterministic for a given seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  it("mulberry32 diverges for different seeds", () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = [a(), a(), a(), a(), a()];
    const seqB = [b(), b(), b(), b(), b()];
    expect(seqA).not.toEqual(seqB);
  });

  it("pickOne returns an element of the array and throws on empty", () => {
    const rng = mulberry32(7);
    const pool = ["a", "b", "c"] as const;
    for (let i = 0; i < 20; i++) {
      expect(pool).toContain(pickOne(rng, pool));
    }
    expect(() => pickOne(rng, [])).toThrow();
  });

  it("pickN draws without duplicates and caps at pool length", () => {
    const rng = mulberry32(99);
    const pool = [1, 2, 3, 4, 5];
    const five = pickN(rng, pool, 5);
    expect(five).toHaveLength(5);
    expect([...five].sort((x, y) => x - y)).toEqual([...pool].sort((x, y) => x - y));
    expect(new Set(five).size).toBe(5);
    expect(pickN(rng, pool, 99)).toHaveLength(5);
  });

  it("rangeInt stays within inclusive bounds and throws when max < min", () => {
    const rng = mulberry32(2024);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 500; i++) {
      const n = rangeInt(rng, 1, 6);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
      if (n === 1) sawMin = true;
      if (n === 6) sawMax = true;
    }
    expect(sawMin).toBe(true);
    expect(sawMax).toBe(true);
    expect(rangeInt(rng, 5, 5)).toBe(5);
    expect(() => rangeInt(rng, 6, 5)).toThrow();
  });
});

describe("dailySeed (UTC day)", () => {
  it("hashes the UTC calendar day, golden value", () => {
    expect(dailySeed(new Date("2026-10-08T12:00:00Z"))).toBe(fnv1a("pg2-2026-10-08"));
  });

  it("is stable within a UTC day and changes at UTC midnight", () => {
    const early = dailySeed(new Date("2026-10-08T00:00:01Z"));
    const late = dailySeed(new Date("2026-10-08T23:59:59Z"));
    expect(early).toBe(late);
    expect(dailySeed(new Date("2026-10-09T00:00:00Z"))).not.toBe(late);
  });

  it("uses the UTC day even when the local day differs", () => {
    // 02:00Z on the 9th is still the 8th in North America and already the 9th in Asia.
    expect(dailySeed(new Date("2026-10-09T02:00:00Z"))).toBe(fnv1a("pg2-2026-10-09"));
  });

  it("dailySeedForDay hashes a YYYY-MM-DD string directly", () => {
    expect(dailySeedForDay("2026-10-08")).toBe(fnv1a("pg2-2026-10-08"));
  });
});
