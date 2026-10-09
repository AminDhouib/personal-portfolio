// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Walk } from "../abilities";
import { loadLevel } from "../core/level";
import { configForRef, createRun } from "../run";

// The three places the port deliberately differs from WarriorJS bc68e87 (DESIGN.md register).

const NAME = "Probe";

function floor(level: number, epic = false) {
  return configForRef({ kind: "tower", tower: "narrow-path", level, epic }, NAME);
}

describe("1. unknown directions throw instead of turning left", () => {
  it("walk('north') throws a player-facing error through the turn facade", () => {
    const turn = createRun(floor(1)).beginTurn();
    expect(() => turn.walk?.("north")).toThrow(
      "'north' is not a direction: use forward, right, backward or left.",
    );
  });

  it("throws from the ability itself, so a log cannot smuggle one in", () => {
    const level = loadLevel(floor(1));
    const warrior = level.floor.warrior;
    if (!warrior) throw new Error("no warrior");
    const walk = new Walk(warrior);
    expect(() => walk.perform("north" as never)).toThrow("'north' is not a direction");
    expect(() => walk.perform("Forward" as never)).toThrow("'Forward' is not a direction");
  });

  it("covers every direction-taking ability and sense", () => {
    // Narrow Path epic grants attack, feel, look, pivot, rescue, shoot, walk.
    const turn = createRun(floor(9, true)).beginTurn();
    for (const name of ["attack", "feel", "look", "pivot", "rescue", "shoot", "walk"]) {
      expect(() => turn[name]?.("north"), name).toThrow("is not a direction");
    }
  });
});

describe("2. the turn object is a frozen facade", () => {
  it("cannot be handed a hand-made action", () => {
    const run = createRun(floor(1));
    const turn = run.beginTurn();
    expect(Object.isFrozen(turn)).toBe(true);
    expect(Reflect.set(turn, "action", ["detonate", ["forward"]])).toBe(false);
    expect(() => {
      "use strict";
      Object.defineProperty(turn, "action", { value: ["detonate", []] });
    }).toThrow();
    expect(run.endTurn().action).toBeNull();
    expect(run.turnCount).toBe(1);
  });

  it("does not expose the unit, its health setter or the floor", () => {
    const turn = createRun(floor(1)).beginTurn();
    for (const key of ["action", "health", "floor", "position", "unit", "abilities", "emit"]) {
      expect(key in turn).toBe(false);
    }
  });
});

describe("3. events carry unit ids", () => {
  it("tells two sludges apart across events", () => {
    // Narrow Path 3: four sludges at x = 2, 4, 5, 7. Walk into the first one and fight it.
    const run = createRun(floor(3));
    const ids = new Set<number>();
    const seen: Array<{ id: number; x: number }> = [];
    for (let i = 0; i < 12 && run.status === "playing"; i++) {
      const record = run.step(
        i < 1 ? { name: "walk", direction: null } : { name: "attack", direction: null },
      );
      for (const event of record.events) {
        if (event.actor && event.actor.name === "Sludge") ids.add(event.actor.id);
        event.floorMap[1]?.forEach((space, x) => {
          if (space.unit?.name === "Sludge") seen.push({ id: space.unit.id, x });
        });
      }
    }
    // Every Sludge the map ever shows has an id from {1,2,3,4}: index in floor.units (warrior is 0).
    expect(new Set(seen.map((entry) => entry.id))).toEqual(new Set([1, 2, 3, 4]));
    // A given id never sits at two different x positions while the sludges never move.
    const byId = new Map<number, number>();
    for (const { id, x } of seen) {
      expect(byId.get(id) ?? x).toBe(x);
      byId.set(id, x);
    }
    expect(byId.get(1)).toBe(3);
    expect(byId.get(4)).toBe(8);
    expect([...ids].every((id) => id >= 1 && id <= 4)).toBe(true);
  });

  it("gives the warrior id 0 in the initial snapshot and in events", () => {
    const run = createRun(floor(1));
    const start = run.initial.floorMap[1]?.[1];
    expect(start?.unit).toMatchObject({ id: 0, name: NAME, warrior: true });
    const record = run.step(null);
    expect(record.events[0]?.actor).toMatchObject({ id: 0, warrior: true });
  });
});

describe("one logger per run", () => {
  it("does not mix the logs of two runs stepped alternately", () => {
    const a = createRun(floor(1));
    const b = createRun(floor(2));
    for (let i = 0; i < 4; i++) {
      a.step({ name: "walk", direction: null });
      b.step(i % 2 === 0 ? { name: "walk", direction: null } : null);
    }
    expect(a.turnCount).toBe(4);
    expect(b.turnCount).toBe(4);
    const solo = createRun(floor(1));
    for (let i = 0; i < 4; i++) solo.step({ name: "walk", direction: null });
    expect(a.result()).toEqual(solo.result());
    expect(a.initial.floorMap).toHaveLength(3);
    expect(b.initial.floorMap[1]).toHaveLength(10);
  });

  it("keeps each run's events apart", () => {
    const a = createRun(floor(1));
    const b = createRun(floor(3));
    const recA = a.step({ name: "walk", direction: null });
    const recB = b.step({ name: "walk", direction: null });
    const recA2 = a.step({ name: "walk", direction: null });
    expect(recA.events).toHaveLength(1);
    expect(recB.events).toHaveLength(1);
    expect(recA.events[0]?.floorMap[1]).toHaveLength(10);
    expect(recB.events[0]?.floorMap[1]).toHaveLength(11);
    expect(recA2.t).toBe(2);
    expect(a.turnCount).toBe(2);
    expect(b.turnCount).toBe(1);
  });
});
