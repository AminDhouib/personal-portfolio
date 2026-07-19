import { describe, expect, it } from "vitest";
import { applyKey, createRun, makeRuleApi, requestSubmit, tick } from "../engine";
import { drainEffects } from "../effects";
import { cellsToPassword } from "../cells";
import { CORE_RULES } from "../rules/index";
import { EVENT_DEFS } from "../events/index";
import { ACT_SCRIPTS } from "../director";
import { solveAll } from "./solve";
import type { ActId, Effect, EventInstance, GameState, RuleApi } from "../types";

/**
 * The headless full-run integration harness: a scripted, deterministic drive of a
 * whole run through the public engine API (applyKey / tick / requestSubmit), the
 * pacing safety net that Tasks 6-10 extend as the stub events become real ones.
 *
 * It ticks at the real 100ms cadence and solves the revealed rule set through the
 * append-only test solver as rules reveal, so the only thing gating an act boundary
 * is the act's scheduled events resolving on their authored timeline. Pacing
 * expectations are DERIVED from the realized schedule (g.events, which the Director
 * built from ACT_SCRIPTS) plus each def's telegraphMs and the stub peak below — no
 * hardcoded transition timestamps.
 */

const HHMM = "12:00";
const TICK_MS = 100;

/**
 * Stub peak length before a placeholder event auto-resolves, mirroring STUB_PEAK_MS
 * in events/index.ts (module-private there). A blocking stub therefore resolves at
 * scheduledAtMs + telegraphMs + STUB_PEAK_MS in act-relative time. Tasks 6-10 that
 * replace stubs with real timings will re-derive this per event.
 */
const STUB_PEAK_MS = 10_000;

/** telegraphMs by def id, straight off the manifest. */
const TELEGRAPH_MS = new Map(EVENT_DEFS.map((d) => [d.id, d.telegraphMs]));

/** Acts that carry scripted events, in the order the run walks through them. */
const SCRIPTED_ACTS = ["act1", "act2", "act3"] as const;

const boot = (seed: number) => createRun({ seed, daily: false, nowHHMM: () => HHMM });

const type = (g: GameState, s: string) => {
  for (const k of s) applyKey(g, k);
};

/** Replace the whole password through the public key API: clear to empty, then type. */
const retype = (g: GameState, target: string) => {
  applyKey(g, "End");
  while (g.cells.length > 0) applyKey(g, "Backspace");
  type(g, target);
};

/** Solve every revealed rule (retyping only on change) then advance one 100ms frame. */
const solveAndTick = (g: GameState, api: RuleApi) => {
  const target = solveAll(g, api);
  if (target !== cellsToPassword(g.cells)) retype(g, target);
  tick(g, TICK_MS);
};

const nonInhabitant = (e: EventInstance) => e.family !== "inhabitant";

/** The last blocking (non-inhabitant) beat's act-relative resolve time, or 0. */
const expectedActResolveMs = (g: GameState, act: ActId): number => {
  const times = g.events
    .filter((e) => e.act === act && nonInhabitant(e))
    .map((e) => e.scheduledAtMs + (TELEGRAPH_MS.get(e.defId) ?? 0) + STUB_PEAK_MS);
  return times.length === 0 ? 0 : Math.max(...times);
};

interface Transition {
  from: ActId;
  to: ActId;
  elapsedMs: number;
  actDurationMs: number; // elapsed spent inside `from`
  /** Every non-inhabitant beat of the outgoing act is `done` at the boundary. */
  outgoingNonInhabAllDone: boolean;
  /** Every inhabitant of the outgoing act is past telegraph at the boundary. */
  outgoingInhabsPastTelegraph: boolean;
}

interface DriveResult {
  g: GameState;
  transitions: Transition[];
  titleCardActs: ActId[]; // one per act transition + the finale card, in order
  prematureSubmitRefused: boolean;
  prematureSubmitStayedInPrologue: boolean;
  finaleAct: ActId;
  finalePhase: string | undefined;
  allies: string[];
  inhabitants: string[];
  ruleDescriptions: string[];
  elapsedAtFinaleMs: number;
}

/**
 * Drive one full run to the finale. Collects title cards by draining the effect
 * queue each frame, records the act-transition timeline, and snapshots event
 * lifecycle at every boundary. Fails loudly (via the iteration caps) rather than
 * hanging if the arc never completes.
 */
function driveRun(seed: number): DriveResult {
  const g = boot(seed);
  const api = makeRuleApi(g, () => HHMM);

  // A submit before any rule passes is refused with a toast and does not advance.
  requestSubmit(g);
  const prematureSubmitRefused = g.effects.some((e) => e.kind === "toast");
  const prematureSubmitStayedInPrologue = g.act === "prologue" && g.finale === null;
  drainEffects(g); // clear the refusal toast before the real drive

  const titleCards: Effect[] = [];
  const transitions: Transition[] = [];
  const actStartElapsed = new Map<ActId, number>([["prologue", 0]]);

  const step = () => {
    const before = g.act;
    solveAndTick(g, api);
    for (const e of drainEffects(g)) if (e.kind === "title-card") titleCards.push(e);
    if (g.act !== before) {
      actStartElapsed.set(g.act, g.elapsedMs);
      transitions.push({
        from: before,
        to: g.act,
        elapsedMs: g.elapsedMs,
        actDurationMs: g.elapsedMs - (actStartElapsed.get(before) ?? 0),
        outgoingNonInhabAllDone: g.events
          .filter((e) => e.act === before && nonInhabitant(e))
          .every((e) => e.phase === "done"),
        outgoingInhabsPastTelegraph: g.events
          .filter((e) => e.act === before && e.family === "inhabitant")
          .every((e) => e.phase !== "telegraph"),
      });
    }
  };

  // Phase 1: walk prologue -> act1 -> act2 -> act3 (event-gated boundaries).
  for (let i = 0; i < 6000 && g.act !== "act3"; i++) step();
  expect(g.act).toBe("act3");

  // Phase 2: stay in act3 until the full 17-rule roster is revealed and passing.
  for (let i = 0; i < 600; i++) {
    step();
    const pw = cellsToPassword(g.cells);
    if (
      g.rules.length === CORE_RULES.length &&
      g.rules.every((r) => r.validate(pw, g, api).passed)
    ) {
      break;
    }
  }
  const pw = cellsToPassword(g.cells);
  expect(g.rules.length).toBe(CORE_RULES.length);
  expect(g.rules.every((r) => r.validate(pw, g, api).passed)).toBe(true);

  const elapsedAtFinaleMs = g.elapsedMs;
  requestSubmit(g); // the satisfying submit opens the finale
  for (const e of drainEffects(g)) if (e.kind === "title-card") titleCards.push(e);

  const inhabitants = [
    ...new Set(g.events.filter((e) => e.family === "inhabitant").map((e) => e.defId)),
  ].sort();

  return {
    g,
    transitions,
    titleCardActs: titleCards.map((c) => (c.kind === "title-card" ? c.act : "prologue")),
    prematureSubmitRefused,
    prematureSubmitStayedInPrologue,
    finaleAct: g.act,
    finalePhase: g.finale?.phase,
    allies: [...(g.finale?.allies ?? [])].sort(),
    inhabitants,
    ruleDescriptions: g.rules.map((r) => r.description),
    elapsedAtFinaleMs,
  };
}

const SEED = 7;

describe("password-game-2 full-run integration", () => {
  it("walks the full arc prologue -> act1 -> act2 -> act3 -> finale, in order, once each", () => {
    const r = driveRun(SEED);

    // A submit before rules pass was refused with a toast and did not advance.
    expect(r.prematureSubmitRefused).toBe(true);
    expect(r.prematureSubmitStayedInPrologue).toBe(true);

    // The three time/event-gated boundaries, each exactly once, in order.
    expect(r.transitions.map((t) => `${t.from}->${t.to}`)).toEqual([
      "prologue->act1",
      "act1->act2",
      "act2->act3",
    ]);

    // Exactly one title card per act transition plus the finale card, in order.
    expect(r.titleCardActs).toEqual(["act1", "act2", "act3", "finale"]);

    // The satisfying submit opened the finale on the missiles phase.
    expect(r.finaleAct).toBe("finale");
    expect(r.finalePhase).toBe("missiles");

    // Allies are exactly the run's scheduled inhabitants (all onset by act3).
    expect(r.inhabitants.length).toBeGreaterThan(0);
    expect(r.allies).toEqual(r.inhabitants);
  });

  it("advances each act only after its last blocking beat resolves on the authored timeline", () => {
    const r = driveRun(SEED);
    const byFrom = new Map(r.transitions.map((t) => [t.from, t]));

    // Prologue carries no scheduled events, so it advances on rules alone — fast.
    const prologue = byFrom.get("prologue")!;
    expect(prologue.actDurationMs).toBeLessThan(5_000);
    expect(r.g.events.some((e) => e.act === "prologue")).toBe(false);

    // act1 and act2 are gated by their last blocking (non-inhabitant) event: the
    // boundary lands at scheduledAtMs + telegraphMs + STUB_PEAK_MS, derived from the
    // realized schedule — never before the beat resolves, and not idling after.
    for (const act of ["act1", "act2"] as const) {
      const t = byFrom.get(act)!;
      const expected = expectedActResolveMs(r.g, act);
      expect(expected).toBeGreaterThan(0);
      expect(t.actDurationMs).toBeGreaterThanOrEqual(expected);
      expect(t.actDurationMs).toBeLessThanOrEqual(expected + 500);

      // Lifecycle at the boundary: every blocking beat done; inhabitant past telegraph.
      expect(t.outgoingNonInhabAllDone).toBe(true);
      expect(t.outgoingInhabsPastTelegraph).toBe(true);
    }

    // Every scheduled non-inhabitant event in the acts that advanced reached "done".
    for (const act of ["act1", "act2"] as const) {
      const blocking = r.g.events.filter((e) => e.act === act && nonInhabitant(e));
      expect(blocking.length).toBeGreaterThan(0);
      expect(blocking.every((e) => e.phase === "done")).toBe(true);
    }
  });

  it("reaches the finale in well under 15 simulated minutes with the instant solver", () => {
    const r = driveRun(SEED);
    expect(r.elapsedAtFinaleMs).toBeLessThan(15 * 60 * 1_000);
    // Sanity: it is not instantaneous either — the scripted acts take real sim time.
    expect(r.elapsedAtFinaleMs).toBeGreaterThan(5 * 60 * 1_000);
  });

  it("keeps every scripted inhabitant early enough in its act to onset before the act ends", () => {
    // The realized schedule places each inhabitant before its act's last blocking
    // beat, matching the Director's early-inhabitant invariant in ACT_SCRIPTS.
    for (const act of SCRIPTED_ACTS) {
      const g = boot(SEED);
      const lastBlockingAt = Math.max(
        0,
        ...ACT_SCRIPTS[act].filter((s) => s.family !== "inhabitant").map((s) => s.atMs),
      );
      const inhabitants = g.events.filter((e) => e.act === act && e.family === "inhabitant");
      for (const inh of inhabitants) expect(inh.scheduledAtMs).toBeLessThan(lastBlockingAt);
    }
  });

  it("is deterministic: the same seed reproduces the timeline, allies, and final rules", () => {
    const a = driveRun(SEED);
    const b = driveRun(SEED);

    expect(a.transitions.map((t) => t.elapsedMs)).toEqual(b.transitions.map((t) => t.elapsedMs));
    expect(a.titleCardActs).toEqual(b.titleCardActs);
    expect(a.allies).toEqual(b.allies);
    expect(a.inhabitants).toEqual(b.inhabitants);
    expect(a.ruleDescriptions).toEqual(b.ruleDescriptions);
    expect(a.elapsedAtFinaleMs).toBe(b.elapsedAtFinaleMs);
  });
});
