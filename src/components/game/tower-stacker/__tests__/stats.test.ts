import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EMPTY_STATS,
  HANDLE_MAX,
  STATS_KEY,
  activeStreak,
  loadStats,
  markHintSeen,
  parseStats,
  recordRun,
  saveStats,
  setHandle,
  type TowerStats,
} from "../stats";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

const with_ = (over: Partial<TowerStats>): TowerStats => ({ ...EMPTY_STATS, ...over });

describe("tower:stats storage", () => {
  it("has its own key and the pinned empty shape", () => {
    expect(STATS_KEY).toBe("tower:stats");
    expect(EMPTY_STATS).toEqual({
      v: 1,
      bestFree: 0,
      bestDaily: null,
      runs: 0,
      lastDailyDay: null,
      streakDays: 0,
      bestStreakDays: 0,
      seenHint: false,
      handle: "",
    });
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveStats(EMPTY_STATS);
    expect(window.localStorage.getItem("tower:stats")).toBe(
      '{"v":1,"bestFree":0,"bestDaily":null,"runs":0,"lastDailyDay":null,' +
        '"streakDays":0,"bestStreakDays":0,"seenHint":false,"handle":""}',
    );
  });

  it("round-trips a saved record", () => {
    const stats = with_({
      bestFree: 120,
      bestDaily: { day: "2026-10-15", score: 480 },
      runs: 9,
      lastDailyDay: "2026-10-15",
      streakDays: 3,
      bestStreakDays: 4,
      seenHint: true,
      handle: "Ada",
    });
    saveStats(stats);
    expect(loadStats()).toEqual(stats);
  });

  it("loads the empty record from empty or blocked storage", () => {
    expect(loadStats()).toEqual(EMPTY_STATS);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadStats()).toEqual(EMPTY_STATS);
  });

  it("returns a fresh copy of the empty record, not the shared one", () => {
    expect(loadStats()).not.toBe(EMPTY_STATS);
    expect(parseStats(null)).not.toBe(EMPTY_STATS);
  });

  it("skips the save when a newer build wrote the key", () => {
    window.localStorage.setItem(STATS_KEY, '{"v":2,"future":true}');
    saveStats(with_({ runs: 5 }));
    expect(window.localStorage.getItem(STATS_KEY)).toBe('{"v":2,"future":true}');
  });

  it("writes through safeLocalSet, which survives a refused write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveStats(with_({ runs: 1 }))).not.toThrow();
  });
});

describe("parseStats", () => {
  it("returns the empty record for null, non-objects and a wrong version", () => {
    for (const bad of [null, undefined, 7, "x", [], { v: 2, runs: 3 }, { runs: 3 }]) {
      expect(parseStats(bad)).toEqual(EMPTY_STATS);
    }
  });

  it("falls back per field for negative or non-finite numbers and a malformed day", () => {
    for (const bad of [
      { v: 1, runs: -3 },
      { v: 1, bestFree: Number.NaN },
      { v: 1, streakDays: Number.POSITIVE_INFINITY },
      { v: 1, bestStreakDays: "9" },
      { v: 1, lastDailyDay: "15/10/2026" },
      { v: 1, bestDaily: { day: "yesterday", score: 5 } },
      { v: 1, bestDaily: { day: "2026-10-15", score: -5 } },
      { v: 1, seenHint: "yes" },
      { v: 1, handle: 12 },
    ]) {
      expect(parseStats(bad)).toEqual(EMPTY_STATS);
    }
  });

  it("keeps the good fields next to a bad one and caps the handle", () => {
    const parsed = parseStats({
      v: 1,
      runs: 4,
      bestFree: -1,
      handle: "A very long handle indeed",
    });
    expect(parsed.runs).toBe(4);
    expect(parsed.bestFree).toBe(0);
    expect(parsed.handle).toBe("A very long ");
    expect(parsed.handle).toHaveLength(HANDLE_MAX);
  });

  it("never lets the best streak sit below the current one", () => {
    expect(parseStats({ v: 1, streakDays: 5, bestStreakDays: 2 }).bestStreakDays).toBe(5);
  });
});

describe("recordRun", () => {
  it("counts every run and raises a best only on a strictly higher score", () => {
    let s = recordRun(EMPTY_STATS, { mode: "free", score: 100, day: "2026-10-15" });
    expect(s).toMatchObject({ runs: 1, bestFree: 100, bestDaily: null });
    s = recordRun(s, { mode: "free", score: 100, day: "2026-10-15" });
    expect(s).toMatchObject({ runs: 2, bestFree: 100 });
    s = recordRun(s, { mode: "free", score: 90, day: "2026-10-15" });
    expect(s.bestFree).toBe(100);
    s = recordRun(s, { mode: "daily", score: 300, day: "2026-10-15" });
    expect(s.bestDaily).toEqual({ day: "2026-10-15", score: 300 });
    s = recordRun(s, { mode: "daily", score: 300, day: "2026-10-16" });
    expect(s.bestDaily).toEqual({ day: "2026-10-15", score: 300 }); // a tie keeps the earlier day
    s = recordRun(s, { mode: "daily", score: 310, day: "2026-10-16" });
    expect(s.bestDaily).toEqual({ day: "2026-10-16", score: 310 });
    expect(s.runs).toBe(6);
    expect(s.bestFree).toBe(100); // a daily run never touches the free best
  });

  it("does not mutate its input", () => {
    const before = structuredClone(EMPTY_STATS);
    recordRun(EMPTY_STATS, { mode: "daily", score: 50, day: "2026-10-15" });
    expect(EMPTY_STATS).toEqual(before);
  });

  it("builds a daily streak: a repeat day keeps it, the next day extends it, a gap resets it", () => {
    let s = recordRun(EMPTY_STATS, { mode: "daily", score: 10, day: "2026-10-15" });
    expect(s).toMatchObject({ streakDays: 1, bestStreakDays: 1, lastDailyDay: "2026-10-15" });
    s = recordRun(s, { mode: "daily", score: 20, day: "2026-10-15" });
    expect(s).toMatchObject({ streakDays: 1, bestStreakDays: 1 });
    s = recordRun(s, { mode: "daily", score: 20, day: "2026-10-16" });
    expect(s).toMatchObject({ streakDays: 2, bestStreakDays: 2, lastDailyDay: "2026-10-16" });
    s = recordRun(s, { mode: "daily", score: 20, day: "2026-10-17" });
    expect(s.streakDays).toBe(3);
    s = recordRun(s, { mode: "daily", score: 20, day: "2026-10-19" }); // 18th skipped
    expect(s).toMatchObject({ streakDays: 1, bestStreakDays: 3, lastDailyDay: "2026-10-19" });
  });

  it("counts the streak across a month and a year boundary", () => {
    let s = recordRun(EMPTY_STATS, { mode: "daily", score: 10, day: "2026-12-31" });
    s = recordRun(s, { mode: "daily", score: 10, day: "2027-01-01" });
    expect(s.streakDays).toBe(2);
  });

  it("a free build never extends or breaks the streak", () => {
    let s = recordRun(EMPTY_STATS, { mode: "daily", score: 10, day: "2026-10-15" });
    s = recordRun(s, { mode: "free", score: 500, day: "2026-10-16" });
    expect(s).toMatchObject({ streakDays: 1, lastDailyDay: "2026-10-15" });
  });

  it("a clock that moved backwards does not pull the streak back", () => {
    let s = recordRun(EMPTY_STATS, { mode: "daily", score: 10, day: "2026-10-16" });
    s = recordRun(s, { mode: "daily", score: 10, day: "2026-10-15" });
    expect(s).toMatchObject({ streakDays: 1, lastDailyDay: "2026-10-16" });
    expect(s.runs).toBe(2);
  });
});

describe("activeStreak", () => {
  const s = with_({ lastDailyDay: "2026-10-15", streakDays: 4, bestStreakDays: 6 });
  it("holds today and the day after the last tower", () => {
    expect(activeStreak(s, "2026-10-15")).toBe(4);
    expect(activeStreak(s, "2026-10-16")).toBe(4);
  });
  it("is 0 once a day is skipped, and with no tower yet", () => {
    expect(activeStreak(s, "2026-10-17")).toBe(0);
    expect(activeStreak(EMPTY_STATS, "2026-10-17")).toBe(0);
  });
});

describe("hint and handle", () => {
  it("markHintSeen sets the flag and returns the same object when already set", () => {
    const seen = markHintSeen(EMPTY_STATS);
    expect(seen.seenHint).toBe(true);
    expect(markHintSeen(seen)).toBe(seen);
  });

  it("setHandle trims to 12 characters and ignores a no-op", () => {
    expect(setHandle(EMPTY_STATS, "Ada Lovelace the First").handle).toBe("Ada Lovelace");
    const named = setHandle(EMPTY_STATS, "Ada");
    expect(setHandle(named, "Ada")).toBe(named);
  });
});
