import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activeStreak,
  EMPTY_STATS,
  HANDLE_MAX,
  loadStats,
  parseStats,
  recordDaily,
  saveStats,
  setHandle,
  STATS_KEY,
  type KnightStats,
} from "../stats";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const with_ = (over: Partial<KnightStats>): KnightStats => ({ ...EMPTY_STATS, ...over });

describe("knight:stats storage", () => {
  it("has its own key and the pinned empty shape", () => {
    expect(STATS_KEY).toBe("knight:stats");
    expect(EMPTY_STATS).toEqual({
      v: 1,
      bestDaily: null,
      runs: 0,
      lastDailyDay: null,
      streakDays: 0,
      bestStreakDays: 0,
      handle: "",
    });
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveStats(EMPTY_STATS);
    expect(window.localStorage.getItem("knight:stats")).toBe(
      '{"v":1,"bestDaily":null,"runs":0,"lastDailyDay":null,"streakDays":0,' +
        '"bestStreakDays":0,"handle":""}',
    );
  });

  it("round-trips a saved record", () => {
    const stats = with_({
      bestDaily: { day: "2026-10-15", score: 118 },
      runs: 9,
      lastDailyDay: "2026-10-15",
      streakDays: 3,
      bestStreakDays: 4,
      handle: "Ada",
    });
    saveStats(stats);
    expect(loadStats()).toEqual(stats);
  });

  it("loads the empty record from empty or blocked storage, as a fresh copy", () => {
    expect(loadStats()).toEqual(EMPTY_STATS);
    expect(loadStats()).not.toBe(EMPTY_STATS);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(loadStats()).toEqual(EMPTY_STATS);
  });

  it("leaves a record a newer build wrote alone", () => {
    window.localStorage.setItem(STATS_KEY, '{"v":2,"future":true}');
    saveStats(with_({ runs: 5 }));
    expect(window.localStorage.getItem(STATS_KEY)).toBe('{"v":2,"future":true}');
  });

  it("survives a refused write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    expect(() => saveStats(with_({ runs: 1 }))).not.toThrow();
  });
});

describe("parseStats", () => {
  it("returns the empty record for non-objects and a wrong version", () => {
    for (const bad of [null, undefined, 7, "x", [], { v: 2, runs: 3 }, { runs: 3 }]) {
      expect(parseStats(bad)).toEqual(EMPTY_STATS);
    }
  });

  it("falls back per field", () => {
    for (const bad of [
      { v: 1, runs: -3 },
      { v: 1, streakDays: Number.POSITIVE_INFINITY },
      { v: 1, bestStreakDays: "9" },
      { v: 1, lastDailyDay: "15/10/2026" },
      { v: 1, bestDaily: { day: "yesterday", score: 5 } },
      { v: 1, bestDaily: { day: "2026-10-15", score: -5 } },
      { v: 1, handle: 12 },
    ]) {
      expect(parseStats(bad)).toEqual(EMPTY_STATS);
    }
  });

  it("keeps the good fields next to a bad one and caps the handle", () => {
    const parsed = parseStats({ v: 1, runs: 4, streakDays: -1, handle: "A very long handle" });
    expect(parsed.runs).toBe(4);
    expect(parsed.streakDays).toBe(0);
    expect(parsed.handle).toHaveLength(HANDLE_MAX);
  });

  it("never lets the best streak sit below the current one", () => {
    expect(parseStats({ v: 1, streakDays: 5, bestStreakDays: 2 }).bestStreakDays).toBe(5);
  });
});

describe("recordDaily", () => {
  it("counts every cleared daily and raises the best only on a strictly higher score", () => {
    let s = recordDaily(EMPTY_STATS, { score: 100, day: "2026-10-15" });
    expect(s).toMatchObject({ runs: 1, bestDaily: { day: "2026-10-15", score: 100 } });
    s = recordDaily(s, { score: 100, day: "2026-10-16" });
    expect(s.bestDaily).toEqual({ day: "2026-10-15", score: 100 }); // a tie keeps the earlier day
    s = recordDaily(s, { score: 90, day: "2026-10-16" });
    expect(s.bestDaily).toEqual({ day: "2026-10-15", score: 100 });
    s = recordDaily(s, { score: 120, day: "2026-10-17" });
    expect(s.bestDaily).toEqual({ day: "2026-10-17", score: 120 });
    expect(s.runs).toBe(4);
  });

  it("does not mutate its input", () => {
    const before = structuredClone(EMPTY_STATS);
    recordDaily(EMPTY_STATS, { score: 50, day: "2026-10-15" });
    expect(EMPTY_STATS).toEqual(before);
  });

  it("builds a streak of consecutive UTC days: a repeat keeps it, the next day extends it, a gap resets it", () => {
    let s = recordDaily(EMPTY_STATS, { score: 10, day: "2026-10-15" });
    expect(s).toMatchObject({ streakDays: 1, bestStreakDays: 1, lastDailyDay: "2026-10-15" });
    s = recordDaily(s, { score: 20, day: "2026-10-15" });
    expect(s).toMatchObject({ streakDays: 1, bestStreakDays: 1 });
    s = recordDaily(s, { score: 20, day: "2026-10-16" });
    s = recordDaily(s, { score: 20, day: "2026-10-17" });
    expect(s).toMatchObject({ streakDays: 3, bestStreakDays: 3 });
    s = recordDaily(s, { score: 20, day: "2026-10-19" });
    expect(s).toMatchObject({ streakDays: 1, bestStreakDays: 3, lastDailyDay: "2026-10-19" });
  });

  it("counts the streak across a month and a year boundary", () => {
    let s = recordDaily(EMPTY_STATS, { score: 10, day: "2026-12-31" });
    s = recordDaily(s, { score: 10, day: "2027-01-01" });
    expect(s.streakDays).toBe(2);
  });

  it("restarts the streak on the run's day when the last day is ahead (a wrong clock)", () => {
    let s = recordDaily(EMPTY_STATS, { score: 10, day: "2026-10-16" });
    s = recordDaily(s, { score: 10, day: "2026-10-15" });
    expect(s).toMatchObject({ streakDays: 1, lastDailyDay: "2026-10-15", bestStreakDays: 1 });
    s = recordDaily(s, { score: 10, day: "2026-10-16" });
    expect(s).toMatchObject({ streakDays: 2, lastDailyDay: "2026-10-16" });
  });
});

describe("activeStreak", () => {
  const s = with_({ lastDailyDay: "2026-10-15", streakDays: 4, bestStreakDays: 6 });

  it("holds today and the day after the last clear", () => {
    expect(activeStreak(s, "2026-10-15")).toBe(4);
    expect(activeStreak(s, "2026-10-16")).toBe(4);
  });

  it("is 0 once a day is skipped, and with no clear yet", () => {
    expect(activeStreak(s, "2026-10-17")).toBe(0);
    expect(activeStreak(EMPTY_STATS, "2026-10-17")).toBe(0);
  });
});

describe("setHandle", () => {
  it("trims to 12 characters and ignores a no-op", () => {
    expect(setHandle(EMPTY_STATS, "Ada Lovelace the First").handle).toBe("Ada Lovelace");
    const named = setHandle(EMPTY_STATS, "Ada");
    expect(setHandle(named, "Ada")).toBe(named);
  });
});
