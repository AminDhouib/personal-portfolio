import { describe, it, expect, beforeEach } from "vitest";
import {
  EMPTY_STATS,
  LV8_SECONDS_PER_ROUND_CAP,
  STATS_KEY,
  loadStats,
  parseStats,
  recordRound,
  saveStats,
} from "../stats";

beforeEach(() => {
  window.localStorage.clear();
});

describe("stats storage", () => {
  it("has its own key and the pinned empty shape", () => {
    expect(STATS_KEY).toBe("svf:stats");
    expect(EMPTY_STATS).toEqual({
      rounds: { played: 0, won: 0, lost: 0, quit: 0 },
      assistedRounds: 0,
      coins: { total: 0, best: 0 },
      highestLevel: 1,
      lv8Seconds: 0,
      streak: { current: 0, best: 0, lastDay: null },
      dailyPlayed: 0,
    });
  });

  it("writes exactly this JSON (the pinned stored shape)", () => {
    saveStats(EMPTY_STATS);
    expect(window.localStorage.getItem("svf:stats")).toBe(
      '{"v":1,"rounds":{"played":0,"won":0,"lost":0,"quit":0},"assistedRounds":0,' +
        '"coins":{"total":0,"best":0},"highestLevel":1,"lv8Seconds":0,' +
        '"streak":{"current":0,"best":0,"lastDay":null},"dailyPlayed":0}',
    );
  });

  it("round-trips", () => {
    const stats = { ...EMPTY_STATS, assistedRounds: 2, highestLevel: 6, dailyPlayed: 3 };
    saveStats(stats);
    expect(loadStats()).toEqual(stats);
  });

  it("falls back to the empty stats for unreadable or foreign data", () => {
    for (const raw of [null, 3, "x", [], { v: 2 }, { rounds: {} }]) {
      expect(parseStats(raw)).toEqual(EMPTY_STATS);
    }
    window.localStorage.setItem("svf:stats", "{nope");
    expect(loadStats()).toEqual(EMPTY_STATS);
  });

  it("clamps and repairs bad numbers instead of trusting them", () => {
    const parsed = parseStats({
      v: 1,
      rounds: { played: -5, won: 2.7, lost: "x", quit: 4 },
      assistedRounds: 1,
      coins: { total: 1e12, best: -1 },
      highestLevel: 99,
      lv8Seconds: -3,
      streak: { current: 2, best: 1, lastDay: "not a day" },
      dailyPlayed: 5,
    });
    expect(parsed.rounds).toEqual({ played: 0, won: 2, lost: 0, quit: 4 });
    expect(parsed.coins.total).toBe(999_999_999);
    expect(parsed.coins.best).toBe(0);
    expect(parsed.highestLevel).toBe(8);
    expect(parsed.lv8Seconds).toBe(0);
    // best can never be below current
    expect(parsed.streak).toEqual({ current: 2, best: 2, lastDay: null });
  });
});

describe("stats storage, repairs and guards", () => {
  it("repairs each rounds count on its own", () => {
    const parsed = parseStats({
      ...EMPTY_STATS,
      v: 1,
      rounds: { played: 5, won: "x", lost: 2, quit: null },
    });
    expect(parsed.rounds).toEqual({ played: 5, won: 0, lost: 2, quit: 0 });
  });

  it("does not write over a value stored by a newer version", () => {
    const newer = '{"v":2,"rounds":{"played":9}}';
    window.localStorage.setItem("svf:stats", newer);
    saveStats(EMPTY_STATS);
    expect(window.localStorage.getItem("svf:stats")).toBe(newer);
  });
});

describe("recordRound", () => {
  const round = { outcome: "won" as const, coins: 48, level: 3, assisted: false, seconds: 40 };

  it("counts a won round", () => {
    const next = recordRound(EMPTY_STATS, round);
    expect(next.rounds).toEqual({ played: 1, won: 1, lost: 0, quit: 0 });
    expect(next.coins).toEqual({ total: 48, best: 48 });
    expect(next.highestLevel).toBe(3);
  });

  it("counts a lost round as played and lost, with no coins", () => {
    const next = recordRound(EMPTY_STATS, { ...round, outcome: "lost", coins: 0 });
    expect(next.rounds).toEqual({ played: 1, won: 0, lost: 1, quit: 0 });
    expect(next.coins).toEqual({ total: 0, best: 0 });
  });

  it("counts a quit with the coins it banked", () => {
    const next = recordRound(EMPTY_STATS, { ...round, outcome: "quit", coins: 6 });
    expect(next.rounds.quit).toBe(1);
    expect(next.coins).toEqual({ total: 6, best: 6 });
  });

  it("keeps the best single round and a running total", () => {
    let s = recordRound(EMPTY_STATS, round);
    s = recordRound(s, { ...round, coins: 12 });
    expect(s.coins).toEqual({ total: 60, best: 48 });
  });

  it("an assisted round counts as played and assisted only", () => {
    const next = recordRound(EMPTY_STATS, { ...round, assisted: true });
    expect(next.rounds).toEqual({ played: 1, won: 0, lost: 0, quit: 0 });
    expect(next.assistedRounds).toBe(1);
    expect(next.coins).toEqual({ total: 0, best: 0 });
  });

  it("highest level counts every round, assisted or not, and never goes down", () => {
    let s = recordRound(EMPTY_STATS, { ...round, level: 5, assisted: true });
    expect(s.highestLevel).toBe(5);
    s = recordRound(s, { ...round, level: 2 });
    expect(s.highestLevel).toBe(5);
  });

  it("adds time for any round that began at Lv.8, capped per round", () => {
    const at8 = recordRound(EMPTY_STATS, { ...round, level: 8, seconds: 90 });
    expect(at8.lv8Seconds).toBe(90);
    const below = recordRound(EMPTY_STATS, { ...round, level: 7, seconds: 90 });
    expect(below.lv8Seconds).toBe(0);
    const long = recordRound(EMPTY_STATS, { ...round, level: 8, seconds: 999_999 });
    expect(long.lv8Seconds).toBe(LV8_SECONDS_PER_ROUND_CAP);
  });

  it("highest level takes the level after the result as well as the start level", () => {
    const up = recordRound(EMPTY_STATS, { ...round, level: 4, levelAfter: 5 });
    expect(up.highestLevel).toBe(5);
    const down = recordRound(up, { ...round, level: 5, levelAfter: 2 });
    expect(down.highestLevel).toBe(5);
  });

  it("does not mutate its input", () => {
    const before = JSON.stringify(EMPTY_STATS);
    recordRound(EMPTY_STATS, round);
    expect(JSON.stringify(EMPTY_STATS)).toBe(before);
  });
});
