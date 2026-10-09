import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_STATS, STATS_KEY, loadStats, parseStats, recordRun, saveStats } from "../stats";

// Pins the failover:stats shape. Changing it later without a migration would
// silently wipe a player's best run.

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const GOOD = { v: 1, bestSeconds: 342, bestScore: 8420, runs: 7, lastDailyDay: "2026-10-09" };

describe("failover:stats", () => {
  it("is its own key", () => {
    expect(STATS_KEY).toBe("failover:stats");
  });

  it("starts empty", () => {
    expect(loadStats()).toEqual({ bestSeconds: 0, bestScore: 0, runs: 0, lastDailyDay: null });
    expect(EMPTY_STATS).toEqual(loadStats());
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveStats({ bestSeconds: 342, bestScore: 8420, runs: 7, lastDailyDay: "2026-10-09" });
    expect(window.localStorage.getItem("failover:stats")).toBe(
      '{"v":1,"bestSeconds":342,"bestScore":8420,"runs":7,"lastDailyDay":"2026-10-09"}',
    );
    saveStats(EMPTY_STATS);
    expect(window.localStorage.getItem("failover:stats")).toBe(
      '{"v":1,"bestSeconds":0,"bestScore":0,"runs":0,"lastDailyDay":null}',
    );
  });

  it("round-trips", () => {
    const stats = { bestSeconds: 61, bestScore: 900, runs: 2, lastDailyDay: null };
    saveStats(stats);
    expect(loadStats()).toEqual(stats);
  });

  it("reads a v1 record and ignores extra fields", () => {
    expect(parseStats(GOOD)).toEqual({
      bestSeconds: 342,
      bestScore: 8420,
      runs: 7,
      lastDailyDay: "2026-10-09",
    });
    expect(parseStats({ ...GOOD, extra: true })).toEqual(parseStats(GOOD));
  });

  it("rejects malformed and hostile records whole", () => {
    for (const raw of [
      null,
      7,
      "x",
      [],
      [GOOD],
      { ...GOOD, v: 2 },
      { ...GOOD, v: "1" },
      { bestSeconds: 1, bestScore: 1, runs: 1, lastDailyDay: null },
      { ...GOOD, bestSeconds: -1 },
      { ...GOOD, bestScore: 1.5 },
      { ...GOOD, runs: "7" },
      { ...GOOD, runs: Infinity },
      { ...GOOD, bestScore: 2 ** 60 },
      { ...GOOD, lastDailyDay: "yesterday" },
      { ...GOOD, lastDailyDay: 20261009 },
      { ...GOOD, lastDailyDay: undefined },
    ]) {
      expect(parseStats(raw)).toBeNull();
    }
  });

  it("loads empty from corrupt JSON, 1e400, a __proto__ payload and blocked storage", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("reportError", vi.fn());
    for (const text of [
      "{not json",
      '{"v":1,"bestSeconds":1e400,"bestScore":0,"runs":0,"lastDailyDay":null}',
      '{"__proto__":{"v":1},"bestSeconds":1,"bestScore":1,"runs":1,"lastDailyDay":null}',
    ]) {
      window.localStorage.setItem("failover:stats", text);
      expect(loadStats()).toEqual(EMPTY_STATS);
    }
    expect(({} as { v?: unknown }).v).toBeUndefined();

    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(loadStats()).toEqual(EMPTY_STATS);
  });

  it("does not overwrite a record a newer build wrote", () => {
    const newer = '{"v":2,"bestSeconds":900,"bestScore":99999,"runs":40,"streak":3}';
    window.localStorage.setItem("failover:stats", newer);
    expect(loadStats()).toEqual(EMPTY_STATS);
    expect(saveStats({ bestSeconds: 1, bestScore: 1, runs: 1, lastDailyDay: null })).toBe(false);
    expect(window.localStorage.getItem("failover:stats")).toBe(newer);
  });

  it("says whether the record was written, so the game shows only what is stored", () => {
    const stats = { bestSeconds: 5, bestScore: 50, runs: 1, lastDailyDay: null };
    expect(saveStats(stats)).toBe(true);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    expect(saveStats({ ...stats, runs: 2 })).toBe(false);
    expect(loadStats()).toEqual(stats);
  });

  it("folds a run in: bests only go up, runs count, fractions floor and junk counts as zero", () => {
    const one = recordRun(EMPTY_STATS, { seconds: 61.9, score: 700.4 });
    expect(one).toEqual({ bestSeconds: 61, bestScore: 700, runs: 1, lastDailyDay: null });
    const two = recordRun(one, { seconds: 30, score: 9000 });
    expect(two).toEqual({ bestSeconds: 61, bestScore: 9000, runs: 2, lastDailyDay: null });
    const three = recordRun(two, { seconds: Number.NaN, score: -5 });
    expect(three).toEqual({ bestSeconds: 61, bestScore: 9000, runs: 3, lastDailyDay: null });
  });
});
