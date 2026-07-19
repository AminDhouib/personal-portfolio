import { describe, expect, it } from "vitest";
import { applyKey, applyPointer, createRun, makeRuleApi, requestSubmit, tick } from "../engine";
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

/** Core-rule ids — the roster the solver drives; coupled inhabitant rules are tended. */
const CORE_IDS = new Set(CORE_RULES.map((d) => d.id));

/** Coupled inhabitant rules injected at onset; satisfied by tending, not typing. */
const COUPLED_INHAB_RULE_IDS = new Set(["gerald-fed", "campfire-burning", "garden-honey"]);

/** Count of revealed CORE rules (excludes coupled inhabitant rules). */
const coreRevealed = (g: GameState) => g.rules.filter((r) => CORE_IDS.has(r.id)).length;

/** Acts that carry scripted events, in the order the run walks through them. */
const SCRIPTED_ACTS = ["act1", "act2", "act3"] as const;

const boot = (seed: number) => createRun({ seed, daily: false, nowHHMM: () => HHMM });

const type = (g: GameState, s: string) => {
  for (const k of s) applyKey(g, k);
};

/** Replace the whole password through the public key API: clear to empty, then type. */
const retype = (g: GameState, target: string) => {
  applyKey(g, "End");
  let guard = 0;
  while (g.cells.length > 0) {
    if (++guard > 500) throw new Error("retype: backspace loop exceeded 500 iterations");
    applyKey(g, "Backspace");
  }
  type(g, target);
};

/**
 * Tend the live inhabitants so they survive to the finale and their coupled rules
 * are satisfied at submit: stoke the campfire on its cooldown, feed Gerald, and
 * toss the picnic basket whenever the bear is not away. Deterministic in run state.
 * The campfire is stoked every frame (rate-limited internally by its 1.5s cooldown)
 * rather than on a slow cadence — see the concern noted on the caretaker test.
 */
const tend = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "gerald") applyPointer(g, { kind: "feed-button" });
    else if (e.defId === "campfire") applyPointer(g, { kind: "stoke-button" });
    else if (e.defId === "garden") {
      const bearState = (e.data as { bearState: string }).bearState;
      if (bearState !== "away") applyPointer(g, { kind: "basket-button" });
    }
  }
};

/** Solve the revealed roster (retyping only on change), tend, then advance one frame. */
const solveAndTick = (g: GameState, api: RuleApi, opts: { tendInhabitants?: boolean } = {}) => {
  const target = solveAll(g, api);
  if (target !== cellsToPassword(g.cells)) retype(g, target);
  if (opts.tendInhabitants !== false) tend(g);
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
  /** Coupled inhabitant rules present in the roster, and whether all passed at submit. */
  coupledInhabitantRuleIds: string[];
  coupledInhabitantRulesPassAtSubmit: boolean;
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

  // Phase 2: stay in act3 until the full 17-rule CORE roster is revealed and every
  // rule passes — including the coupled inhabitant rules, which the caretaker keeps
  // satisfied by tending. Gate on the CORE count, since g.rules also holds coupled ones.
  for (let i = 0; i < 600; i++) {
    step();
    const pw = cellsToPassword(g.cells);
    if (
      coreRevealed(g) === CORE_RULES.length &&
      g.rules.every((r) => r.validate(pw, g, api).passed)
    ) {
      break;
    }
  }
  const pw = cellsToPassword(g.cells);
  expect(coreRevealed(g)).toBe(CORE_RULES.length);
  expect(g.rules.every((r) => r.validate(pw, g, api).passed)).toBe(true);

  // Snapshot the coupled inhabitant rules' state at the moment of the satisfying submit.
  const coupledRules = g.rules.filter((r) => COUPLED_INHAB_RULE_IDS.has(r.id));
  const coupledInhabitantRuleIds = coupledRules.map((r) => r.id).sort();
  const coupledInhabitantRulesPassAtSubmit = coupledRules.every(
    (r) => r.validate(pw, g, api).passed,
  );

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
    coupledInhabitantRuleIds,
    coupledInhabitantRulesPassAtSubmit,
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

    // Allies are exactly the run's scheduled inhabitants (all onset by act3) — the
    // caretaker kept every creature alive, so none dropped out of the finale roster.
    expect(r.inhabitants.length).toBeGreaterThan(0);
    expect(r.allies).toEqual(r.inhabitants);

    // Seed 7 schedules the campfire (act1) and the garden (act2); no Gerald this seed.
    expect(r.inhabitants).toEqual(["campfire", "garden"]);

    // Their coupled rules were injected and were all satisfied at the satisfying submit.
    expect(r.coupledInhabitantRuleIds).toEqual(["campfire-burning", "garden-honey"]);
    expect(r.coupledInhabitantRulesPassAtSubmit).toBe(true);
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

  it("untended, inhabitants TRANSFORM rather than crash: the fire embers and eats, the bear tramples", () => {
    // No tending this run. The campfire should burn out and scar the password; the
    // bear should trample the garden. Failure transforms the run — it never deletes it.
    const g = boot(SEED);
    const api = makeRuleApi(g, () => HHMM);

    let sawEmberCell = false;
    let sawEatToast = false;
    let sawTrample = false;
    for (let i = 0; i < 6000 && g.act !== "act3"; i++) {
      // Solve the roster (to advance acts) but leave the creatures to their fate.
      solveAndTick(g, api, { tendInhabitants: false });
      // An ember scar is wiped by the next frame's retype, so scan every frame.
      if (g.cells.some((c) => c.status === "ember")) sawEmberCell = true;
      for (const e of drainEffects(g)) {
        if (e.kind === "toast" && e.text === "The campfire is eating your password.") {
          sawEatToast = true;
        }
        if (e.kind === "mood" && e.text === "The bear trampled the garden") sawTrample = true;
      }
    }
    expect(g.act).toBe("act3");

    // The campfire burned out: not burning, having scarred the password at least once.
    const campfire = g.events.find((e) => e.defId === "campfire");
    expect((campfire!.data as { burning: boolean }).burning).toBe(false);
    expect(sawEmberCell).toBe(true);
    expect(sawEatToast).toBe(true);

    // Its coupled rule now FAILS — the fire is out, so a submit here would be refused.
    const burningRule = g.rules.find((r) => r.id === "campfire-burning")!;
    expect(burningRule.validate(cellsToPassword(g.cells), g, api).passed).toBe(false);

    // The untended bear trampled the garden at least once on its authored timeline.
    expect(sawTrample).toBe(true);

    // The run is intact and still playable — no crash, no deletion, caret in range.
    expect(g.outcome).toBe("playing");
    expect(g.finale).toBeNull();
    expect(g.caret).toBeLessThanOrEqual(g.cells.length);
  });
});
