import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { STATS_KEY, emptyStats, loadStats, recordRun, saveStats } from "../stats";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

const run = (over: Partial<Parameters<typeof recordRun>[1]> = {}) => ({
  mode: "words-30" as const,
  netWpm: 70,
  rawWpm: 75,
  accuracy: 96,
  day: "2026-10-08",
  keys: { e: { hits: 10, misses: 1 } },
  bulk: 0,
  ...over,
});

describe("stored shape", () => {
  it("is exactly v1 with reserved daily and rain fields", () => {
    expect(emptyStats()).toEqual({
      v: 1,
      runs: 0,
      lastMode: "words-30",
      bests: {},
      keys: {},
      daily: { streak: 0, bestStreak: 0, lastDay: null, days: 0 },
      rain: { best: 0, bestWave: 0 },
      prefs: { ghost: true },
    });
  });
  it("loads empty stats for missing, corrupt, wrong-version or ill-typed data", () => {
    expect(loadStats()).toEqual(emptyStats());
    for (const bad of [
      "{x",
      JSON.stringify({ v: 2 }),
      JSON.stringify({ ...emptyStats(), runs: "3" }),
    ]) {
      localStorage.setItem(STATS_KEY, bad);
      expect(loadStats()).toEqual(emptyStats());
    }
  });
  it("drops unknown mode keys instead of failing the whole load", () => {
    localStorage.setItem(
      STATS_KEY,
      JSON.stringify({
        ...emptyStats(),
        runs: 4,
        bests: {
          "words-45": { wpm: 1, raw: 1, acc: 1, day: "2026-10-08" },
          "words-15": { wpm: 80, raw: 82, acc: 97, day: "2026-10-08" },
        },
      }),
    );
    const s = loadStats();
    expect(s.runs).toBe(4);
    expect(Object.keys(s.bests)).toEqual(["words-15"]);
  });
  it("keeps only single-character key totals, and falls back to the default last mode", () => {
    localStorage.setItem(
      STATS_KEY,
      JSON.stringify({
        ...emptyStats(),
        lastMode: "words-45",
        keys: { e: { hits: 2, misses: 1 }, ee: { hits: 1, misses: 1 } },
      }),
    );
    const s = loadStats();
    expect(s.lastMode).toBe("words-30");
    expect(s.keys).toEqual({ e: { hits: 2, misses: 1 } });
  });
  it("round-trips and never overwrites a newer stored version", () => {
    const s = recordRun(emptyStats(), run());
    saveStats(s);
    expect(loadStats()).toEqual(s);
    localStorage.setItem(STATS_KEY, JSON.stringify({ v: 2 }));
    saveStats(s);
    expect(localStorage.getItem(STATS_KEY)).toBe(JSON.stringify({ v: 2 }));
  });
});

describe("recordRun", () => {
  it("keeps the best net WPM per mode and counts runs", () => {
    let s = recordRun(emptyStats(), run({ netWpm: 70 }));
    s = recordRun(s, run({ netWpm: 65 }));
    s = recordRun(s, run({ mode: "quote", netWpm: 50 }));
    expect(s.runs).toBe(3);
    expect(s.bests["words-30"]?.wpm).toBe(70);
    expect(s.bests.quote?.wpm).toBe(50);
    expect(s.lastMode).toBe("quote");
  });
  it("adds key totals", () => {
    const s = recordRun(recordRun(emptyStats(), run()), run());
    expect(s.keys.e).toEqual({ hits: 20, misses: 2 });
  });
  it("a bulk run counts as played but never sets a best or key totals", () => {
    const s = recordRun(emptyStats(), run({ bulk: 2 }));
    expect(s.runs).toBe(1);
    expect(s.bests).toEqual({});
    expect(s.keys).toEqual({});
  });
});

describe("zero-WPM runs", () => {
  it("count as played but never become the first best", () => {
    const next = recordRun(emptyStats(), run({ netWpm: 0, rawWpm: 0, accuracy: 0 }));
    expect(next.runs).toBe(1);
    expect(next.bests["words-30"]).toBeUndefined();
  });
});

describe("one bad field", () => {
  const good = () => {
    const s = recordRun(emptyStats(), run());
    return JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
  };
  it("resets only runs when runs is corrupted", () => {
    const raw = { ...good(), runs: "many" };
    localStorage.setItem(STATS_KEY, JSON.stringify(raw));
    const s = loadStats();
    expect(s.runs).toBe(0);
    expect(s.bests["words-30"]?.wpm).toBe(70);
    expect(s.keys.e).toEqual({ hits: 10, misses: 1 });
  });
  it("resets only bests when bests is corrupted", () => {
    const raw = { ...good(), bests: 7 };
    localStorage.setItem(STATS_KEY, JSON.stringify(raw));
    const s = loadStats();
    expect(s.bests).toEqual({});
    expect(s.runs).toBe(1);
    expect(s.keys.e).toEqual({ hits: 10, misses: 1 });
  });
  it("resets only keys when keys is corrupted", () => {
    const raw = { ...good(), keys: [] };
    localStorage.setItem(STATS_KEY, JSON.stringify(raw));
    const s = loadStats();
    expect(s.keys).toEqual({});
    expect(s.runs).toBe(1);
    expect(s.bests["words-30"]?.wpm).toBe(70);
  });
});
