// @vitest-environment node
import { describe, expect, it } from "vitest";
import { Attack, Bind, Feel, Pivot, Rescue, Rest, Walk } from "../engine/abilities";
import type { LevelConfig } from "../engine/core/level-config";
import { configForRef, createRun, type TurnRecord } from "../engine/run";
import { EAST, WEST } from "../engine/spatial";
import { Captive, Sludge } from "../engine/units";
import {
  buildFrames,
  clampFrame,
  describeEvent,
  frameDelayMs,
  lastFrameOfTurn,
  nextFrame,
  prevFrame,
  SPEED_TURN_MS,
} from "../playback";
import type { TurnAction } from "../engine/codec";

function play(config: LevelConfig, actions: TurnAction[]): TurnRecord[] {
  const run = createRun(config);
  const records: TurnRecord[] = [];
  for (const action of actions) {
    const stepped = run.step(action);
    if (!stepped.ok) throw new Error(stepped.reason.kind);
    records.push(stepped.record);
  }
  return records;
}

function framesFor(config: LevelConfig, actions: TurnAction[]) {
  const run = createRun(config);
  const records = play(config, actions);
  return { frames: buildFrames(config, run.initial, records), records };
}

const tower = (tower: "narrow-path" | "powder-keep", level: number, epic = false) =>
  configForRef({ kind: "tower", tower, level, epic }, "Knight");

/** Warrior at x=0 facing east, a sludge at x=1 facing west, a captive behind at x=3. */
function arena(): LevelConfig {
  return {
    number: 1,
    description: "",
    tip: "",
    clue: "",
    timeBonus: 10,
    aceScore: 10,
    floor: {
      size: { width: 5, height: 1 },
      stairs: { x: 4, y: 0 },
      warrior: {
        name: "Knight",
        maxHealth: 20,
        abilities: {
          attack: Attack.with({ power: 5 }),
          bind: Bind,
          feel: Feel,
          pivot: Pivot,
          rescue: Rescue,
          rest: Rest.with({ healthGain: 0.1 }),
          walk: Walk,
        },
        position: { x: 1, y: 0, facing: EAST },
      },
      units: [
        { unit: Sludge, position: { x: 2, y: 0, facing: WEST } },
        { unit: Captive, position: { x: 0, y: 0, facing: EAST } },
      ],
    },
  };
}

describe("buildFrames", () => {
  it("makes one frame per event plus the starting frame", () => {
    const { frames, records } = framesFor(arena(), [
      { name: "attack", direction: "forward" },
      { name: "rest", direction: null },
    ]);
    const events = records.reduce((sum, record) => sum + record.events.length, 0);
    expect(frames).toHaveLength(events + 1);
    expect(frames[0]).toMatchObject({ index: 0, turn: 0, event: null });
    expect(frames.at(-1)?.turn).toBe(2);
  });

  it("starts from the level as configured: positions, facing, health, chains", () => {
    const { frames } = framesFor(arena(), []);
    const units = frames[0]?.floor.units ?? [];
    const knight = units.find((u) => u.warrior);
    expect(knight).toMatchObject({ id: 0, x: 1, y: 0, facing: "east", health: 20, bound: false });
    expect(units.find((u) => u.name === "Sludge")).toMatchObject({
      x: 2,
      facing: "west",
      health: 12,
      maxHealth: 12,
      bound: false,
    });
    expect(units.find((u) => u.name === "Captive")).toMatchObject({ x: 0, bound: true });
    expect(frames[0]?.floor).toMatchObject({ width: 5, height: 1, stairs: { x: 4, y: 0 } });
  });

  it("keeps unit ids stable between events", () => {
    const { frames } = framesFor(arena(), [
      { name: "attack", direction: "forward" },
      { name: "attack", direction: "forward" },
    ]);
    const sludge = frames[0]?.floor.units.find((u) => u.name === "Sludge");
    for (const frame of frames) {
      const same = frame.floor.units.find((u) => u.name === "Sludge");
      if (same) expect(same.id).toBe(sludge?.id);
    }
  });

  it("tracks health from the damage events, and drops a unit when it dies", () => {
    const { frames } = framesFor(arena(), [
      { name: "attack", direction: "forward" },
      { name: "attack", direction: "forward" },
      { name: "attack", direction: "forward" },
    ]);
    const sludgeHealth = frames.map(
      (frame) => frame.floor.units.find((u) => u.name === "Sludge")?.health,
    );
    expect(sludgeHealth).toContain(7);
    expect(sludgeHealth).toContain(2);
    expect(frames.at(-1)?.floor.units.some((u) => u.name === "Sludge")).toBe(false);
  });

  it("follows the warrior's health and score in the frame status", () => {
    const { frames } = framesFor(arena(), [
      { name: "attack", direction: "forward" },
      { name: "attack", direction: "forward" },
      { name: "attack", direction: "forward" },
    ]);
    expect(frames[0]?.status).toEqual({ health: 20, score: 0 });
    expect(frames.at(-1)?.status?.score).toBe(12);
  });

  it("turns the glyph on a pivot", () => {
    const { frames } = framesFor(arena(), [{ name: "pivot", direction: "backward" }]);
    const knight = frames.at(-1)?.floor.units.find((u) => u.warrior);
    expect(knight?.facing).toBe("west");
  });

  it("shows a captive freed when rescued", () => {
    const { frames } = framesFor(arena(), [
      { name: "attack", direction: "forward" },
      { name: "attack", direction: "forward" },
      { name: "attack", direction: "forward" },
      { name: "rescue", direction: "backward" },
    ]);
    expect(frames.at(-1)?.floor.units.some((u) => u.name === "Captive")).toBe(false);
  });

  it("shows a unit bound by the warrior's bind", () => {
    const { frames } = framesFor(arena(), [{ name: "bind", direction: "forward" }]);
    const sludge = frames.at(-1)?.floor.units.find((u) => u.name === "Sludge");
    expect(sludge?.bound).toBe(true);
  });

  it("counts a ticking captive down from the level config", () => {
    const config = tower("powder-keep", 6);
    const idle: TurnAction[] = [null, null];
    const { frames } = framesFor(config, idle);
    const ticking = (index: number) =>
      frames[index]?.floor.units.filter((u) => u.ticking !== null).map((u) => u.ticking);
    expect(ticking(0)).toEqual([7]);
    expect(ticking(frames.length - 1)).toEqual([5]);
  });
});

describe("describeEvent", () => {
  it("fills the upstream templates with names and numbers", () => {
    const { frames } = framesFor(arena(), [{ name: "attack", direction: "forward" }]);
    const texts = frames.map((frame) => frame.text);
    expect(texts).toContain("Knight attacks forward and hits Sludge");
    expect(texts).toContain("Sludge takes 5 damage, 7 HP left");
  });

  it("describes the starting frame", () => {
    const { frames } = framesFor(arena(), []);
    expect(frames[0]?.text).toBe("The floor is ready.");
  });

  it("leaves no placeholder unfilled", () => {
    const { frames } = framesFor(tower("narrow-path", 3, true), [
      { name: "attack", direction: "forward" },
      { name: "rest", direction: null },
      { name: "walk", direction: "forward" },
    ]);
    for (const frame of frames) expect(frame.text).not.toMatch(/[{}]/);
  });

  it("reads an event with no actor from its description", () => {
    expect(
      describeEvent({
        action: { type: "init", description: "starts", params: {} },
        actor: null,
        floorMap: [],
        warriorStatus: undefined,
      }),
    ).toBe("starts");
  });
});

describe("navigation", () => {
  const { frames } = framesFor(arena(), [
    { name: "attack", direction: "forward" },
    { name: "attack", direction: "forward" },
  ]);

  it("steps forward and back, staying inside the frames", () => {
    expect(nextFrame(frames, 0)).toBe(1);
    expect(nextFrame(frames, frames.length - 1)).toBe(frames.length - 1);
    expect(prevFrame(0)).toBe(0);
    expect(prevFrame(3)).toBe(2);
  });

  it("clamps a scrub", () => {
    expect(clampFrame(frames, -4)).toBe(0);
    expect(clampFrame(frames, 999)).toBe(frames.length - 1);
    expect(clampFrame(frames, 2.6)).toBe(2);
  });

  it("scrubs to the end of a turn", () => {
    const end = lastFrameOfTurn(frames, 1);
    expect(frames[end]?.turn).toBe(1);
    expect(frames[end + 1]?.turn).toBe(2);
    expect(lastFrameOfTurn(frames, 0)).toBe(0);
    expect(lastFrameOfTurn(frames, 99)).toBe(frames.length - 1);
  });
});

describe("speeds", () => {
  const { frames } = framesFor(arena(), [{ name: "attack", direction: "forward" }]);

  it("pins the turn durations: 1x is 300 ms, 2x half, 4x a quarter, instant none", () => {
    expect(SPEED_TURN_MS).toEqual({ "1x": 300, "2x": 150, "4x": 75, instant: 0 });
  });

  it("splits a turn's time across its frames", () => {
    const inTurn = frames.filter((frame) => frame.turn === 1).length;
    expect(frameDelayMs(frames, 1, "1x")).toBeCloseTo(300 / inTurn);
    expect(frameDelayMs(frames, 1, "4x")).toBeCloseTo(75 / inTurn);
    expect(frameDelayMs(frames, 1, "instant")).toBe(0);
  });

  it("gives the starting frame a short beat", () => {
    expect(frameDelayMs(frames, 0, "1x")).toBe(300);
    expect(frameDelayMs(frames, 0, "instant")).toBe(0);
  });
});
