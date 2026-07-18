import { describe, expect, it } from "vitest";
import { mulberry32 } from "../rng";
import type { EventContext, EventDef, EventInstance, GameState, RunStats } from "../types";

function emptyStats(): RunStats {
  return {
    lettersAbducted: 0,
    lettersRescued: 0,
    infectionsCured: 0,
    garbageCleared: 0,
    missilesIntercepted: 0,
    aliensDowned: 0,
    creaturesSaved: 0,
    biggestCrisis: "",
    knockbacks: 0,
  };
}

function makeState(): GameState {
  return {
    seed: 1,
    daily: false,
    nextCellId: 1,
    cells: [],
    caret: 0,
    startedAtMs: null,
    elapsedMs: 0,
    act: "prologue",
    actElapsedMs: 0,
    rules: [],
    ruleStates: {},
    events: [],
    finale: null,
    outcome: "playing",
    inputLocked: false,
    stats: emptyStats(),
    effects: [],
    version: 0,
  };
}

/** Minimal but real EventDef: counts ticks and resolves at three. */
const counter: EventDef<{ n: number }> = {
  id: "test-counter",
  family: "force",
  telegraphMs: 0,
  init: () => ({ n: 0 }),
  onTick: (inst) => {
    inst.data.n += 1;
    inst.phase = "peak";
  },
  isResolved: (inst) => inst.data.n >= 3,
};

describe("EventDef contract", () => {
  it("init seeds data and isResolved tracks tick progress", () => {
    const state = makeState();
    const data = counter.init(mulberry32(state.seed), state);
    expect(data.n).toBe(0);

    const inst: EventInstance<{ n: number }> = {
      defId: counter.id,
      family: counter.family,
      act: "act1",
      phase: "telegraph",
      phaseElapsedMs: 0,
      scheduledAtMs: 0,
      data,
    };
    expect(counter.isResolved(inst, state)).toBe(false);

    const ctx: EventContext = { state, rng: mulberry32(1), dtMs: 16, emit: () => {} };
    counter.onTick(inst, ctx);
    counter.onTick(inst, ctx);
    expect(counter.isResolved(inst, state)).toBe(false);
    counter.onTick(inst, ctx);
    expect(inst.data.n).toBe(3);
    expect(inst.phase).toBe("peak");
    expect(counter.isResolved(inst, state)).toBe(true);
  });
});
