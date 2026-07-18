import { describe, expect, it } from "vitest";
import { dailySeed, fnv1a, mulberry32, subSeed } from "../rng";

describe("rng", () => {
  it("fnv1a distinguishes different strings", () => {
    expect(fnv1a("a")).not.toBe(fnv1a("b"));
  });

  it("dailySeed is stable within a local day and changes across days", () => {
    const morning = dailySeed(new Date("2026-07-18T12:00:00"));
    const evening = dailySeed(new Date("2026-07-18T23:00:00"));
    const nextDay = dailySeed(new Date("2026-07-19T12:00:00"));
    expect(morning).toBe(evening);
    expect(morning).not.toBe(nextDay);
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
});
