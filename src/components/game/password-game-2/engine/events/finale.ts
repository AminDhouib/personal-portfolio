import type { Rng } from "../rng";
import { mulberry32, rangeInt, subSeed } from "../rng";
import type { AllyId, FinaleState, GameState, PointerTarget } from "../types";
import { pushEffect } from "../effects";
import { EVENT_DEFS } from "./index";

/**
 * The finale: a three-phase boss gauntlet where every inhabitant kept alive fights
 * on the player's side. This module owns everything about the finale — allies, the
 * per-phase working state, the tick, and pointer routing — so the engine only has to
 * call `createFinale` at submit, `tickFinale` while `act === "finale"`, and route
 * finale pointers to `finalePointer`.
 *
 * Design contract (spec section 4): the ONLY fail state is a per-phase knockback —
 * being overwhelmed restarts the current phase, never the whole finale; the clock is
 * the sole punishment. With zero allies the gauntlet is fully beatable, just slower.
 *
 * Timings are phase-relative: every phase reads `FinaleState.phaseElapsedMs`, which
 * `tickFinale` advances and every phase entry (and knockback) resets to 0. The
 * finale-scoped rng (missile spread, checkbox slot, knockback re-rolls) is a single
 * stream seeded off the run seed and hung on the run in a module WeakMap, mirroring
 * the engine's event-scoped rng idiom so the serial GameState stays clean.
 */

const DEF_BY_ID = new Map(EVENT_DEFS.map((d) => [d.id, d]));

// --- Phase 1: Missile Command -----------------------------------------------

const MISSILE_COUNT = 12;
const MISSILE_LAUNCH_PERIOD_MS = 3200; // one missile launches every this many ms
const MISSILE_FALL_MS = 4000; // a falling missile lands after this long
const GERALD_PERIOD_MS = 2500; // Gerald auto-intercepts on this cadence
const MISSILE_LAND_LOCK_MS = 1500; // a landing stuns input for this long
const MISSILE_KNOCKBACK_AT = 4; // landings in one attempt that force a knockback

// --- Phase 2: The EULA Final Form -------------------------------------------

const EULA_PARAGRAPHS = 24;
const EULA_SURVIVORS = 6; // paragraphs left standing once the campfire burns the scroll
const EULA_BURN_AT_MS = 6000; // the campfire ally ignites the scroll this far into the phase
const EULA_DEADLINE_MS = 90_000; // miss this and the phase knocks back

// --- Phase 3: The Runaway Button --------------------------------------------

const RUNAWAY_DECAY_AFTER_MS = 25_000; // the button only starts slowing after this
const RUNAWAY_DECAY_PER_S = 0.96; // multiplicative speed decay per second, post-slowdown
const BEAR_TACKLE_AT_MS = 10_000; // a bonded bear tackles the button at this phase time

const REJECTION_TOAST = "The form rejects your energy. Again.";

export interface FinaleMissile {
  id: number;
  x: number; // 0..1 horizontal launch position, from the finale rng
  launchedAtMs: number; // phase-relative launch time; fall progress is measured from here
  state: "falling" | "intercepted" | "landed";
}

export interface MissilesData {
  missiles: FinaleMissile[];
  launched: number; // how many of MISSILE_COUNT have launched so far
  landedThisAttempt: number; // landings since the phase last (re)started
  nextGeraldAtMs: number; // phase-relative time of Gerald's next auto-intercept
  /** Phase-relative time the landing stun auto-releases; 0 when input is not locked. */
  lockUntilMs: number;
}

export interface EulaData {
  paragraphs: number;
  checkboxPara: number; // seeded paragraph holding the real "I agree" checkbox
  burned: boolean; // the campfire ally has torched the scroll to EULA_SURVIVORS paragraphs
  deadlineAtMs: number; // phase-relative knockback deadline
}

export interface RunawayData {
  speedScale: number; // the stage multiplies the button's evasion speed by this
  caughtAtMs: number | null; // phase-relative catch time; null until caught
  bearBond: boolean; // a bonded bear will auto-tackle the button
}

/**
 * The finale's whole working state, stored on FinaleState.data. The index signature
 * keeps it structurally interchangeable with the serial `Record<string, unknown>`
 * shape of FinaleState.data; the named keys carry the real types the finale reads.
 */
interface FinaleData {
  gardenDistractions: number; // snapshot taken at freeze; drives the bear bond
  missiles?: MissilesData;
  eula?: EulaData;
  runaway?: RunawayData;
  [key: string]: unknown;
}

/** The six surviving paragraph indices once the campfire burns the scroll. */
export function survivingParagraphs(): number[] {
  return Array.from({ length: EULA_SURVIVORS }, (_v, i) => i);
}

/**
 * The paragraph the real checkbox actually sits in. Unburned: its seeded slot.
 * Burned: it relocates deterministically into a survivor (`checkboxPara % 6`), so the
 * renderer and the engine agree on where the click must land after the fire.
 */
export function effectiveCheckboxPara(data: EulaData): number {
  if (!data.burned) return data.checkboxPara;
  const survivors = survivingParagraphs();
  return survivors[data.checkboxPara % survivors.length]!;
}

// --- Finale rng --------------------------------------------------------------

const finaleRngByRun = new WeakMap<GameState, Rng>();

/** The finale-scoped rng, created once from subSeed(seed, "finale") and reused. */
function finaleRng(g: GameState): Rng {
  let r = finaleRngByRun.get(g);
  if (r === undefined) {
    r = mulberry32(subSeed(g.seed, "finale"));
    finaleRngByRun.set(g, r);
  }
  return r;
}

// --- Construction ------------------------------------------------------------

/**
 * Open the finale. Collect the surviving allies (honoring each inhabitant's isAlive
 * at THIS instant), snapshot the data an ally power needs before the world freezes,
 * record the run's biggest crisis, then FREEZE every event to "done" so nothing eats
 * the password mid-boss, and release any lingering input lock.
 */
export function createFinale(g: GameState): FinaleState {
  const allies = collectAllies(g);
  g.stats.creaturesSaved = allies.length;
  const gardenDistractions = snapshotGardenDistractions(g);
  g.stats.biggestCrisis = biggestCrisis(g.stats.peakMsByEvent);
  freezeWorld(g);
  finaleRng(g); // seed the stream up front so the draw order is stable

  const data: FinaleData = { gardenDistractions, missiles: freshMissiles() };
  return { phase: "missiles", phaseElapsedMs: 0, allies, attempts: 0, data };
}

/** Ally ids for inhabitants still alive at finale start. */
function collectAllies(g: GameState): AllyId[] {
  const allies: AllyId[] = [];
  for (const inst of g.events) {
    if (inst.data === undefined) continue;
    const def = DEF_BY_ID.get(inst.defId);
    if (def?.allyId && def.isAlive?.(inst)) allies.push(def.allyId);
  }
  return allies;
}

/** The garden's basket-throw count at freeze, or 0 if the garden never onset. */
function snapshotGardenDistractions(g: GameState): number {
  const garden = g.events.find((e) => e.defId === "garden" && e.data !== undefined);
  if (garden === undefined) return 0;
  return (garden.data as { distractions?: number }).distractions ?? 0;
}

/** The defId with the most accumulated peak-phase ms, or "" when none was tracked. */
function biggestCrisis(peakMsByEvent: Record<string, number>): string {
  let best = "";
  let bestMs = 0;
  for (const [id, ms] of Object.entries(peakMsByEvent)) {
    if (ms > bestMs) {
      bestMs = ms;
      best = id;
    }
  }
  return best;
}

/**
 * Freeze the world: every event instance goes to "done" (inhabitants included, so a
 * hungry campfire cannot bite the password during the boss — the sanctioned answer to
 * the Task 6 review question), and any lingering input lock is released.
 */
function freezeWorld(g: GameState): void {
  for (const inst of g.events) inst.phase = "done";
  g.inputLocked = false;
}

function freshMissiles(): MissilesData {
  return {
    missiles: [],
    launched: 0,
    landedThisAttempt: 0,
    nextGeraldAtMs: GERALD_PERIOD_MS,
    lockUntilMs: 0,
  };
}

// --- Tick --------------------------------------------------------------------

/** Advance the finale by dtMs. Called by the engine tick while `act === "finale"`. */
export function tickFinale(g: GameState, dtMs: number): void {
  const f = g.finale;
  if (f === null || g.outcome === "victory") return;
  f.phaseElapsedMs += dtMs;
  const fd = f.data as FinaleData;
  switch (f.phase) {
    case "missiles":
      tickMissiles(g, f, fd);
      break;
    case "eula":
      tickEula(g, f, fd);
      break;
    case "runaway":
      tickRunaway(g, f, fd, dtMs);
      break;
  }
}

function tickMissiles(g: GameState, f: FinaleState, fd: FinaleData): void {
  const d = fd.missiles!;

  // Auto-release the landing stun once its window elapses; never leave it stuck.
  if (d.lockUntilMs > 0 && f.phaseElapsedMs >= d.lockUntilMs) {
    d.lockUntilMs = 0;
    g.inputLocked = false;
  }

  // Launch missiles that have come due on the 3200ms cadence.
  while (d.launched < MISSILE_COUNT && f.phaseElapsedMs >= d.launched * MISSILE_LAUNCH_PERIOD_MS) {
    d.missiles.push({
      id: d.launched,
      x: finaleRng(g)(),
      launchedAtMs: f.phaseElapsedMs,
      state: "falling",
    });
    d.launched += 1;
    pushEffect(g, { kind: "sound", sound: "missile-launch" });
  }

  // A living Gerald surfaces and douses the longest-falling missile on his cadence.
  // His saves count in the same stat the player's clicks do — the receipt celebrates
  // the teamwork rather than splitting the credit.
  if (f.allies.includes("gerald")) {
    while (f.phaseElapsedMs >= d.nextGeraldAtMs) {
      const target = lowestFalling(d);
      if (target !== undefined) {
        target.state = "intercepted";
        g.stats.missilesIntercepted += 1;
        pushEffect(g, { kind: "sound", sound: "missile-intercept" });
      }
      d.nextGeraldAtMs += GERALD_PERIOD_MS;
    }
  }

  // Land every missile that has fallen the full distance. A landing stuns input and
  // counts toward the knockback; the fourth landing restarts the phase from scratch.
  for (const m of d.missiles) {
    if (m.state !== "falling") continue;
    if (f.phaseElapsedMs - m.launchedAtMs >= MISSILE_FALL_MS) {
      m.state = "landed";
      d.landedThisAttempt += 1;
      d.lockUntilMs = f.phaseElapsedMs + MISSILE_LAND_LOCK_MS;
      g.inputLocked = true;
      pushEffect(g, { kind: "shake", trauma: 0.6 });
      pushEffect(g, { kind: "sound", sound: "missile-land" });
      if (d.landedThisAttempt >= MISSILE_KNOCKBACK_AT) {
        missileKnockback(g, f, fd);
        return;
      }
    }
  }

  // Cleared: every missile has launched and none is still falling, with < 4 landings.
  if (d.launched >= MISSILE_COUNT && d.missiles.every((m) => m.state !== "falling")) {
    enterEula(g, f, fd);
  }
}

/** The longest-falling (earliest-launched) missile still in the air, if any. */
function lowestFalling(d: MissilesData): FinaleMissile | undefined {
  let best: FinaleMissile | undefined;
  for (const m of d.missiles) {
    if (m.state !== "falling") continue;
    if (best === undefined || m.launchedAtMs < best.launchedAtMs) best = m;
  }
  return best;
}

function missileKnockback(g: GameState, f: FinaleState, fd: FinaleData): void {
  fd.missiles = freshMissiles();
  f.phaseElapsedMs = 0;
  f.attempts += 1;
  g.stats.knockbacks += 1;
  g.inputLocked = false;
  pushEffect(g, { kind: "toast", tone: "danger", text: REJECTION_TOAST });
  pushEffect(g, { kind: "sound", sound: "knockback" });
}

function enterEula(g: GameState, f: FinaleState, fd: FinaleData): void {
  // The phase can end while a landing's 1500ms stun is still live (a landing IS a valid
  // phase-completing event, and the last intercept can fire mid-lock). The auto-release
  // lives only in tickMissiles, which stops on the flip, so clear the stun here — mirror
  // missileKnockback — or it bleeds through the eula and runaway phases.
  g.inputLocked = false;
  if (fd.missiles) fd.missiles.lockUntilMs = 0;
  f.phase = "eula";
  f.phaseElapsedMs = 0;
  f.attempts = 0;
  fd.eula = {
    paragraphs: EULA_PARAGRAPHS,
    checkboxPara: rangeInt(finaleRng(g), 8, 23),
    burned: false,
    deadlineAtMs: EULA_DEADLINE_MS,
  };
  pushEffect(g, { kind: "sound", sound: "act-fanfare" });
}

function tickEula(g: GameState, f: FinaleState, fd: FinaleData): void {
  const d = fd.eula!;

  // The campfire ally ignites the scroll, burning it down to the survivors and
  // relocating the checkbox among them (see effectiveCheckboxPara). The power
  // persists across a knockback: once burned, it stays burned.
  if (!d.burned && f.allies.includes("campfire") && f.phaseElapsedMs >= EULA_BURN_AT_MS) {
    d.burned = true;
    pushEffect(g, { kind: "sound", sound: "eula-burn" });
    pushEffect(g, {
      kind: "toast",
      tone: "info",
      text: "The campfire ignites the terms and conditions.",
    });
  }

  // Miss the deadline and the phase knocks back: the checkbox re-rolls (still inside
  // the surviving set if the scroll already burned), the clock is the only cost.
  if (f.phaseElapsedMs >= d.deadlineAtMs) {
    d.checkboxPara = rangeInt(finaleRng(g), 8, 23);
    f.phaseElapsedMs = 0;
    f.attempts += 1;
    g.stats.knockbacks += 1;
    pushEffect(g, { kind: "toast", tone: "danger", text: REJECTION_TOAST });
    pushEffect(g, { kind: "sound", sound: "knockback" });
  }
}

function enterRunaway(g: GameState, f: FinaleState, fd: FinaleData): void {
  f.phase = "runaway";
  f.phaseElapsedMs = 0;
  f.attempts = 0;
  const garden = f.allies.includes("garden");
  fd.runaway = {
    speedScale: garden ? 0.5 : 1.0,
    caughtAtMs: null,
    bearBond: garden && fd.gardenDistractions >= 2,
  };
  pushEffect(g, { kind: "sound", sound: "act-fanfare" });
}

function tickRunaway(g: GameState, f: FinaleState, fd: FinaleData, dtMs: number): void {
  const d = fd.runaway!;
  if (d.caughtAtMs !== null) return;

  // The button only starts tiring after RUNAWAY_DECAY_AFTER_MS, then its evasion
  // speed decays multiplicatively so a patient player always corners it eventually.
  if (f.phaseElapsedMs > RUNAWAY_DECAY_AFTER_MS) {
    d.speedScale *= Math.pow(RUNAWAY_DECAY_PER_S, dtMs / 1000);
  }

  // A bonded bear (a well-fed garden that was defended twice) tackles the button.
  if (d.bearBond && f.phaseElapsedMs >= BEAR_TACKLE_AT_MS) {
    catchButton(g, f, fd);
  }
}

/** Corner and catch the button: the run is won. */
function catchButton(g: GameState, f: FinaleState, fd: FinaleData): void {
  const d = fd.runaway!;
  if (d.caughtAtMs !== null) return;
  d.caughtAtMs = f.phaseElapsedMs;
  g.outcome = "victory";
  pushEffect(g, { kind: "sound", sound: "victory" });
  pushEffect(g, { kind: "title-card", act: "finale" }); // the stage renders the closing card
  g.version += 1;
}

// --- Pointer routing ---------------------------------------------------------

/** Route a finale pointer to the current phase. Returns whether it was consumed. */
export function finalePointer(g: GameState, target: PointerTarget): boolean {
  const f = g.finale;
  if (f === null || g.outcome === "victory") return false;
  const fd = f.data as FinaleData;
  switch (f.phase) {
    case "missiles":
      return missilePointer(g, f, fd, target);
    case "eula":
      return eulaPointer(g, f, fd, target);
    case "runaway":
      return runawayPointer(g, f, fd, target);
  }
}

function missilePointer(
  g: GameState,
  f: FinaleState,
  fd: FinaleData,
  target: PointerTarget,
): boolean {
  if (target.kind !== "missile") return false;
  const d = fd.missiles!;
  const m = d.missiles.find((mm) => mm.id === target.id && mm.state === "falling");
  if (m === undefined) return false;
  m.state = "intercepted";
  g.stats.missilesIntercepted += 1;
  pushEffect(g, { kind: "sound", sound: "missile-intercept" });
  // The last intercept can complete the phase on the click, not just on the next tick.
  if (d.launched >= MISSILE_COUNT && d.missiles.every((mm) => mm.state !== "falling")) {
    enterEula(g, f, fd);
  }
  return true;
}

function eulaPointer(g: GameState, f: FinaleState, fd: FinaleData, target: PointerTarget): boolean {
  if (target.kind === "eula-checkbox") {
    enterRunaway(g, f, fd);
    return true;
  }
  if (target.kind === "eula-decoy") {
    pushEffect(g, { kind: "shake", trauma: 0.4 });
    pushEffect(g, { kind: "toast", tone: "info", text: "You agreed to agree. It means nothing." });
    return true;
  }
  return false;
}

function runawayPointer(
  g: GameState,
  f: FinaleState,
  fd: FinaleData,
  target: PointerTarget,
): boolean {
  if (target.kind !== "submit-button") return false;
  catchButton(g, f, fd);
  return true;
}
