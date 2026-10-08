import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATS_KEY, emptyStats, loadStats, recordRun, saveStats, streakAsOf } from "../stats";

beforeEach(() => localStorage.clear());
afterEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe("loadStats tolerance", () => {
  it("returns empty stats for missing, corrupt, or wrong-version data", () => {
    expect(loadStats()).toEqual(emptyStats());
    localStorage.setItem(STATS_KEY, "{not json");
    expect(loadStats()).toEqual(emptyStats());
    localStorage.setItem(STATS_KEY, JSON.stringify({ v: 99, bestMs: 1 }));
    expect(loadStats()).toEqual(emptyStats());
    localStorage.setItem(STATS_KEY, JSON.stringify({ v: 1, bestMs: "fast" }));
    expect(loadStats()).toEqual(emptyStats());
  });

  it("round-trips a saved payload", () => {
    const s = recordRun(emptyStats(), { ms: 600_000, daily: false, day: "2026-10-08", seed: 7 });
    saveStats(s);
    expect(loadStats()).toEqual(s);
  });
});

describe("recordRun", () => {
  it("tracks personal best time and run count", () => {
    let s = recordRun(emptyStats(), { ms: 900_000, daily: false, day: "2026-10-08", seed: 1 });
    s = recordRun(s, { ms: 700_000, daily: false, day: "2026-10-08", seed: 2 });
    s = recordRun(s, { ms: 800_000, daily: false, day: "2026-10-08", seed: 3 });
    expect(s.bestMs).toBe(700_000);
    expect(s.runs).toBe(3);
  });

  it("only daily runs move the streak and the daily best", () => {
    const s = recordRun(emptyStats(), { ms: 1, daily: false, day: "2026-10-08", seed: 1 });
    expect(s.streak).toBe(0);
    expect(s.dailyBestMs).toBeNull();
  });

  it("extends the streak on consecutive UTC days, keeps it on a repeat day, resets on a gap", () => {
    let s = recordRun(emptyStats(), { ms: 5, daily: true, day: "2026-10-08", seed: 1 });
    expect(s.streak).toBe(1);
    s = recordRun(s, { ms: 5, daily: true, day: "2026-10-08", seed: 1 });
    expect(s.streak).toBe(1);
    s = recordRun(s, { ms: 5, daily: true, day: "2026-10-09", seed: 2 });
    expect(s.streak).toBe(2);
    expect(s.bestStreak).toBe(2);
    s = recordRun(s, { ms: 5, daily: true, day: "2026-10-12", seed: 3 });
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
  });

  it("handles month and year boundaries", () => {
    let s = recordRun(emptyStats(), { ms: 5, daily: true, day: "2026-12-31", seed: 1 });
    s = recordRun(s, { ms: 5, daily: true, day: "2027-01-01", seed: 2 });
    expect(s.streak).toBe(2);
  });

  it("keeps only the last 14 daily results", () => {
    let s = emptyStats();
    for (let d = 1; d <= 20; d++) {
      s = recordRun(s, {
        ms: d * 1000,
        daily: true,
        day: `2026-10-${String(d).padStart(2, "0")}`,
        seed: d,
      });
    }
    expect(s.history).toHaveLength(14);
    expect(s.history[0]!.day).toBe("2026-10-07");
  });
});

describe("streakAsOf", () => {
  it("shows a live streak through today and yesterday, zero after a missed day", () => {
    let s = recordRun(emptyStats(), { ms: 5, daily: true, day: "2026-10-08", seed: 1 });
    expect(streakAsOf(s, "2026-10-08")).toBe(1);
    expect(streakAsOf(s, "2026-10-09")).toBe(1); // today's run still to come
    expect(streakAsOf(s, "2026-10-10")).toBe(0);
    s = emptyStats();
    expect(streakAsOf(s, "2026-10-08")).toBe(0);
  });
});

describe("newer stored version", () => {
  const newer = JSON.stringify({ v: 99, bestMs: 1, extra: "from a newer build" });

  it("reads as empty and leaves the stored value untouched on save", () => {
    localStorage.setItem(STATS_KEY, newer);
    expect(loadStats()).toEqual(emptyStats());
    saveStats(recordRun(emptyStats(), { ms: 5, daily: true, day: "2026-10-08", seed: 1 }));
    expect(localStorage.getItem(STATS_KEY)).toBe(newer);
  });

  it("still overwrites corrupt or older-shaped values", () => {
    localStorage.setItem(STATS_KEY, "{not json");
    const s = recordRun(emptyStats(), { ms: 5, daily: false, day: "2026-10-08", seed: 1 });
    saveStats(s);
    expect(loadStats()).toEqual(s);
  });
});

describe("a backwards clock", () => {
  it("resets the streak to the run day when the last daily is ahead", () => {
    let s = recordRun(emptyStats(), { ms: 5, daily: true, day: "2026-10-19", seed: 1 });
    s = recordRun(s, { ms: 5, daily: true, day: "2026-10-20", seed: 2 });
    expect(s.streak).toBe(2);
    s = recordRun(s, { ms: 5, daily: true, day: "2026-10-10", seed: 3 });
    expect(s.streak).toBe(1);
    expect(s.bestStreak).toBe(2);
    expect(s.lastDailyDay).toBe("2026-10-10");
    s = recordRun(s, { ms: 5, daily: true, day: "2026-10-11", seed: 4 });
    expect(s.streak).toBe(2);
  });

  it("does not show a streak whose last day is in the future", () => {
    const s = recordRun(emptyStats(), { ms: 5, daily: true, day: "2026-10-20", seed: 1 });
    expect(streakAsOf(s, "2026-10-10")).toBe(0);
  });
});

describe("history order", () => {
  it("keeps days in order and never lets a back-dated entry evict newer days", () => {
    let s = emptyStats();
    for (let d = 10; d <= 23; d++) {
      s = recordRun(s, { ms: 5, daily: true, day: `2026-10-${d}`, seed: d });
    }
    expect(s.history).toHaveLength(14);
    s = recordRun(s, { ms: 5, daily: true, day: "2026-10-01", seed: 1 });
    expect(s.history).toHaveLength(14);
    const days = s.history.map((h) => h.day);
    expect(days).toContain("2026-10-23");
    expect(days).not.toContain("2026-10-01");
    expect(days).toEqual([...days].sort());
  });
});

describe("reporting a corrupt value", () => {
  it("reports once per page load, and never reports a newer version", async () => {
    vi.resetModules();
    const fresh = await import("../stats");
    const err = vi.fn();
    vi.stubGlobal("reportError", err);
    localStorage.setItem(fresh.STATS_KEY, "{not json");
    fresh.loadStats();
    fresh.loadStats();
    fresh.saveStats(fresh.emptyStats());
    expect(err).toHaveBeenCalledTimes(1);
    err.mockClear();
    localStorage.setItem(fresh.STATS_KEY, JSON.stringify({ v: 99 }));
    fresh.loadStats();
    fresh.saveStats(fresh.emptyStats());
    expect(err).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
