import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENTS } from "@/components/game/achievements";
import { parseStats as parseFailoverStats } from "@/components/game/failover/stats";
import { TOWER_IDS } from "@/components/game/script-knight/engine/towers";
import {
  FLOORS_PER_TOWER,
  PROGRESS_KEY,
  parseProgress as parseKnightProgress,
} from "@/components/game/script-knight/progress";
import { STATS_KEY, parseStats as parseKnightStats } from "@/components/game/script-knight/stats";
import {
  MAX_LEVEL,
  MAX_TOTAL_SCORE,
  parseProgress,
} from "@/components/game/super-voltorb-flip/progress";
import {
  ACHIEVEMENT_TOTAL,
  HUB_STAT_KEYS,
  buildDeviceStats,
  KNIGHT_FLOOR_TOTAL,
  hasAnyStats,
  parseFailoverBest,
  parseHextrisBest,
  parseKnightBestDaily,
  parseKnightFloors,
  parseOrbitalProfile,
  parseScoreString,
  parseTowerStats,
  parseVoltorbProgress,
  readDeviceStatsSnapshot,
  statChips,
  subscribeToDeviceStats,
  type RawStats,
} from "../hub-stats";

type Key = (typeof HUB_STAT_KEYS)[number];

function raw(values: Partial<Record<Key, string>> = {}): RawStats {
  return {
    "space-shooter-hs": values["space-shooter-hs"] ?? null,
    "orbital-dodge-profile": values["orbital-dodge-profile"] ?? null,
    hextris_highscores: values.hextris_highscores ?? null,
    "svf:progress": values["svf:progress"] ?? null,
    "typing-high-score": values["typing-high-score"] ?? null,
    "tower:stats": values["tower:stats"] ?? null,
    "knight:progress": values["knight:progress"] ?? null,
    "knight:stats": values["knight:stats"] ?? null,
    "failover:stats": values["failover:stats"] ?? null,
  };
}

const EMPTY = {
  orbitalBest: null,
  orbitalRuns: null,
  orbitalAchievements: null,
  hextrisBest: null,
  voltorb: null,
  typingBest: null,
  towerDaily: null,
  towerFree: null,
  knight: null,
  failover: null,
};

const SEEDED = raw({
  "space-shooter-hs": "48210",
  "orbital-dodge-profile": JSON.stringify({
    totalRunsPlayed: 12,
    unlockedAchievements: ["first-death"],
  }),
  hextris_highscores: JSON.stringify([9100, 400]),
  "svf:progress": JSON.stringify({ currentLevel: 4, totalScore: 1200 }),
  "typing-high-score": "87",
});

function seed(values: Partial<Record<Key, string>>) {
  for (const [key, value] of Object.entries(values)) localStorage.setItem(key, value);
}

describe("HUB_STAT_KEYS", () => {
  it("is exactly the nine keys the hub may read", () => {
    expect([...HUB_STAT_KEYS].sort()).toEqual(
      [
        "failover:stats",
        "hextris_highscores",
        "knight:progress",
        "knight:stats",
        "orbital-dodge-profile",
        "space-shooter-hs",
        "svf:progress",
        "tower:stats",
        "typing-high-score",
      ].sort(),
    );
  });
});

describe("parseScoreString", () => {
  it("accepts a plain positive integer up to ten million", () => {
    expect(parseScoreString("48210")).toBe(48210);
    expect(parseScoreString("10000000")).toBe(10_000_000);
    expect(parseScoreString("1")).toBe(1);
  });

  it("ignores everything else", () => {
    for (const value of [
      null,
      "",
      "0",
      "-5",
      "12.5",
      "1e5",
      "abc",
      " 12",
      "12 ",
      "10000001",
      "123456789",
      "0x10",
    ]) {
      expect(parseScoreString(value), String(value)).toBeNull();
    }
  });
});

describe("parseHextrisBest", () => {
  it("reads the first (best) entry", () => {
    expect(parseHextrisBest("[9100,400,12]")).toBe(9100);
  });

  it("ignores an empty list, a zero, a non-integer, a string, an oversize value and a non-array", () => {
    for (const value of [
      null,
      "[]",
      "[0]",
      "[1.5]",
      '["9"]',
      "[10000001]",
      "[-3]",
      '{"a":1}',
      "7",
      "null",
    ]) {
      expect(parseHextrisBest(value), String(value)).toBeNull();
    }
  });

  it("treats corrupt JSON as empty, quietly", () => {
    const report = vi.spyOn(globalThis, "reportError");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(parseHextrisBest("{oops")).toBeNull();
    expect(report).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    report.mockRestore();
    consoleError.mockRestore();
  });
});

describe("parseOrbitalProfile", () => {
  it("counts runs and the unique known achievements", () => {
    const profile = JSON.stringify({
      totalRunsPlayed: 12,
      unlockedAchievements: ["first-death", "first-death", "not-a-real-id", 7],
      walletCoins: 999,
    });
    expect(parseOrbitalProfile(profile)).toEqual({ runs: 12, achievements: 1 });
  });

  it("needs at least one run, so a freshly opened game shows nothing", () => {
    expect(parseOrbitalProfile(JSON.stringify({ totalRunsPlayed: 0 }))).toBeNull();
  });

  it("ignores bad run counts", () => {
    for (const value of ['"5"', "-1", "2.5", "10000001", "null", "[]"]) {
      expect(parseOrbitalProfile(`{"totalRunsPlayed":${value}}`), value).toBeNull();
    }
    expect(parseOrbitalProfile(null)).toBeNull();
    expect(parseOrbitalProfile("{oops")).toBeNull();
  });

  it("counts zero achievements when the list is missing or not a list", () => {
    expect(parseOrbitalProfile('{"totalRunsPlayed":3}')).toEqual({ runs: 3, achievements: 0 });
    expect(parseOrbitalProfile('{"totalRunsPlayed":3,"unlockedAchievements":"all"}')).toEqual({
      runs: 3,
      achievements: 0,
    });
  });

  it("never exposes the wallet", () => {
    const parsed = parseOrbitalProfile('{"totalRunsPlayed":3,"walletCoins":500}');
    expect(parsed).not.toHaveProperty("walletCoins");
  });

  it("totals against the real achievement list", () => {
    expect(ACHIEVEMENT_TOTAL).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENT_TOTAL).toBeGreaterThan(0);
  });
});

describe("parseVoltorbProgress parity with the game's zod schema", () => {
  const CASES: unknown[] = [
    { currentLevel: 4, totalScore: 1200 },
    { currentLevel: 0, totalScore: 10 },
    { currentLevel: 99, totalScore: 10 },
    { currentLevel: -3, totalScore: 10 },
    { currentLevel: 5, totalScore: -1 },
    { currentLevel: 5, totalScore: 100000 },
    { currentLevel: 5, totalScore: 99999 },
    { currentLevel: 1.5, totalScore: 10 },
    { currentLevel: 5, totalScore: 2.5 },
    { currentLevel: "5", totalScore: 10 },
    { currentLevel: 5 },
    { totalScore: 10 },
    {},
    null,
    [],
    "text",
  ];

  for (const value of CASES) {
    it(`agrees on ${JSON.stringify(value)}`, () => {
      const zod = parseProgress(value);
      const expected = zod === null ? null : { level: zod.currentLevel, coins: zod.totalScore };
      expect(parseVoltorbProgress(JSON.stringify(value))).toEqual(expected);
    });
  }

  it("clamps to the game's own limits", () => {
    expect(
      parseVoltorbProgress(
        JSON.stringify({ currentLevel: MAX_LEVEL + 5, totalScore: MAX_TOTAL_SCORE + 5 }),
      ),
    ).toEqual({ level: MAX_LEVEL, coins: MAX_TOTAL_SCORE });
  });

  it("ignores missing and corrupt storage", () => {
    expect(parseVoltorbProgress(null)).toBeNull();
    expect(parseVoltorbProgress("{oops")).toBeNull();
  });
});

describe("buildDeviceStats and hasAnyStats", () => {
  it("is all null for empty storage", () => {
    const stats = buildDeviceStats(raw());
    expect(stats).toEqual(EMPTY);
    expect(hasAnyStats(stats)).toBe(false);
  });

  it("reads every field from a seeded device", () => {
    const stats = buildDeviceStats(SEEDED);
    expect(stats).toEqual({
      orbitalBest: 48210,
      orbitalRuns: 12,
      orbitalAchievements: 1,
      hextrisBest: 9100,
      voltorb: { level: 4, coins: 1200 },
      typingBest: 87,
      towerDaily: null,
      towerFree: null,
      knight: null,
      failover: null,
    });
    expect(hasAnyStats(stats)).toBe(true);
  });

  it("counts a profile alone as stats", () => {
    const stats = buildDeviceStats(raw({ "orbital-dodge-profile": '{"totalRunsPlayed":1}' }));
    expect(hasAnyStats(stats)).toBe(true);
  });

  it("drops every corrupt value", () => {
    const stats = buildDeviceStats(
      raw({
        "space-shooter-hs": "NaN",
        "orbital-dodge-profile": '{"totalRunsPlayed":"x"}',
        hextris_highscores: "{oops",
        "svf:progress": "null",
        "typing-high-score": "-4",
      }),
    );
    expect(stats).toEqual(EMPTY);
  });
});

describe("statChips", () => {
  it("is seven placeholder chips before the browser has been read", () => {
    const chips = statChips(null);
    expect(chips.map((chip) => chip.slug)).toEqual([
      "space-shooter",
      "hextris",
      "super-voltorb-flip",
      "typing-speed",
      "tower-stacker",
      "script-knight",
      "failover",
    ]);
    for (const chip of chips) {
      expect(chip.value).toBeNull();
      expect(chip.detail).toBe("");
    }
    expect(chips.map((chip) => chip.label)).toEqual([
      "Best on this device",
      "Best on this device",
      "Saved progress",
      "Best on this device",
      "Best on this device",
      "Floors cleared",
      "Best on this device",
    ]);
  });

  it("formats a seeded device", () => {
    expect(statChips(buildDeviceStats(SEEDED))).toEqual([
      {
        slug: "space-shooter",
        title: "Orbital Dodge",
        label: "Best on this device",
        value: "48,210",
        detail: `12 runs, 1/${ACHIEVEMENT_TOTAL} achievements`,
      },
      {
        slug: "hextris",
        title: "Hextris",
        label: "Best on this device",
        value: "9,100",
        detail: "",
      },
      {
        slug: "super-voltorb-flip",
        title: "Super Voltorb Flip",
        label: "Saved progress",
        value: "Level 4",
        detail: "1,200 coins",
      },
      {
        slug: "typing-speed",
        title: "Typing Speed",
        label: "Best on this device",
        value: "87",
        detail: "",
      },
      {
        slug: "tower-stacker",
        title: "Tower Stacker",
        label: "Best on this device",
        value: null,
        detail: "",
      },
      {
        slug: "script-knight",
        title: "Script Knight",
        label: "Floors cleared",
        value: null,
        detail: "",
      },
      {
        slug: "failover",
        title: "Failover",
        label: "Best on this device",
        value: null,
        detail: "",
      },
    ]);
  });

  it("never calls Voltorb progress a best level, and handles singulars", () => {
    const chips = statChips(
      buildDeviceStats(
        raw({
          "orbital-dodge-profile": '{"totalRunsPlayed":1}',
          "svf:progress": '{"currentLevel":1,"totalScore":1}',
        }),
      ),
    );
    const text = JSON.stringify(chips).toLowerCase();
    expect(text).not.toContain("best level");
    expect(chips[0]?.detail).toBe(`1 run, 0/${ACHIEVEMENT_TOTAL} achievements`);
    expect(chips[0]?.value).toBeNull();
    expect(chips[2]?.detail).toBe("1 coin");
  });
});

describe("readDeviceStatsSnapshot", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads an empty device as empty stats", () => {
    expect(readDeviceStatsSnapshot()).toEqual(EMPTY);
  });

  it("reads a seeded device", () => {
    seed({
      "space-shooter-hs": "48210",
      "typing-high-score": "87",
    });
    const stats = readDeviceStatsSnapshot();
    expect(stats.orbitalBest).toBe(48210);
    expect(stats.typingBest).toBe(87);
  });

  it("returns the same object while storage is unchanged, and a new one after a change", () => {
    seed({ "space-shooter-hs": "100" });
    const first = readDeviceStatsSnapshot();
    expect(readDeviceStatsSnapshot()).toBe(first);
    seed({ "space-shooter-hs": "200" });
    const second = readDeviceStatsSnapshot();
    expect(second).not.toBe(first);
    expect(second.orbitalBest).toBe(200);
  });

  it("reads only the nine hub keys and never writes", () => {
    seed({ "space-shooter-hs": "100" });
    localStorage.setItem("walletCoins", "999");
    localStorage.setItem("arcade:player:v1", "{}");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const clear = vi.spyOn(Storage.prototype, "clear");
    readDeviceStatsSnapshot();
    const read = new Set(getItem.mock.calls.map((call) => call[0]));
    expect([...read].sort()).toEqual([...HUB_STAT_KEYS].sort());
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("returns empty stats when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    expect(readDeviceStatsSnapshot()).toEqual(EMPTY);
  });
});

describe("subscribeToDeviceStats", () => {
  it("calls back on a storage event and stops after unsubscribe", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeToDeviceStats(onChange);
    window.dispatchEvent(new StorageEvent("storage", { key: "typing-high-score" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    window.dispatchEvent(new StorageEvent("storage", { key: "typing-high-score" }));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});

describe("parseTowerStats", () => {
  const stored = (over: Record<string, unknown>) => JSON.stringify({ v: 1, ...over });

  it("reads the best daily score and the best free score", () => {
    expect(
      parseTowerStats(stored({ bestDaily: { day: "2026-10-15", score: 480 }, bestFree: 320 })),
    ).toEqual({ daily: 480, free: 320 });
  });

  it("treats a zero or missing best as none, and nothing played as null", () => {
    expect(parseTowerStats(stored({ bestDaily: null, bestFree: 0 }))).toBeNull();
    expect(parseTowerStats(stored({ bestFree: 90 }))).toEqual({ daily: null, free: 90 });
  });

  it("rejects corrupt, foreign-version and out-of-range data", () => {
    expect(parseTowerStats(null)).toBeNull();
    expect(parseTowerStats("not json")).toBeNull();
    expect(parseTowerStats("[]")).toBeNull();
    expect(parseTowerStats(JSON.stringify({ v: 2, bestFree: 50 }))).toBeNull();
    expect(parseTowerStats(stored({ bestFree: -5 }))).toBeNull();
    expect(parseTowerStats(stored({ bestFree: 1.5 }))).toBeNull();
    expect(parseTowerStats(stored({ bestFree: 99_999_999_999 }))).toBeNull();
    expect(parseTowerStats(stored({ bestDaily: { score: "x" }, bestFree: 40 }))).toEqual({
      daily: null,
      free: 40,
    });
  });

  it("feeds a chip with the better of the two and both in the detail", () => {
    seed({
      "tower:stats": stored({ bestDaily: { day: "2026-10-15", score: 480 }, bestFree: 320 }),
    });
    const chip = statChips(readDeviceStatsSnapshot()).find((c) => c.slug === "tower-stacker");
    expect(chip?.value).toBe("480");
    expect(chip?.detail).toBe("Daily 480, free 320");
  });
});

describe("parseKnightFloors", () => {
  const best = (score = 120) => ({ score, grade: 3, turns: 40 });
  const progress = (towers: Record<string, unknown>, v: unknown = 1) =>
    JSON.stringify({ v, towers, at: { tower: "narrow-path", level: 1, epic: false } });

  it("reads the game's own keys and its tower and floor counts", () => {
    expect(HUB_STAT_KEYS).toContain(PROGRESS_KEY);
    expect(HUB_STAT_KEYS).toContain(STATS_KEY);
    expect(KNIGHT_FLOOR_TOTAL).toBe(TOWER_IDS.length * FLOORS_PER_TOWER);
    // Every floor of every tower the game has, cleared, is the hub's whole total.
    const floors = Array.from({ length: FLOORS_PER_TOWER }, (_, i) => [String(i + 1), best()]);
    const towers = Object.fromEntries(
      TOWER_IDS.map((id) => [id, { reached: FLOORS_PER_TOWER, best: Object.fromEntries(floors) }]),
    );
    expect(parseKnightFloors(progress(towers))).toBe(KNIGHT_FLOOR_TOTAL);
  });

  it("counts the cleared floors of both towers", () => {
    expect(
      parseKnightFloors(
        progress({
          "narrow-path": { reached: 4, best: { "1": best(), "2": best(), "3": best() } },
          "powder-keep": { reached: 2, best: { "1": best() } },
        }),
      ),
    ).toBe(4);
  });

  it("is zero for a fresh record, and null for nothing readable", () => {
    expect(parseKnightFloors(progress({}))).toBe(0);
    expect(parseKnightFloors(null)).toBeNull();
    expect(parseKnightFloors("not json")).toBeNull();
    expect(parseKnightFloors("[]")).toBeNull();
    expect(parseKnightFloors(progress({ "narrow-path": { best: { "1": best() } } }, 2))).toBeNull();
  });

  it("skips a malformed floor and a floor outside 1..9", () => {
    const text = progress({
      "narrow-path": {
        best: {
          "1": best(),
          "0": best(),
          "10": best(),
          x: best(),
          "2": { score: -1, grade: 1, turns: 5 },
          "3": { score: 5, grade: 1, turns: 0 },
          "4": { score: 5, grade: 1, turns: 201 },
          "5": { score: "5", grade: 1, turns: 5 },
          "6": "nope",
        },
      },
    });
    expect(parseKnightFloors(text)).toBe(1);
  });

  it("treats corrupt JSON as empty, quietly", () => {
    const report = vi.spyOn(globalThis, "reportError");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(parseKnightFloors("{oops")).toBeNull();
    expect(report).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    report.mockRestore();
    consoleError.mockRestore();
  });

  describe("parity with the game's own parseProgress", () => {
    const CASES: unknown[] = [
      { v: 1, towers: {}, at: {} },
      { v: 1, towers: { "narrow-path": { best: { "1": best(), "9": best() } } } },
      { v: 1, towers: { "narrow-path": { best: { "1": best() } }, "powder-keep": 5 } },
      { v: 1, towers: { "powder-keep": { best: { "3": best(), "4": { score: 1 } } } } },
      { v: 1, towers: { "narrow-path": { best: [best()] } } },
      { v: 1, towers: { "narrow-path": { best: [best(), best()] } } },
      { v: 1, towers: { "narrow-path": { best: [best(), "nope"] } } },
      { v: 1, towers: { "narrow-path": { best: { "1": best(), "2": null } } } },
      { v: 1, towers: { "narrow-path": { best: { "1": [best()] } } } },
      { v: 1, towers: { "narrow-path": null, "powder-keep": { best: { "1": best() } } } },
      { v: 1, towers: { "narrow-path": { best: null } } },
      { v: 1, towers: [] },
      { v: 1, towers: null },
      { v: 1 },
      { v: 1, towers: { "narrow-path": { best: { "1": { score: 1.9, grade: 0, turns: 200 } } } } },
      { v: 1, towers: { "narrow-path": { best: { "1": { score: 1, grade: -1, turns: 5 } } } } },
      { v: 1, towers: { "narrow-path": { best: { "1": { score: 1, grade: 1, turns: 5.5 } } } } },
    ];

    it("agrees that a foreign version holds no floors", () => {
      const value = { v: 2, towers: { "narrow-path": { best: { "1": best() } } } };
      const game = parseKnightProgress(value);
      expect(Object.values(game.towers).map((tower) => Object.keys(tower.best))).toEqual([[], []]);
      expect(parseKnightFloors(JSON.stringify(value))).toBeNull();
    });

    it("agrees on a score too large to be finite", () => {
      const entry = '{"score":1e999,"grade":1,"turns":5}';
      const text = `{"v":1,"towers":{"narrow-path":{"best":{"1":${entry}}}}}`;
      const game = parseKnightProgress(JSON.parse(text));
      expect(game.towers["narrow-path"].best).toEqual({});
      expect(parseKnightFloors(text)).toBe(0);
    });

    for (const value of CASES) {
      it(`agrees on ${JSON.stringify(value)}`, () => {
        const game = parseKnightProgress(value);
        const expected = Object.values(game.towers).reduce(
          (sum, tower) => sum + Object.keys(tower.best).length,
          0,
        );
        expect(parseKnightFloors(JSON.stringify(value))).toBe(expected);
      });
    }
  });
});

describe("parseKnightBestDaily", () => {
  const stats = (over: Record<string, unknown>) => JSON.stringify({ v: 1, ...over });

  it("reads the best daily score", () => {
    expect(parseKnightBestDaily(stats({ bestDaily: { day: "2026-10-16", score: 1250 } }))).toBe(
      1250,
    );
  });

  it("is null for no best, a zero best and nothing readable", () => {
    expect(parseKnightBestDaily(stats({ bestDaily: null }))).toBeNull();
    expect(parseKnightBestDaily(stats({ bestDaily: { day: "2026-10-16", score: 0 } }))).toBeNull();
    expect(parseKnightBestDaily(null)).toBeNull();
    expect(parseKnightBestDaily("not json")).toBeNull();
    expect(parseKnightBestDaily("[]")).toBeNull();
    expect(
      parseKnightBestDaily(JSON.stringify({ v: 2, bestDaily: { day: "2026-10-16", score: 9 } })),
    ).toBeNull();
  });

  it("clamps to the arcade cap and rejects a bad day or score", () => {
    expect(
      parseKnightBestDaily(stats({ bestDaily: { day: "2026-10-16", score: 99_999_999_999 } })),
    ).toBe(10_000_000);
    for (const bestDaily of [
      { day: "yesterday", score: 5 },
      { day: "2026-10-16", score: "5" },
      { day: "2026-10-16", score: -5 },
      { day: "2026-10-16" },
      "5",
    ]) {
      expect(parseKnightBestDaily(stats({ bestDaily })), JSON.stringify(bestDaily)).toBeNull();
    }
  });

  describe("parity with the game's own parseStats", () => {
    const CASES: unknown[] = [
      { v: 1, bestDaily: { day: "2026-10-16", score: 1250 } },
      { v: 1, bestDaily: { day: "2026-10-16", score: 1250.9 } },
      { v: 1, bestDaily: { day: "2026-10-16", score: 0 } },
      { v: 1, bestDaily: { day: "2026-10-16", score: -1 } },
      { v: 1, bestDaily: { day: "16/10/2026", score: 5 } },
      { v: 1, bestDaily: null },
      { v: 1 },
      { v: 2, bestDaily: { day: "2026-10-16", score: 5 } },
      { bestDaily: { day: "2026-10-16", score: 5 } },
    ];

    for (const value of CASES) {
      it(`agrees on ${JSON.stringify(value)}`, () => {
        const score = parseKnightStats(value).bestDaily?.score ?? 0;
        expect(parseKnightBestDaily(JSON.stringify(value))).toBe(score > 0 ? score : null);
      });
    }
  });
});

describe("the Script Knight chip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const knightChip = () =>
    statChips(readDeviceStatsSnapshot()).find((c) => c.slug === "script-knight");
  const best = { score: 90, grade: 2, turns: 12 };

  it("shows floors cleared of the eighteen, with the best daily score under it", () => {
    seed({
      "knight:progress": JSON.stringify({
        v: 1,
        towers: { "narrow-path": { best: { "1": best, "2": best } } },
      }),
      "knight:stats": JSON.stringify({ v: 1, bestDaily: { day: "2026-10-16", score: 1250 } }),
    });
    expect(knightChip()).toMatchObject({
      label: "Floors cleared",
      value: "2 of 18",
      detail: "Best daily 1,250",
    });
  });

  it("reads one cleared floor and leaves the detail blank without a daily", () => {
    seed({
      "knight:progress": JSON.stringify({
        v: 1,
        towers: { "narrow-path": { best: { "1": best } } },
      }),
    });
    expect(knightChip()).toMatchObject({ value: "1 of 18", detail: "" });
  });

  it("counts a daily score alone as stats, with no floors cleared yet", () => {
    seed({
      "knight:stats": JSON.stringify({ v: 1, bestDaily: { day: "2026-10-16", score: 40 } }),
    });
    const stats = readDeviceStatsSnapshot();
    expect(hasAnyStats(stats)).toBe(true);
    expect(knightChip()).toMatchObject({ value: "0 of 18", detail: "Best daily 40" });
  });

  it("shows nothing for a fresh progress record or a foreign version", () => {
    seed({
      "knight:progress": JSON.stringify({ v: 1, towers: {} }),
      "knight:stats": JSON.stringify({ v: 2, bestDaily: { day: "2026-10-16", score: 40 } }),
    });
    expect(hasAnyStats(readDeviceStatsSnapshot())).toBe(false);
    expect(knightChip()?.value).toBeNull();
  });
});

describe("parseFailoverBest", () => {
  const record = (extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      v: 1,
      bestSeconds: 342,
      bestScore: 8420,
      runs: 7,
      lastDailyDay: "2026-10-09",
      ...extra,
    });

  it("reads the best score and the best survival time", () => {
    expect(parseFailoverBest(record())).toEqual({ score: 8420, seconds: 342 });
  });

  it("ignores extra fields, and rejects a record the game would reject", () => {
    expect(parseFailoverBest(record({ extra: true }))).toEqual({ score: 8420, seconds: 342 });
    const noDay = JSON.stringify({ v: 1, bestSeconds: 61, bestScore: 900, runs: 2 });
    expect(parseFailoverBest(noDay)).toBeNull();
  });

  it("is null for a zero best and for nothing readable", () => {
    expect(parseFailoverBest(record({ bestScore: 0, bestSeconds: 0, runs: 0 }))).toBeNull();
    expect(parseFailoverBest(null)).toBeNull();
    expect(parseFailoverBest("not json")).toBeNull();
    expect(parseFailoverBest("[]")).toBeNull();
    expect(parseFailoverBest(record({ v: 2 }))).toBeNull();
  });

  it("clamps to the arcade cap", () => {
    expect(parseFailoverBest(record({ bestScore: 99_999_999_999 }))).toEqual({
      score: 10_000_000,
      seconds: 342,
    });
  });

  describe("parity with the game's own parseStats", () => {
    const base = { v: 1, bestSeconds: 342, bestScore: 8420, runs: 7, lastDailyDay: "2026-10-09" };
    const CASES: unknown[] = [
      base,
      { ...base, lastDailyDay: null },
      { ...base, bestScore: 0 },
      { ...base, bestScore: -1 },
      { ...base, bestScore: 1.5 },
      { ...base, bestSeconds: "342" },
      { ...base, runs: Infinity },
      { ...base, lastDailyDay: "yesterday" },
      { ...base, lastDailyDay: undefined },
      { ...base, v: 2 },
      { ...base, v: "1" },
      { ...base, extra: true },
      [base],
      null,
    ];

    for (const value of CASES) {
      it(`agrees on ${JSON.stringify(value)}`, () => {
        const game = parseFailoverStats(value);
        const expected =
          game !== null && game.bestScore > 0
            ? { score: game.bestScore, seconds: game.bestSeconds }
            : null;
        expect(parseFailoverBest(JSON.stringify(value))).toEqual(expected);
      });
    }
  });
});

describe("the Failover chip", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const failoverChip = () =>
    statChips(readDeviceStatsSnapshot()).find((c) => c.slug === "failover");

  it("shows the best score with the survival time under it", () => {
    seed({
      "failover:stats": JSON.stringify({
        v: 1,
        bestSeconds: 342,
        bestScore: 8420,
        runs: 7,
        lastDailyDay: null,
      }),
    });
    expect(hasAnyStats(readDeviceStatsSnapshot())).toBe(true);
    expect(failoverChip()).toMatchObject({
      label: "Best on this device",
      value: "8,420",
      detail: "Survived 5:42",
    });
  });

  it("shows nothing for a foreign version", () => {
    seed({ "failover:stats": JSON.stringify({ v: 2, bestSeconds: 1, bestScore: 10, runs: 1 }) });
    expect(hasAnyStats(readDeviceStatsSnapshot())).toBe(false);
    expect(failoverChip()?.value).toBeNull();
  });
});
