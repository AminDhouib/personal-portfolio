import { describe, expect, it } from "vitest";
import { applyKey, applyPointer, createRun, makeRuleApi, requestSubmit, tick } from "../engine";
import { drainEffects } from "../effects";
import { cellsToPassword } from "../cells";
import { CORE_RULES } from "../rules/index";
import { EVENT_DEFS } from "../events/index";
import { ACT_SCRIPTS } from "../director";
import { solveAll } from "./solve";
import type { GalagaData } from "../events/galaga";
import type { SnakeData } from "../events/snake";
import type { CookieBannerData } from "../events/cookie-banner";
import type { AutocorrectData } from "../events/autocorrect";
import type { ActId, Effect, EventInstance, GameState, RuleApi } from "../types";

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

const HHMM = "12:00";
const TICK_MS = 100;

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

interface TendOpts {
  inhabitants?: boolean; // stoke/feed/basket the creatures (default true)
  forces?: boolean; // evict parasites; the black hole is handled via withHeavyWord (default true)
}

/**
 * Leading formation aliens left to dive (their letters are abducted, then rescued by
 * the key-shot); the rest are clicked down so a wave clears well inside its 45s cap.
 * With this budget every wave completes without a timeout on a fully-tended run, so
 * the final wave is shot down to the last invader and the coupled rule passes.
 */
const GALAGA_DIVE_BUDGET = 8;

/**
 * Fight the invasions BEFORE the solver re-types (a retype backspaces the whole box,
 * which would delete the abducted cells the intruders are holding). Shoot every letter
 * Galaga is carrying, click down the formation aliens past the dive budget, feed the
 * snake its pellet at the end of the box, and shatter every Tetris block. Deterministic
 * in run state.
 */
const tendInvasions = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "galaga") {
      const d = e.data as GalagaData;
      for (const a of d.aliens) {
        if (a.state === "carrying" && a.carriedCellId !== null) {
          const cell = g.cells.find((c) => c.id === a.carriedCellId);
          if (cell) applyKey(g, cell.ch);
        }
      }
      for (const a of d.aliens) {
        if (
          (a.state === "formation" || a.state === "diving") &&
          a.formationIndex >= GALAGA_DIVE_BUDGET
        ) {
          applyPointer(g, { kind: "alien", id: a.id });
        }
      }
    } else if (e.defId === "snake") {
      const d = e.data as SnakeData;
      if (!d.gone) {
        applyKey(g, "End");
        applyKey(g, d.pelletChar);
      }
    } else if (e.defId === "tetris") {
      for (const c of g.cells.filter((cell) => cell.status === "garbage")) {
        applyPointer(g, { kind: "cell", id: c.id });
      }
    }
  }
};

/**
 * Resolve the three chrome nuisances as fast as the player could. The loading bar has
 * seized the keyboard: mash a key each frame to push its fake upload along (its 12s cap
 * would resolve it regardless). The cookie banner: click the real reject-all the moment
 * one of the spawned banners carries it, otherwise decline the first banner to breed the
 * two that will eventually surface it. The autocorrect demon: open its settings and flip
 * the real off switch (its seeded slot) at once, killing it before it can mangle a rule.
 * Deterministic in run state.
 */
const tendChrome = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "loading-bar") {
      applyKey(g, "x"); // mashed and swallowed while inputLocked
    } else if (e.defId === "cookie-banner") {
      const d = e.data as CookieBannerData;
      const real = d.banners.find((b) => b.hasRealReject);
      if (real) applyPointer(g, { kind: "banner-reject-all", id: real.id });
      else {
        const first = d.banners[0];
        if (first) applyPointer(g, { kind: "banner-decline", id: first.id });
      }
    } else if (e.defId === "autocorrect") {
      const d = e.data as AutocorrectData;
      if (!d.settingsOpen) applyPointer(g, { kind: "settings-gear" });
      applyPointer(g, { kind: "settings-toggle", id: d.correctToggleIndex });
    }
  }
};

/** Every non-inhabitant event scheduled for `act` has reached its terminal phase. */
const nonInhabDone = (g: GameState, act: ActId): boolean =>
  g.events.filter((e) => e.act === act && nonInhabitant(e)).every((e) => e.phase === "done");

/**
 * Tend the live crises so the run stays winnable: stoke the campfire, feed Gerald,
 * toss the basket whenever the bear is not away, and evict any parasite mimic. The
 * black hole is collapsed by typing its heavy word (see withHeavyWord) and the
 * infection is cured by the solver (the no-infected strategy), so neither appears
 * here. Deterministic in run state. The campfire is stoked every frame (rate-limited
 * internally by its 1.5s cooldown) rather than on a slow cadence.
 */
const tend = (g: GameState, opts: TendOpts = {}) => {
  const inhabitants = opts.inhabitants !== false;
  const forces = opts.forces !== false;
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (inhabitants && e.defId === "gerald") applyPointer(g, { kind: "feed-button" });
    else if (inhabitants && e.defId === "campfire") applyPointer(g, { kind: "stoke-button" });
    else if (inhabitants && e.defId === "garden") {
      const bearState = (e.data as { bearState: string }).bearState;
      if (bearState !== "away") applyPointer(g, { kind: "basket-button" });
    } else if (forces && e.defId === "parasite") {
      for (const c of g.cells.filter((cell) => cell.status === "parasite")) {
        applyPointer(g, { kind: "parasite", id: c.id });
      }
    }
  }
};

/** Append the black hole's heavy word to the solve target while it is still pulling. */
const withHeavyWord = (g: GameState, target: string): string => {
  const bh = g.events.find(
    (e) =>
      e.defId === "black-hole" &&
      e.data !== undefined &&
      e.phase !== "telegraph" &&
      e.phase !== "done",
  );
  if (!bh) return target;
  const d = bh.data as { heavyWord: string; collapsingSinceMs: number | null };
  if (d.collapsingSinceMs !== null) return target;
  return target.includes(d.heavyWord) ? target : target + d.heavyWord;
};

/** Solve the revealed roster (retyping only on change), tend, then advance one frame. */
const solveAndTick = (
  g: GameState,
  api: RuleApi,
  opts: {
    tendInhabitants?: boolean;
    tendForces?: boolean;
    tendInvasions?: boolean;
    tendChrome?: boolean;
  } = {},
) => {
  const tendForces = opts.tendForces !== false;
  if (opts.tendChrome !== false) tendChrome(g); // dismiss banners/toggles; mash the loading bar
  if (opts.tendInvasions !== false) tendInvasions(g); // shoot/feed/shatter before re-typing
  // While the loading bar holds the keyboard, NEVER solve or retype: the retype's
  // backspace loop would be swallowed as mash and spin until its cap throws. The bar
  // releases within its 12s deadline; tending and the tick continue meanwhile, and the
  // solver repairs any autocorrect damage on the next unlocked frame.
  if (!g.inputLocked) {
    const base = solveAll(g, api);
    const target = tendForces ? withHeavyWord(g, base) : base;
    if (target !== cellsToPassword(g.cells)) retype(g, target);
  }
  tend(g, { inhabitants: opts.tendInhabitants !== false, forces: tendForces });
  tick(g, TICK_MS);
};

const nonInhabitant = (e: EventInstance) => e.family !== "inhabitant";

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

  it("advances each act only after its last blocking beat resolves on the authored timeline", () => {
    const r = driveRun(SEED);
    const byFrom = new Map(r.transitions.map((t) => [t.from, t]));

    // Prologue carries no scheduled events, so it advances on rules alone — fast.
    const prologue = byFrom.get("prologue")!;
    expect(prologue.actDurationMs).toBeLessThan(5_000);
    expect(r.g.events.some((e) => e.act === "prologue")).toBe(false);

    // act1 and act2 are gated by their last blocking (non-inhabitant) event. act1's
    // chrome resolves on the driver's tendChrome (a dismiss/toggle, or the loading bar's
    // brief keyboard seizure); act2's forces resolve on the driver's cure/collapse/evict
    // timing. Both land in a generous window after the last blocking onset — never before
    // it, and not idling minutes after.
    for (const act of ["act1", "act2"] as const) {
      const t = byFrom.get(act)!;
      const onset = lastBlockingOnsetMs(r.g, act);
      expect(onset).toBeGreaterThan(0);
      expect(t.actDurationMs).toBeGreaterThanOrEqual(onset);
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
    // Tend the blocking forces so the acts still advance, but leave the creatures to
    // their fate. The campfire should burn out and scar the password; the bear
    // should trample the garden. Failure transforms the run — it never deletes it.
    const g = boot(SEED);
    const api = makeRuleApi(g, () => HHMM);

    let sawEmberCell = false;
    let sawEatToast = false;
    let sawTrample = false;
    for (let i = 0; i < 6000 && g.act !== "act3"; i++) {
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
});
