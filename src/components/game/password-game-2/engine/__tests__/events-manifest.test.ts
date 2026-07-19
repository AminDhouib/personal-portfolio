import { describe, expect, it } from "vitest";
import { EVENT_DEFS } from "../events/index";
import { createRun } from "../engine";
import { mulberry32 } from "../rng";
import type { EventContext, EventDef, EventFamily, EventInstance, GameState } from "../types";

/** The manifest is FINAL as to ids, families, and telegraph windows (Task 3). */
const EXPECTED: Array<{ id: string; family: EventFamily; telegraphMs: number }> = [
  { id: "gerald", family: "inhabitant", telegraphMs: 6000 },
  { id: "campfire", family: "inhabitant", telegraphMs: 6000 },
  { id: "garden", family: "inhabitant", telegraphMs: 8000 },
  { id: "infection", family: "force", telegraphMs: 8000 },
  { id: "black-hole", family: "force", telegraphMs: 8000 },
  { id: "parasite", family: "force", telegraphMs: 4000 },
  { id: "galaga", family: "invasion", telegraphMs: 10000 },
  { id: "snake", family: "invasion", telegraphMs: 6000 },
  { id: "tetris", family: "invasion", telegraphMs: 6000 },
  { id: "cookie-banner", family: "chrome", telegraphMs: 3000 },
  { id: "autocorrect", family: "chrome", telegraphMs: 5000 },
  { id: "loading-bar", family: "chrome", telegraphMs: 3000 },
];

const ALLY_BY_ID: Record<string, string> = {
  gerald: "gerald",
  campfire: "campfire",
  garden: "garden",
};

/**
 * Coupled rules injected at onset. The three inhabitants each carry one; the
 * infection (a force) carries the "no infected characters" rule. Everything else
 * (still stubs, or forces without a rule) carries none.
 */
const COUPLED_RULE_BY_ID: Record<string, string> = {
  gerald: "gerald-fed",
  campfire: "campfire-burning",
  garden: "garden-honey",
  infection: "no-infected",
};

const isInhabitant = (def: EventDef): boolean => def.family === "inhabitant";

/** Families still shipped as placeholder stubs (Tasks 8-9 replace these). */
const isStub = (def: EventDef): boolean => def.family === "invasion" || def.family === "chrome";

const state: GameState = createRun({ seed: 1, daily: false });

const makeCtx = (dtMs: number): EventContext => ({
  state,
  rng: mulberry32(1),
  dtMs,
  emit: () => {},
});

/** Mirror the engine's phaseElapsedMs bookkeeping so a def can be driven in isolation. */
const drive = (def: EventDef, inst: EventInstance, dtMs: number): void => {
  const prev = inst.phase;
  inst.phaseElapsedMs += dtMs;
  def.onTick(inst, makeCtx(dtMs));
  if (inst.phase !== prev) inst.phaseElapsedMs = 0;
};

const freshInst = (def: EventDef): EventInstance => ({
  defId: def.id,
  family: def.family,
  act: "act1",
  phase: "telegraph",
  phaseElapsedMs: 0,
  scheduledAtMs: 0,
  data: def.init(mulberry32(1), state),
});

describe("event manifest", () => {
  it("holds all twelve event defs exactly once with the final ids, families, and positive telegraphs", () => {
    expect(EVENT_DEFS).toHaveLength(EXPECTED.length);
    expect(new Set(EVENT_DEFS.map((d) => d.id)).size).toBe(EXPECTED.length);
    for (const exp of EXPECTED) {
      const def = EVENT_DEFS.find((d) => d.id === exp.id);
      expect(def).toBeDefined();
      expect(def?.family).toBe(exp.family);
      expect(def?.telegraphMs).toBe(exp.telegraphMs);
      expect(def!.telegraphMs).toBeGreaterThan(0);
    }
  });

  it("wires ally identity onto inhabitants only and coupled rules per the map", () => {
    for (const def of EVENT_DEFS) {
      if (isInhabitant(def)) {
        expect(def.allyId).toBe(ALLY_BY_ID[def.id]);
        expect(typeof def.isAlive).toBe("function");
      } else {
        expect(def.allyId).toBeUndefined();
        expect(def.isAlive).toBeUndefined();
      }
      const expectedRule = COUPLED_RULE_BY_ID[def.id];
      if (expectedRule !== undefined) expect(def.coupledRule?.id).toBe(expectedRule);
      else expect(def.coupledRule).toBeUndefined();
    }
  });

  it("inhabitants persist: telegraph -> onset -> peak, never done, unresolved until finale", () => {
    for (const def of EVENT_DEFS.filter(isInhabitant)) {
      const inst = freshInst(def);
      expect(inst.data).not.toEqual({}); // real per-creature data, not the stub payload
      expect(def.isResolved(inst, state)).toBe(false);

      // Telegraph holds for telegraphMs, then flips to onset.
      let telegraphTicks = 0;
      while (inst.phase === "telegraph" && telegraphTicks < 100) {
        drive(def, inst, 1000);
        telegraphTicks++;
      }
      expect(inst.phase).toBe("onset");
      expect(telegraphTicks).toBe(Math.ceil(def.telegraphMs / 1000));

      // Onset is a single tick, then peak — and it stays there for the whole run.
      drive(def, inst, 1000);
      expect(inst.phase).toBe("peak");
      for (let i = 0; i < 50; i++) drive(def, inst, 1000);
      expect(inst.phase).toBe("peak"); // never auto-resolves during the run
      expect(def.isResolved(inst, state)).toBe(false); // state.act is not "finale"
    }
  });

  it("runs the canonical stub lifecycle for the remaining stub families: telegraph -> onset -> peak -> done", () => {
    for (const def of EVENT_DEFS.filter(isStub)) {
      const inst = freshInst(def);
      expect(inst.data).toEqual({});
      expect(def.isResolved(inst, state)).toBe(false);

      // Telegraph holds for telegraphMs, then flips to onset.
      let telegraphTicks = 0;
      while (inst.phase === "telegraph" && telegraphTicks < 100) {
        drive(def, inst, 1000);
        telegraphTicks++;
      }
      expect(inst.phase).toBe("onset");
      expect(telegraphTicks).toBe(Math.ceil(def.telegraphMs / 1000));
      expect(def.isResolved(inst, state)).toBe(false);

      // Onset is a single tick, then peak.
      drive(def, inst, 1000);
      expect(inst.phase).toBe("peak");
      expect(def.isResolved(inst, state)).toBe(false);

      // Peak auto-resolves to done after 10s.
      let peakTicks = 0;
      while (inst.phase === "peak" && peakTicks < 100) {
        drive(def, inst, 1000);
        peakTicks++;
      }
      expect(inst.phase).toBe("done");
      expect(peakTicks).toBe(10);
      expect(def.isResolved(inst, state)).toBe(true);
    }
  });
});
