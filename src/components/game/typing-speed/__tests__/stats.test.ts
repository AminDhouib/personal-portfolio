import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  STATS_KEY,
  emptyStats,
  loadStats,
  recordDay,
  recordRain,
  recordRun,
  saveStats,
  streakAsOf,
} from "../stats";

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

describe("daily mode and the last mode", () => {
  it("counts a daily run and its best but never makes daily the last mode", () => {
    const before = recordRun(emptyStats(), run({ mode: "quote" }));
    const after = recordRun(before, run({ mode: "daily", netWpm: 80 }));
    expect(after.runs).toBe(2);
    expect(after.lastMode).toBe("quote");
    expect(after.bests.daily?.wpm).toBe(80);
  });
});

describe("daily streak (UTC days)", () => {
  it("starts at one, ignores a repeat of the same day and extends on the next day", () => {
    let s = recordDay(emptyStats(), "2026-10-08");
    expect(s.daily).toEqual({ streak: 1, bestStreak: 1, lastDay: "2026-10-08", days: 1 });
    s = recordDay(s, "2026-10-08");
    expect(s.daily).toEqual({ streak: 1, bestStreak: 1, lastDay: "2026-10-08", days: 1 });
    s = recordDay(s, "2026-10-09");
    expect(s.daily).toEqual({ streak: 2, bestStreak: 2, lastDay: "2026-10-09", days: 2 });
  });

  it("restarts at one after a gap and keeps the best streak", () => {
    let s = recordDay(recordDay(emptyStats(), "2026-10-08"), "2026-10-09");
    s = recordDay(s, "2026-10-12");
    expect(s.daily).toEqual({ streak: 1, bestStreak: 2, lastDay: "2026-10-12", days: 3 });
  });

  it("restarts on the run day when the last day is ahead (a wrong clock once)", () => {
    const s = recordDay(recordDay(emptyStats(), "2026-10-20"), "2026-10-08");
    expect(s.daily.streak).toBe(1);
    expect(s.daily.lastDay).toBe("2026-10-08");
  });

  it("rolls across a month and a year end", () => {
    expect(recordDay(recordDay(emptyStats(), "2026-12-31"), "2027-01-01").daily.streak).toBe(2);
    expect(recordDay(recordDay(emptyStats(), "2028-02-28"), "2028-02-29").daily.streak).toBe(2);
  });

  it("streakAsOf lapses once a whole UTC day passes", () => {
    const s = recordDay(recordDay(emptyStats(), "2026-10-08"), "2026-10-09");
    expect(streakAsOf(s, "2026-10-09")).toBe(2);
    expect(streakAsOf(s, "2026-10-10")).toBe(2); // yesterday's still counts until today ends
    expect(streakAsOf(s, "2026-10-11")).toBe(0);
    expect(streakAsOf(emptyStats(), "2026-10-11")).toBe(0);
  });

  it("does not mutate its input", () => {
    const s = emptyStats();
    recordDay(s, "2026-10-08");
    expect(s.daily.streak).toBe(0);
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

describe("recordRain", () => {
  it("keeps the best score and the best wave on their own", () => {
    const a = recordRain(emptyStats(), { score: 120, wave: 3, bulk: false });
    expect(a.rain).toEqual({ best: 120, bestWave: 3 });
    const b = recordRain(a, { score: 90, wave: 5, bulk: false });
    expect(b.rain).toEqual({ best: 120, bestWave: 5 });
    const c = recordRain(b, { score: 200, wave: 2, bulk: false });
    expect(c.rain).toEqual({ best: 200, bestWave: 5 });
  });
  it("ignores a bulk run", () => {
    const s = recordRain(emptyStats(), { score: 500, wave: 9, bulk: true });
    expect(s.rain).toEqual({ best: 0, bestWave: 0 });
  });
  it("touches nothing but rain, and never mutates its input", () => {
    const before = recordRun(emptyStats(), run({ mode: "quote" }));
    const frozen = structuredClone(before);
    const after = recordRain(before, { score: 50, wave: 2, bulk: false });
    expect(before).toEqual(frozen);
    expect({ ...after, rain: before.rain }).toEqual(before);
    expect(localStorage.getItem("typing-high-score")).toBeNull();
  });
  it("loads Word Rain back as the last mode", () => {
    saveStats({ ...emptyStats(), lastMode: "rain" });
    expect(loadStats().lastMode).toBe("rain");
  });
});
