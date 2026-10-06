import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACHIEVEMENTS } from "@/components/game/achievements";
import {
  MAX_LEVEL,
  MAX_TOTAL_SCORE,
  parseProgress,
} from "@/components/game/super-voltorb-flip/progress";
import {
  ACHIEVEMENT_TOTAL,
  HUB_STAT_KEYS,
  buildDeviceStats,
  hasAnyStats,
  parseHextrisBest,
  parseOrbitalProfile,
  parseScoreString,
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
  };
}

const EMPTY = {
  orbitalBest: null,
  orbitalRuns: null,
  orbitalAchievements: null,
  hextrisBest: null,
  voltorb: null,
  typingBest: null,
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
  it("is exactly the five keys the hub may read", () => {
    expect([...HUB_STAT_KEYS].sort()).toEqual(
      [
        "hextris_highscores",
        "orbital-dodge-profile",
        "space-shooter-hs",
        "svf:progress",
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
  it("is four placeholder chips before the browser has been read", () => {
    const chips = statChips(null);
    expect(chips.map((chip) => chip.slug)).toEqual([
      "space-shooter",
      "hextris",
      "super-voltorb-flip",
      "typing-speed",
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

  it("reads only the five hub keys and never writes", () => {
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
