import { describe, expect, it } from "vitest";
import { botPlayed, configForAnyRef, playLog } from "../played";
import { dailyFloor } from "../daily";
import { playWithBot } from "../engine/reference-bot";
import type { LevelRef } from "../engine/level-ref";

const NP1: LevelRef = { kind: "tower", tower: "narrow-path", level: 1, epic: false };
const DAY = "2026-10-15";

describe("configForAnyRef", () => {
  it("builds a tower floor and a daily floor, and refuses a floor that is not there", () => {
    expect(configForAnyRef(NP1)).not.toBeNull();
    expect(configForAnyRef({ kind: "daily", day: DAY })).toBe(dailyFloor(DAY).config);
    expect(
      configForAnyRef({ kind: "tower", tower: "narrow-path", level: 99, epic: false }),
    ).toBeNull();
  });
});

describe("playLog", () => {
  it("replays a log into frames and a result", () => {
    const bot = playWithBot(configForAnyRef(NP1)!);
    const played = playLog(NP1, bot.actions);
    expect(played?.result.passed).toBe(true);
    expect(played?.result.turns).toBe(bot.actions.length);
    expect(played?.frames.length).toBeGreaterThan(bot.actions.length);
  });

  it("plays a log that stops before the floor is done, as far as it goes", () => {
    const played = playLog(NP1, [{ name: "walk", direction: "forward" }]);
    expect(played?.result.passed).toBe(false);
    expect(played?.result.turns).toBe(1);
  });

  it("refuses a log with an action the floor does not grant", () => {
    expect(playLog(NP1, [{ name: "shoot", direction: "forward" }])).toBeNull();
  });

  it("refuses a log with actions left over after the run ended", () => {
    const bot = playWithBot(configForAnyRef(NP1)!);
    expect(playLog(NP1, [...bot.actions, { name: "walk", direction: "forward" }])).toBeNull();
  });

  it("plays a daily log on that day's floor, whatever the day", () => {
    const ref: LevelRef = { kind: "daily", day: "2020-01-02" };
    const bot = playWithBot(configForAnyRef(ref)!);
    expect(playLog(ref, bot.actions)?.result.turns).toBe(bot.actions.length);
  });
});

describe("botPlayed", () => {
  it("is the reference bot's run, the same actions and score the daily par is made of", () => {
    const ref: LevelRef = { kind: "daily", day: DAY };
    const played = botPlayed(ref);
    expect(played?.result.score?.total).toBe(dailyFloor(DAY).par);
  });

  it("is null for a floor that is not there", () => {
    expect(botPlayed({ kind: "tower", tower: "narrow-path", level: 0, epic: false })).toBeNull();
  });
});
