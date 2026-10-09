// @vitest-environment node
import { describe, expect, it } from "vitest";

import { Walk } from "../abilities";
import type { LevelConfig } from "../core/level-config";
import { Unit } from "../core/unit";
import { createRun } from "../run";
import { EAST, WEST } from "../spatial";

/** A real unit whose own decision fails, standing for any bug the engine could still have. */
class Faulty extends Unit {
  override readonly name = "Faulty";
  override readonly maxHealth = 5;

  override playTurn(): void {
    throw new Error("boom");
  }
}

function faultyConfig(): LevelConfig {
  return {
    number: 1,
    description: "",
    tip: "",
    clue: "",
    timeBonus: 10,
    aceScore: 10,
    floor: {
      size: { width: 4, height: 1 },
      stairs: { x: 3, y: 0 },
      warrior: {
        name: "Probe",
        maxHealth: 20,
        abilities: { walk: Walk },
        position: { x: 0, y: 0, facing: EAST },
      },
      units: [{ unit: Faulty, position: { x: 2, y: 0, facing: WEST } }],
    },
  };
}

describe("an engine exception", () => {
  it("ends the run with a typed engine-error instead of escaping from step", () => {
    const run = createRun(faultyConfig());
    const stepped = run.step({ name: "walk", direction: null });
    expect(stepped).toEqual({ ok: false, reason: { kind: "engine-error", message: "boom" } });
    expect(run.status).toBe("engine-error");
    expect(run.failure).toEqual({ kind: "engine-error", message: "boom" });
  });

  it("does not count the half-played turn", () => {
    const run = createRun(faultyConfig());
    run.step({ name: "walk", direction: null });
    expect(run.turnCount).toBe(0);
    expect(run.result()).toMatchObject({ passed: false, score: null, grade: null, turns: 0 });
  });

  it("is terminal: nothing more can be played", () => {
    const run = createRun(faultyConfig());
    run.step(null);
    expect(() => run.beginTurn()).toThrow("The run is over.");
  });

  it("is also caught when the caller drives beginTurn and endTurn itself", () => {
    const run = createRun(faultyConfig());
    run.beginTurn().walk?.();
    expect(run.endTurn()).toMatchObject({ ok: false, reason: { kind: "engine-error" } });
    expect(run.status).toBe("engine-error");
  });
});
