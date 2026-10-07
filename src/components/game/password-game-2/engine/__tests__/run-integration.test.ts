import { describe, expect, it } from "vitest";
import { applyPointer, createRun, makeRuleApi, requestSubmit, tick } from "../engine";
import { drainEffects } from "../effects";
import { cellsToPassword } from "../cells";
import { CORE_RULES } from "../rules/index";
import { ACT_SCRIPTS } from "../director";
import {
  COUPLED_INHAB_RULE_IDS,
  HHMM,
  TELEGRAPH_MS,
  TICK_MS,
  coreRevealed,
  nonInhabDone,
  nonInhabitant,
  retype,
  solveAndTick,
  tend,
} from "./drive";
import type { GalagaData } from "../events/galaga";
import type { MissilesData } from "../events/finale";
import type { ActId, Effect, GameState } from "../types";

/**
 * The headless full-run integration harness: a scripted, deterministic drive of a
 * whole run through the public engine API (applyKey / tick / requestSubmit), the
 * pacing safety net now that every event family (through the chrome nuisances) is real.
 *
 * It ticks at the real 100ms cadence and solves the revealed rule set through the
 * append-only test solver as rules reveal, so the only thing gating an act boundary
 * is the act's scheduled events resolving on their authored timeline. Pacing
 * expectations are DERIVED from the realized schedule (g.events, which the Director
 * built from ACT_SCRIPTS) plus each def's telegraphMs and the driver's tending — no
 * hardcoded transition timestamps.
 */

/** Acts that carry scripted events, in the order the run walks through them. */
const SCRIPTED_ACTS = ["act1", "act2", "act3"] as const;

const boot = (seed: number) => createRun({ seed, daily: false, nowHHMM: () => HHMM });

/**
 * The last (max) act-relative ONSET among the act's blocking (non-inhabitant)
 * beats — scheduledAtMs + telegraphMs. An act cannot advance before its final
 * blocking beat has onset and resolved, so this is a hard lower bound on the act's
 * duration; forces resolve on the driver's cure/evict/collapse timing rather than a
 * fixed peak, so the upper bound is a generous window past this (see the test).
 */
const lastBlockingOnsetMs = (g: GameState, act: ActId): number => {
  const times = g.events
    .filter((e) => e.act === act && nonInhabitant(e))
    .map((e) => e.scheduledAtMs + (TELEGRAPH_MS.get(e.defId) ?? 0));
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
  /** Every act3 invasion/force/chrome was resolved at finale entry (the submit gate). */
  act3NonInhabAllDoneAtFinale: boolean;
  /** Galaga marquee telemetry at the satisfying submit. */
  lettersAbducted: number;
  lettersRescued: number;
  aliensDowned: number;
  galagaTimedOutWaves: number;
  galagaFinalWavePassesAtSubmit: boolean;
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
  // rule passes AND every act3 blocking beat has resolved — the submit gate now needs
  // both, so the caretaker fights the three Galaga waves (and the other invasions/
  // forces/chrome) to their end. Gate on the CORE count, since g.rules also holds
  // coupled ones. The window is generous: act3's blocking beats run past the four-
  // minute mark, and the marquee's three waves take many dive/shot cycles.
  for (let i = 0; i < 4000; i++) {
    step();
    const pw = cellsToPassword(g.cells);
    if (
      coreRevealed(g) === CORE_RULES.length &&
      g.rules.every((r) => r.validate(pw, g, api).passed) &&
      nonInhabDone(g, "act3")
    ) {
      break;
    }
  }
  const pw = cellsToPassword(g.cells);
  expect(coreRevealed(g)).toBe(CORE_RULES.length);
  expect(g.rules.every((r) => r.validate(pw, g, api).passed)).toBe(true);
  const act3NonInhabAllDoneAtFinale = nonInhabDone(g, "act3");

  // Galaga marquee telemetry at the satisfying submit.
  const galaga = g.events.find((e) => e.defId === "galaga");
  const galagaData = galaga?.data as GalagaData | undefined;
  const galagaRule = g.rules.find((r) => r.id === "galaga-final-wave");
  const galagaFinalWavePassesAtSubmit =
    galagaRule !== undefined && galagaRule.validate(pw, g, api).passed;

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
    act3NonInhabAllDoneAtFinale,
    lettersAbducted: g.stats.lettersAbducted,
    lettersRescued: g.stats.lettersRescued,
    aliensDowned: g.stats.aliensDowned,
    galagaTimedOutWaves: galagaData?.timedOutWaves ?? 0,
    galagaFinalWavePassesAtSubmit,
  };
}

const SEED = 7;

/** The current missile-phase working state, straight off the finale data bag. */
const finaleMissiles = (g: GameState): MissilesData =>
  (g.finale!.data as { missiles: MissilesData }).missiles;

/**
 * Fight the finale to victory with pointers only (the zero-hardware path the stage
 * would drive): intercept every falling missile each frame, click the real EULA
 * checkbox the moment the phase opens, and catch the runaway button on sight. Fails
 * loudly via the iteration cap rather than hanging if a phase never clears.
 */
const finishFinale = (g: GameState) => {
  let guard = 0;
  while (g.outcome !== "victory" && guard++ < 5000) {
    const phase = g.finale!.phase;
    if (phase === "missiles") {
      for (const m of finaleMissiles(g).missiles) {
        if (m.state === "falling") applyPointer(g, { kind: "missile", id: m.id });
      }
    } else if (phase === "eula") {
      applyPointer(g, { kind: "eula-checkbox" });
    } else {
      applyPointer(g, { kind: "submit-button" });
    }
    tick(g, TICK_MS);
    drainEffects(g);
  }
};

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

  it("clears the marquee: the submit gate held until every act3 invasion resolved", () => {
    const r = driveRun(SEED);
    // The submit gate held: every act3 blocking beat was done before the finale opened.
    expect(r.act3NonInhabAllDoneAtFinale).toBe(true);
    expect(r.galagaFinalWavePassesAtSubmit).toBe(true);
    expect(r.lettersAbducted).toBeGreaterThan(0);
    expect(r.lettersRescued).toBeGreaterThan(0);
    expect(r.aliensDowned).toBeGreaterThanOrEqual(12 + 8 + 6);
    expect(r.galagaTimedOutWaves).toBe(0);
  });

  it("advances each act once its blocking beats resolve, pulled forward from the authored timeline", () => {
    const r = driveRun(SEED);
    const byFrom = new Map(r.transitions.map((t) => [t.from, t]));

    // Prologue carries no scheduled events, so it advances on rules alone — fast.
    const prologue = byFrom.get("prologue")!;
    expect(prologue.actDurationMs).toBeLessThan(5_000);
    expect(r.g.events.some((e) => e.act === "prologue")).toBe(false);

    // act1 and act2 are gated by their last blocking (non-inhabitant) event. act1's
    // chrome resolves on the driver's tendChrome (a dismiss/toggle, or the loading bar's
    // brief keyboard seizure); act2's forces resolve on the driver's cure/collapse/evict
    // timing. The instant solver finishes the rules early, so pull-forward brings the
    // blocking beats sooner than the authored clock: the act ends BEFORE the authored
    // last onset, and still not idling minutes after.
    for (const act of ["act1", "act2"] as const) {
      const t = byFrom.get(act)!;
      const onset = lastBlockingOnsetMs(boot(SEED), act); // authored, not pulled forward
      expect(onset).toBeGreaterThan(0);
      expect(t.actDurationMs).toBeLessThan(onset);
      expect(t.actDurationMs).toBeLessThanOrEqual(onset + 60_000);

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
    // Sanity: it is not instantaneous either - every event still plays out. Measured for
    // SEED: 521.3 s before pull-forward, 178.3 s after; the floor is about 60 percent of
    // the current value.
    expect(r.elapsedAtFinaleMs).toBeGreaterThan(100_000);
  });

  it("pull-forward never skips an event: every event of a passed act was inited and finished", () => {
    const r = driveRun(SEED);
    for (const act of ["act1", "act2"] as const) {
      const evs = r.g.events.filter((e) => e.act === act);
      expect(evs.length).toBeGreaterThan(0);
      expect(evs.every((e) => e.data !== undefined)).toBe(true);
      expect(evs.filter((e) => e.family !== "inhabitant").every((e) => e.phase === "done")).toBe(
        true,
      );
    }
    expect(r.act3NonInhabAllDoneAtFinale).toBe(true);
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
    // Tend the blocking forces so the acts still advance, but leave the creatures to
    // their fate. The campfire should burn out and scar the password; the bear
    // should trample the garden. Failure transforms the run — it never deletes it.
    const g = boot(SEED);
    const api = makeRuleApi(g, () => HHMM);

    let sawEmberCell = false;
    let sawEatToast = false;
    let sawTrample = false;
    // Pull-forward reaches act3 before the fire has burned out, so keep playing in act3
    // (no submit) until the creatures' fate has played out.
    const campfireOut = () =>
      (g.events.find((e) => e.defId === "campfire")?.data as { burning: boolean } | undefined)
        ?.burning === false;
    for (let i = 0; i < 6000 && !(g.act === "act3" && campfireOut() && sawTrample); i++) {
      // Solve the roster and tend the forces (to advance acts), neglect the creatures.
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

  it("untended, forces TRANSFORM the box without crashing", () => {
    // Reach act2 while neglecting everything, plant a benign field of special chars
    // (no lowercase letters, so it can never contain an antidote or a heavy word),
    // then stop touching it and let the scheduled forces work on those cells. The
    // two seeds between them exercise all three forces: seed 7 is black-hole +
    // infection, seed 42 is black-hole + parasite.
    for (const seed of [7, 42]) {
      const g = boot(seed);
      const api = makeRuleApi(g, () => HHMM);
      for (let i = 0; i < 6000 && g.act !== "act2"; i++) {
        solveAndTick(g, api, { tendInhabitants: false, tendForces: false });
      }
      expect(g.act).toBe("act2");

      const act2Forces = g.events
        .filter((e) => e.act === "act2" && nonInhabitant(e))
        .map((e) => e.defId);
      expect(act2Forces.length).toBeGreaterThan(0);

      retype(g, "@".repeat(24)); // a fixed field the forces cannot cure or collapse

      let sawInfected = false;
      let sawMutated = false;
      let sawOrbitingExcluded = false;
      let sawParasiteMismatch = false;
      for (let i = 0; i < 2600; i++) {
        tick(g, TICK_MS);
        const visible = g.cells.length; // every cell renders
        const valueLen = [...cellsToPassword(g.cells)].length; // excluded cells drop out
        if (g.cells.some((c) => c.status === "infected")) sawInfected = true;
        if (g.cells.some((c) => c.status === "mutated")) sawMutated = true;
        if (g.cells.some((c) => c.status === "orbiting") && valueLen < visible) {
          sawOrbitingExcluded = true;
        }
        if (g.cells.some((c) => c.status === "parasite") && valueLen < visible) {
          sawParasiteMismatch = true; // more glyphs on screen than the value counts
        }
        drainEffects(g);
      }

      if (act2Forces.includes("infection")) {
        expect(sawInfected).toBe(true);
        expect(sawMutated).toBe(true); // a cell sick past 45s mutated
      }
      if (act2Forces.includes("black-hole")) expect(sawOrbitingExcluded).toBe(true);
      if (act2Forces.includes("parasite")) expect(sawParasiteMismatch).toBe(true);

      // The box survived every untended force: no crash, still in act2, caret in range.
      expect(g.act).toBe("act2");
      expect(g.outcome).toBe("playing");
      expect(g.finale).toBeNull();
      expect(g.caret).toBeLessThanOrEqual(g.cells.length);
    }
  });

  it("neglected, a Galaga wave times out and the gate refuses submit until the fight is finished", () => {
    const g = boot(SEED);
    const api = makeRuleApi(g, () => HHMM);

    // Reach act3 with full tending.
    for (let i = 0; i < 6000 && g.act !== "act3"; i++) solveAndTick(g, api);
    expect(g.act).toBe("act3");

    const galagaData = (): GalagaData | undefined =>
      g.events.find((e) => e.defId === "galaga")?.data as GalagaData | undefined;

    // Neglect the fleet: tend the creatures to keep the run alive, but never fire and
    // do not re-solve (a solve would try to top up letters the fleet is abducting). A
    // wave outlives its 45s cap and times out, its carried letters raining back and its
    // survivors fleeing rather than dying.
    let timedOut = false;
    for (let i = 0; i < 2500 && !timedOut; i++) {
      tend(g);
      tick(g, TICK_MS);
      drainEffects(g);
      if ((galagaData()?.timedOutWaves ?? 0) > 0) timedOut = true;
    }
    expect(timedOut).toBe(true);
    expect(galagaData()!.timedOutWaves).toBeGreaterThan(0);

    // The coupled rule fails (the final wave was not shot down) and the gate refuses:
    // neglect cannot skip the marquee any more than speed can.
    const galagaRule = g.rules.find((r) => r.id === "galaga-final-wave")!;
    expect(galagaRule.validate(cellsToPassword(g.cells), g, api).passed).toBe(false);
    drainEffects(g);
    requestSubmit(g);
    expect(g.act).toBe("act3");
    expect(g.finale).toBeNull();
    expect(g.effects.some((e) => e.kind === "toast" && e.tone === "danger")).toBe(true);

    // Finish the fight: fully tend until every rule passes and every act3 blocking beat
    // resolves, then the same submit opens the finale — the run is still winnable.
    for (let i = 0; i < 4000; i++) {
      solveAndTick(g, api);
      const pw = cellsToPassword(g.cells);
      if (
        coreRevealed(g) === CORE_RULES.length &&
        g.rules.every((r) => r.validate(pw, g, api).passed) &&
        nonInhabDone(g, "act3")
      ) {
        break;
      }
    }
    requestSubmit(g);
    expect(g.act).toBe("finale");
    expect(g.finale).not.toBeNull();
  });

  it("drives the caretaker run through the finale to victory and populates the receipt", () => {
    const r = driveRun(SEED);
    const g = r.g;
    expect(g.act).toBe("finale");
    expect(g.finale!.phase).toBe("missiles");

    const alliesAtStart = g.finale!.allies.length;
    finishFinale(g);

    // The run is won, cleanly (no knockbacks on the tended path).
    expect(g.outcome).toBe("victory");
    expect(g.stats.knockbacks).toBe(0);

    // Every creature kept alive joined the finale, and the marquee stats are populated.
    expect(g.stats.creaturesSaved).toBe(alliesAtStart);
    expect(g.stats.creaturesSaved).toBe(r.inhabitants.length);
    expect(g.stats.missilesIntercepted).toBeGreaterThan(0);
    expect(g.stats.biggestCrisis).not.toBe(""); // some event held a peak long enough

    // The clock ran the whole time and lands in a sane window.
    expect(g.elapsedMs).toBeGreaterThan(r.elapsedAtFinaleMs);
    expect(g.elapsedMs).toBeLessThan(30 * 60 * 1_000);
  });

  it("knocks back once when the missiles are neglected, then the finale is still winnable", () => {
    const r = driveRun(SEED);
    const g = r.g;
    expect(g.finale!.phase).toBe("missiles");
    // Seed 7 fields no Gerald, so nothing intercepts for the player: ignore the
    // missiles and four will land, restarting the phase exactly once.
    let guard = 0;
    while (g.stats.knockbacks < 1 && guard++ < 3000) {
      tick(g, TICK_MS);
      drainEffects(g);
    }
    expect(g.stats.knockbacks).toBe(1);
    expect(g.finale!.attempts).toBe(1);
    expect(g.finale!.phase).toBe("missiles"); // knocked back to the phase start, never out

    // Fight it properly from the restart and win — knockback is a setback, not a loss.
    finishFinale(g);
    expect(g.outcome).toBe("victory");
  });
});
