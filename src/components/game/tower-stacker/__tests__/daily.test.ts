// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fnv1a } from "../../password-game-2/engine/rng";
import { DAILY_SEED_PREFIX, dailyTowerSeed, dayNumber, freeSeed } from "../daily";
import { swingFor } from "../engine";

describe("dailyTowerSeed", () => {
  it("hashes the versioned UTC day (golden)", () => {
    expect(DAILY_SEED_PREFIX).toBe("tower-daily-v1-");
    expect(dailyTowerSeed("2026-10-15")).toBe(646_338_190);
    expect(dailyTowerSeed("2026-10-15")).toBe(fnv1a("tower-daily-v1-2026-10-15"));
  });

  it("gives that day's first block a fixed swing (golden)", () => {
    const s = swingFor(dailyTowerSeed("2026-10-15"), 1, 0, 0);
    expect(s.dir).toBe(-1);
    expect(s.tone).toBe(1);
    expect(s.speed).toBeCloseTo(0.296292, 5);
    expect(s.phase).toBeCloseTo(0.129545, 5);
  });

  it("differs between days", () => {
    expect(dailyTowerSeed("2026-10-15")).not.toBe(dailyTowerSeed("2026-10-16"));
  });
});

describe("dayNumber", () => {
  it("is the YYYYMMDD integer the arcade detail carries", () => {
    expect(dayNumber("2026-10-15")).toBe(20261015);
  });
});

describe("freeSeed", () => {
  it("hashes a shared seed text into a free-build seed, apart from the daily space", () => {
    expect(freeSeed("abc")).toBe(fnv1a("tower-free-abc"));
    expect(freeSeed("2026-10-15")).not.toBe(dailyTowerSeed("2026-10-15"));
  });
});
