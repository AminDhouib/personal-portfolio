// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Attack, Feel, Rest, Shoot, Walk } from "../abilities";
import type { LevelConfig } from "../core/level-config";
import { Sludge } from "../units";
import { Ticking } from "../effects";
import { EAST, WEST } from "../spatial";
import { configForRef, createRun, replayLog, type Run } from "../run";
import type { TowerLevelRef } from "../level-ref";
import { endOk, replayOk, stepOk } from "./helpers";

const NAME = "Probe";

function tower(level: number, epic = false): LevelConfig {
  const ref: TowerLevelRef = { kind: "tower", tower: "narrow-path", level, epic };
  return configForRef(ref, NAME);
}

function keep(level: number): LevelConfig {
  return configForRef({ kind: "tower", tower: "powder-keep", level, epic: false }, NAME);
}

function walkOnly(run: Run): void {
  run.beginTurn().walk?.();
  endOk(run);
}

/** Warrior at x=0 facing a Sludge at x=1, floor of 3 spaces, stairs at the far end. */
function duelConfig(): LevelConfig {
  return {
    number: 1,
    description: "",
    tip: "",
    clue: "",
    timeBonus: 10,
    aceScore: 10,
    floor: {
      size: { width: 3, height: 1 },
      stairs: { x: 2, y: 0 },
      warrior: {
        name: NAME,
        maxHealth: 20,
        abilities: {
          attack: Attack.with({ power: 5 }),
          feel: Feel,
          rest: Rest.with({ healthGain: 0.1 }),
          walk: Walk,
        },
        position: { x: 0, y: 0, facing: EAST },
      },
      units: [{ unit: Sludge, position: { x: 1, y: 0, facing: WEST } }],
    },
  };
}

describe("createRun", () => {
  it("starts playing at turn zero with the initial snapshot", () => {
    const run = createRun(tower(1));
    expect(run.status).toBe("playing");
    expect(run.turnCount).toBe(0);
    expect(run.initial.action.type).toBe("init");
    expect(run.initial.floorMap).toHaveLength(3);
    expect(run.config.number).toBe(1);
  });

  it("passes Narrow Path 1 by walking, with the stairs bonus maths intact", () => {
    const run = createRun(tower(1));
    for (let i = 0; i < 7; i++) {
      expect(run.status).toBe("playing");
      walkOnly(run);
    }
    expect(run.status).toBe("passed");
    expect(run.turnCount).toBe(7);
    const result = run.result();
    expect(result.passed).toBe(true);
    expect(result.turns).toBe(7);
    expect(result.score).toEqual({ warrior: 0, timeBonus: 8, clearBonus: 2, total: 10 });
    expect(result.grade).toBe(1);
    expect(result.warrior).toEqual({ health: 20, score: 0 });
  });

  it("reports no score or grade while playing or after a failure", () => {
    const run = createRun(tower(1));
    expect(run.result()).toMatchObject({ passed: false, score: null, grade: null });
  });
});

describe("turn order", () => {
  it("lets the warrior act before every other unit", () => {
    const run = createRun(duelConfig());
    run.beginTurn().rest?.();
    const record = endOk(run);
    const actors = record.events.map((event) => event.actor?.warrior);
    expect(actors[0]).toBe(true);
    expect(record.events.some((event) => event.actor && !event.actor.warrior)).toBe(true);
  });

  it("makes every unit choose against the start-of-turn state", () => {
    // The sludge decided to attack before the warrior's blow landed, so it still strikes back in
    // the same turn even though the warrior hit first.
    const run = createRun(duelConfig());
    run.beginTurn().attack?.();
    const types = endOk(run).events.map((event) => `${event.actor?.name}:${event.action.type}`);
    expect(types).toEqual([
      `${NAME}:attack`,
      "Sludge:takeDamage",
      "Sludge:attack",
      `${NAME}:takeDamage`,
    ]);
  });

  it("numbers turns from one and keeps turnCount equal to the records", () => {
    const run = createRun(tower(1));
    const records = [];
    for (let i = 0; i < 4; i++) {
      run.beginTurn().walk?.();
      records.push(endOk(run));
    }
    expect(records.map((record) => record.t)).toEqual([1, 2, 3, 4]);
    expect(run.turnCount).toBe(records.length);
    expect(records[0]?.action).toEqual({ name: "walk", direction: null });
  });
});

describe("the turn facade", () => {
  it("only offers the abilities the floor grants, as plain methods", () => {
    const turn = createRun(tower(1)).beginTurn();
    expect(Object.keys(turn).sort()).toEqual(["think", "walk"]);
    expect(Object.isFrozen(turn)).toBe(true);
    expect(typeof turn.walk).toBe("function");
    expect("action" in turn).toBe(false);
  });

  it("refuses a second action in one turn with the upstream text", () => {
    const turn = createRun(tower(1)).beginTurn();
    turn.walk?.();
    expect(() => turn.walk?.()).toThrow("Only one action can be performed per turn.");
  });

  it("revokes the facade after endTurn", () => {
    const run = createRun(tower(1));
    const turn = run.beginTurn();
    turn.walk?.();
    endOk(run);
    expect(() => turn.walk?.()).toThrow("That turn is over");
    expect(() => turn.think?.("late")).toThrow("That turn is over");
  });

  it("rejects an unknown direction before anything is recorded", () => {
    const run = createRun(tower(1));
    const turn = run.beginTurn();
    expect(() => turn.walk?.("north")).toThrow("'north' is not a direction");
    // the failed call did not use up the turn's action
    turn.walk?.("forward");
    expect(endOk(run).action).toEqual({ name: "walk", direction: "forward" });
  });

  it("rejects a direction that is not a string", () => {
    const turn = createRun(tower(1)).beginTurn();
    expect(() => turn.walk?.(null)).toThrow("is not a direction");
    expect(() => turn.walk?.(7)).toThrow("is not a direction");
  });

  it("drops arguments that rest does not take", () => {
    const run = createRun(duelConfig());
    run.beginTurn().rest?.("left");
    expect(endOk(run).action).toEqual({ name: "rest", direction: null });
  });

  it("senses immediately and rejects unknown directions in senses too", () => {
    const run = createRun(duelConfig());
    const turn = run.beginTurn();
    const space = turn.feel?.() as { isUnit(): boolean };
    expect(space.isUnit()).toBe(true);
    expect(() => turn.feel?.("up")).toThrow("'up' is not a direction");
  });

  it("refuses beginTurn twice and endTurn before beginTurn", () => {
    const run = createRun(tower(1));
    expect(() => endOk(run)).toThrow("beginTurn");
    run.beginTurn();
    expect(() => run.beginTurn()).toThrow("already begun");
  });

  it("an unrecorded turn is an idle turn", () => {
    const run = createRun(tower(1));
    run.beginTurn();
    const record = endOk(run);
    expect(record.action).toBeNull();
    expect(record.events[0]?.action.type).toBe("idle");
  });
});

describe("step", () => {
  it("step(null) is an idle turn", () => {
    const run = createRun(tower(1));
    const record = stepOk(run, null);
    expect(record.action).toBeNull();
    expect(record.events.map((event) => event.action.type)).toEqual(["idle"]);
    expect(run.turnCount).toBe(1);
  });

  it("performs the given action", () => {
    const run = createRun(tower(1));
    const record = stepOk(run, { name: "walk", direction: "forward" });
    expect(record.action).toEqual({ name: "walk", direction: "forward" });
    expect(record.events[0]?.action.type).toBe("walk");
  });

  it("returns a typed failure for an action the floor does not grant, and stays playable", () => {
    const run = createRun(tower(1));
    expect(run.step({ name: "shoot", direction: "forward" })).toEqual({
      ok: false,
      reason: { kind: "ungranted-action", action: "shoot" },
    });
    expect(run.turnCount).toBe(0);
    expect(run.status).toBe("playing");
    expect(stepOk(run, { name: "walk", direction: null }).t).toBe(1);
  });

  it("returns a typed failure for a direction that is not one, and stays playable", () => {
    const run = createRun(tower(1));
    const stepped = run.step({ name: "walk", direction: "north" as never });
    expect(stepped).toMatchObject({ ok: false, reason: { kind: "invalid-action" } });
    expect(run.turnCount).toBe(0);
    expect(run.status).toBe("playing");
  });

  it("refuses to step a finished run", () => {
    const run = createRun(tower(1));
    for (let i = 0; i < 7; i++) stepOk(run, { name: "walk", direction: null });
    expect(run.status).toBe("passed");
    expect(run.step(null)).toEqual({ ok: false, reason: { kind: "run-over" } });
    expect(() => run.beginTurn()).toThrow("The run is over.");
  });

  it("ends out of turns at 200 and says so", () => {
    const run = createRun(tower(1));
    for (let i = 0; i < 199; i++) stepOk(run, null);
    expect(run.status).toBe("playing");
    stepOk(run, null);
    expect(run.status).toBe("out-of-turns");
    expect(run.turnCount).toBe(200);
    expect(run.result()).toMatchObject({ passed: false, turns: 200, score: null });
    expect(run.step(null)).toEqual({ ok: false, reason: { kind: "run-over" } });
  });

  it("passes on turn 200 when the stairs are reached on the last turn", () => {
    const run = createRun(tower(1));
    for (let i = 0; i < 193; i++) stepOk(run, { name: "walk", direction: "backward" });
    expect(run.status).toBe("playing");
    for (let i = 0; i < 7; i++) stepOk(run, { name: "walk", direction: null });
    expect(run.turnCount).toBe(200);
    expect(run.status).toBe("passed");
  });

  it("fails when the warrior dies", () => {
    // Standing idle next to a sludge: 3 damage a turn against 20 health.
    const run = createRun(duelConfig());
    let guard = 0;
    while (run.status === "playing" && guard++ < 100) stepOk(run, null);
    expect(run.status).toBe("failed");
    expect(run.turnCount).toBe(7);
    expect(run.result()).toMatchObject({ passed: false, score: null, grade: null });
  });
});

describe("ticking captives", () => {
  it("explodes on schedule in Powder Keep 6, killing the warrior", () => {
    const run = createRun(keep(6));
    for (let i = 0; i < 6; i++) {
      const record = stepOk(run, null);
      expect(record.events.some((event) => event.action.type === "explode")).toBe(false);
      expect(run.status).toBe("playing");
    }
    const record = stepOk(run, null);
    expect(record.events.some((event) => event.action.type === "explode")).toBe(true);
    expect(run.status).toBe("failed");
    expect(record.t).toBe(7);
  });

  it("uses the Ticking effect from the level config", () => {
    expect(Ticking.with({ time: 7 })[1]).toEqual({ time: 7 });
  });
});

describe("replayLog", () => {
  it("replays a log and reports every action consumed", () => {
    const actions = Array.from({ length: 7 }, () => ({
      name: "walk" as const,
      direction: null,
    }));
    const replay = replayOk(tower(1), actions);
    expect(replay.consumed).toBe(7);
    expect(replay.records).toHaveLength(7);
    expect(replay.result.passed).toBe(true);
  });

  it("stops at the first terminal status and reports leftovers", () => {
    const actions = Array.from({ length: 10 }, () => ({
      name: "walk" as const,
      direction: null,
    }));
    const replay = replayOk(tower(1), actions);
    expect(replay.consumed).toBe(7);
    expect(actions.length - replay.consumed).toBe(3);
  });

  it("replays a log that ends while still playing", () => {
    const replay = replayOk(tower(1), [{ name: "walk", direction: null }]);
    expect(replay.consumed).toBe(1);
    expect(replay.result.passed).toBe(false);
  });

  it("returns a typed failure, with its position, on an action the floor does not grant", () => {
    const walk = { name: "walk", direction: null } as const;
    expect(replayLog(tower(1), [{ name: "shoot", direction: null }])).toMatchObject({
      ok: false,
      at: 0,
      reason: { kind: "ungranted-action", action: "shoot" },
    });
    const late = replayLog(tower(1), [walk, walk, { name: "bind", direction: "left" }]);
    expect(late).toMatchObject({ ok: false, at: 2, reason: { kind: "ungranted-action" } });
    expect(late.ok ? [] : late.records).toHaveLength(2);
  });

  it("is deterministic: two replays give identical records", () => {
    const actions = Array.from({ length: 12 }, (_, i) => ({
      name: i % 3 === 0 ? ("attack" as const) : ("walk" as const),
      direction: null,
    }));
    const a = replayOk(tower(2, true), actions);
    const b = replayOk(tower(2, true), actions);
    expect(JSON.stringify(a.records)).toBe(JSON.stringify(b.records));
  });
});

describe("configForRef", () => {
  it("builds the normal and the epic config of a floor", () => {
    expect(Object.keys(tower(1).floor.warrior.abilities ?? {}).sort()).toEqual(["think", "walk"]);
    expect(Object.keys(tower(1, true).floor.warrior.abilities ?? {})).toContain("shoot");
  });

  it("rejects a tower id that is not one, including prototype keys", () => {
    for (const bad of ["constructor", "__proto__", "toString", "hasOwnProperty", "nope"]) {
      const ref = { kind: "tower", tower: bad as never, level: 1, epic: false } as const;
      expect(() => configForRef(ref, NAME)).toThrow(`no tower "${bad}"`);
    }
  });

  it("rejects a level outside the tower", () => {
    expect(() => tower(0)).toThrow();
    expect(() => tower(10)).toThrow();
    expect(() => tower(1.5)).toThrow();
  });

  it("names the warrior", () => {
    expect(
      configForRef({ kind: "tower", tower: "powder-keep", level: 1, epic: false }, "Aldric").floor
        .warrior.name,
    ).toBe("Aldric");
  });
});

describe("ranged abilities on a custom floor", () => {
  it("shoot is a granted action only where the config grants it", () => {
    const config = duelConfig();
    config.floor.warrior.abilities = {
      ...config.floor.warrior.abilities,
      shoot: Shoot.with({ power: 3, range: 3 }),
    };
    const run = createRun(config);
    expect(stepOk(run, { name: "shoot", direction: "forward" }).events[0]?.action.type).toBe(
      "shoot",
    );
  });
});
