// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeLog } from "../engine/codec";
import { playWithBot } from "../engine/reference-bot";
import { configForRef } from "../engine/run";
import type { LevelConfig } from "../engine/core/level-config";
import { DAILY_RECIPE, dailyFloor, dayNumber, fallbackFloor, generateFloor } from "../daily";

afterEach(() => vi.restoreAllMocks());

/** The layout of a floor as plain data, so two module instances can be compared. */
function layout(config: LevelConfig) {
  const { size, stairs, warrior, units = [] } = config.floor;
  return {
    size,
    stairs,
    warrior: warrior.position,
    abilities: Object.keys(warrior.abilities ?? {}).sort(),
    units: units.map((u) => [u.unit.name, u.position.x, u.position.facing]),
    timeBonus: config.timeBonus,
    aceScore: config.aceScore,
  };
}

function enemyCount(config: LevelConfig): number {
  return (config.floor.units ?? []).filter((u) => u.unit.name !== "Captive").length;
}

function utcDays(from: string, count: number): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

const EPIC_ABILITIES = Object.keys(
  configForRef({ kind: "tower", tower: "narrow-path", level: 9, epic: true }, "Knight").floor
    .warrior.abilities ?? {},
).sort();

describe("dayNumber", () => {
  it("turns a UTC day key into the number the board stores", () => {
    expect(dayNumber("2026-10-15")).toBe(20261015);
    expect(dayNumber("2027-01-02")).toBe(20270102);
  });
});

describe("dailyFloor", () => {
  it("names its recipe, so a change to the generator is a new string", () => {
    expect(DAILY_RECIPE).toBe("knight-daily-v1");
  });

  it("gives the identical floor for a day twice, and memoizes it", () => {
    const a = dailyFloor("2026-10-15");
    const b = dailyFloor("2026-10-15");
    expect(b).toBe(a);
    expect(layout(generateFloor("2026-10-15", 0))).toEqual(layout(generateFloor("2026-10-15", 0)));
  });

  it("gives the identical floor from a fresh module", async () => {
    const first = layout(dailyFloor("2026-11-03").config);
    vi.resetModules();
    const fresh = await import("../daily");
    expect(layout(fresh.dailyFloor("2026-11-03").config)).toEqual(first);
  });

  it("differs from day to day", () => {
    const shapes = new Set(
      utcDays("2026-10-01", 14).map((day) => JSON.stringify(layout(dailyFloor(day).config))),
    );
    expect(shapes.size).toBeGreaterThan(10);
  });

  it("uses the epic ability set", () => {
    for (const day of utcDays("2026-10-01", 20)) {
      expect(layout(dailyFloor(day).config).abilities).toEqual(EPIC_ABILITIES);
    }
  });

  it("calls nothing but the seeded generator for its randomness", () => {
    const random = vi.spyOn(Math, "random");
    dailyFloor("2031-02-03");
    playWithBot(dailyFloor("2031-02-03").config);
    expect(random).not.toHaveBeenCalled();
  });

  it("pins the layout and par of 2026-10-15, so a recipe change shows up here", () => {
    const floor = dailyFloor("2026-10-15");
    expect({ source: floor.source, attempt: floor.attempt, par: floor.par }).toEqual({
      source: "generated",
      attempt: 0,
      par: 118,
    });
    expect(layout(floor.config)).toEqual({
      size: { width: 8, height: 1 },
      stairs: { x: 7, y: 0 },
      warrior: { x: 0, y: 0, facing: "east" },
      abilities: EPIC_ABILITIES,
      units: [
        ["Sludge", 2, "west"],
        ["Wizard", 3, "west"],
        ["Captive", 4, "west"],
        ["Sludge", 5, "west"],
      ],
      timeBonus: 68,
      aceScore: 118,
    });
    expect(encodeLog(playWithBot(floor.config).actions)).toBe(
      "1:h0h0h0h0h0w0w0w0s0h0h0h0h0w0w0w0w0",
    );
  });

  describe("a year of days", () => {
    const floors = utcDays("2026-10-01", 365).map((day) => [day, dailyFloor(day)] as const);

    it("each has a floor the reference bot passes, enough enemies and a par of 8 turns or more", () => {
      for (const [day, floor] of floors) {
        const { status, result } = playWithBot(floor.config);
        expect(status, day).toBe("passed");
        expect(enemyCount(floor.config), day).toBeGreaterThanOrEqual(2);
        expect(result.turns, day).toBeGreaterThanOrEqual(8);
        expect(floor.par, day).toBe(result.score?.total);
      }
    });

    it("is almost always generated", () => {
      const fallbacks = floors.filter(([, floor]) => floor.source === "fallback");
      expect(fallbacks.length).toBeLessThan(5);
    });
  });
});

describe("fallbackFloor", () => {
  it("is a Narrow Path floor in epic configuration, picked by the day number", () => {
    const day = "2026-10-15";
    const floor = fallbackFloor(day);
    expect(floor.source).toBe("fallback");
    const level = (dayNumber(day) % 9) + 1;
    const expected = configForRef(
      { kind: "tower", tower: "narrow-path", level, epic: true },
      "Knight",
    );
    expect(layout(floor.config)).toEqual(layout({ ...expected, aceScore: floor.config.aceScore }));
    expect(playWithBot(floor.config).status).toBe("passed");
  });
});
