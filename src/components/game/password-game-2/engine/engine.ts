import type { Rng } from "./rng";
import { mulberry32, subSeed } from "./rng";
import type {
  ActId,
  EventContext,
  EventDef,
  EventInstance,
  EventPhase,
  GameState,
  Pg2RuleDef,
  PointerTarget,
  RuleApi,
  RunStats,
} from "./types";
import { cellsToPassword, deleteRange, findCellIndex, insertText } from "./cells";
import { pushEffect } from "./effects";
import { CORE_RULES } from "./rules/index";
import { buildSchedule } from "./director";
import { EVENT_DEFS } from "./events/index";
import { createFinale, finalePointer, tickFinale } from "./events/finale";

export interface CreateRunOpts {
  seed: number;
  daily: boolean;
  /** Injected wall clock for the current-time rule; defaults to the real clock. */
  nowHHMM?: () => string;
}

/** defId -> EventDef, resolved once. Empty until the manifest is seeded (Task 3). */
const DEF_BY_ID: Map<string, EventDef> = new Map(EVENT_DEFS.map((d) => [d.id, d]));
const CORE_RULE_IDS: ReadonlySet<string> = new Set(CORE_RULES.map((d) => d.id));

/** Act progression. act3 does NOT advance on time — only requestSubmit opens the finale. */
const NEXT_ACT: Record<ActId, ActId | null> = {
  prologue: "act1",
  act1: "act2",
  act2: "act3",
  act3: null,
  finale: null,
};

/**
 * Runtime bookkeeping hung on an instance. These are plain enumerable fields (so
 * not hidden from serialization); the point is they are not part of the designed
 * serial shape (EventInstance) — engine-internal state, not authored run data.
 */
type LiveInstance = EventInstance & { rng?: Rng; coupledInjected?: boolean };

/** Per-run injected clock, kept off GameState so the serializable shape stays clean. */
const clockByRun = new WeakMap<GameState, () => string>();

/** Build a fresh run. The clock is stopped until the first printable keystroke. */
export function createRun(opts: CreateRunOpts): GameState {
  const g: GameState = {
    seed: opts.seed,
    daily: opts.daily,
    nextCellId: 1,
    cells: [],
    caret: 0,
    startedAtMs: null,
    elapsedMs: 0,
    act: "prologue",
    actElapsedMs: 0,
    rules: [],
    ruleStates: {},
    events: buildSchedule(opts.seed),
    finale: null,
    outcome: "playing",
    inputLocked: false,
    stats: emptyStats(),
    effects: [],
    version: 0,
  };
  clockByRun.set(g, opts.nowHHMM ?? defaultNowHHMM);
  // The first core rule is always visible; later ones reveal as prior rules pass.
  const first = nextUnrevealedCoreRuleForAct(g);
  if (first) revealRule(g, first);
  return g;
}

/**
 * Advance the run by dtMs. Order: clocks; lazy-init due events; tick live events
 * (injecting coupled rules on onset); revalidate + reveal the next core rule;
 * advance the act. act3 -> finale is deliberately NOT time-driven.
 */
export function tick(g: GameState, dtMs: number): void {
  if (g.startedAtMs !== null) {
    g.elapsedMs += dtMs;
    g.actElapsedMs += dtMs;
  }

  // The finale owns its own pipeline. The world is frozen (every event is "done"),
  // so the normal event/rule machinery below has nothing to do; skip straight to it.
  // The clock above keeps running — the finale's only punishment.
  if (g.act === "finale") {
    tickFinale(g, dtMs);
    return;
  }

  // Snapshot the cell run before any event work. A due event's init may replace
  // g.cells, so the snapshot must precede the init loop as well as the tick loop —
  // both kinds of cell replacement need to be caught by the version bump below.
  const cellsBefore = g.cells;

  // Init events that have become due in the current act (data + event-scoped rng).
  // Deliberate asymmetry: events only init while their act is current, so an
  // inhabitant scheduled late in an act can miss its onset window entirely — the
  // Director must schedule inhabitants early in the act (Task 3 concern).
  for (const inst of g.events) {
    if (inst.data === undefined && inst.act === g.act && inst.scheduledAtMs <= g.actElapsedMs) {
      ensureInited(g, inst);
    }
  }

  // Tick every live event. The def owns its phase transitions; the engine owns
  // phaseElapsedMs (accumulated here, reset to 0 when the def flips phase). Events
  // signal cell edits by replacing g.cells with a new array (see EventDef.onTick).
  for (const inst of g.events) {
    if (inst.data === undefined || inst.phase === "done") continue;
    const def = DEF_BY_ID.get(inst.defId);
    if (!def) continue;
    const prevPhase = inst.phase;
    inst.phaseElapsedMs += dtMs;
    // Tally time spent in the peak phase per event, so the finale can name the run's
    // biggest crisis. Attributed to the phase the instance was IN for this dt.
    if (prevPhase === "peak") {
      g.stats.peakMsByEvent[inst.defId] = (g.stats.peakMsByEvent[inst.defId] ?? 0) + dtMs;
    }
    def.onTick(inst, makeCtx(g, inst, dtMs));
    if (inst.phase !== prevPhase) inst.phaseElapsedMs = 0;
    const live = inst as LiveInstance;
    if (def.coupledRule && !live.coupledInjected && inst.phase !== "telegraph") {
      revealRule(g, def.coupledRule);
      live.coupledInjected = true;
    }
  }
  // An event that replaced the cell run is a render-affecting change: version it.
  if (g.cells !== cellsBefore) bump(g);
  // Engine-owned safety net: an event may have removed the cell the caret sat on.
  g.caret = Math.min(g.caret, g.cells.length);

  const password = cellsToPassword(g.cells);
  const api = makeRuleApi(g, clockOf(g));
  revalidateAndReveal(g, password, api);
  advanceActIfComplete(g, password, api);
}

/**
 * Route a key. Active events see it first (onset order); an unconsumed key, when
 * input is not locked, edits the password. A single code point inserts at the
 * caret and starts the clock; the named keys behave conventionally.
 */
export function applyKey(g: GameState, key: string): void {
  // Snapshot BEFORE the routing loop so a mutation by a non-consuming onKey handler is
  // still caught (mirrors applyPointer). Any handler that changes the cell run — a
  // galaga shot raining its letter back, a future event editing on a passed-through key
  // — is render-affecting: bump and re-clamp the caret, whether or not the key was consumed.
  const cellsBefore = g.cells;
  const settle = (): void => {
    if (g.cells !== cellsBefore) {
      bump(g);
      g.caret = Math.min(g.caret, g.cells.length);
    }
  };
  for (const inst of activeEvents(g)) {
    const def = DEF_BY_ID.get(inst.defId);
    if (!def?.onKey) continue;
    if (def.onKey(inst, makeCtx(g, inst, 0), key)) {
      settle();
      return;
    }
  }
  settle();
  if (g.inputLocked) return;

  if ([...key].length === 1) {
    startClock(g);
    const r = insertText(g.cells, g.caret, key, g.nextCellId);
    g.cells = r.cells;
    g.caret = r.caret;
    g.nextCellId = r.nextCellId;
    bump(g);
    return;
  }

  switch (key) {
    case "Backspace": {
      if (g.caret <= 0) return;
      const r = deleteRange(g.cells, g.caret - 1, g.caret);
      g.cells = r.cells;
      g.caret = r.caret;
      bump(g);
      return;
    }
    case "Delete": {
      if (g.caret >= g.cells.length) return;
      const r = deleteRange(g.cells, g.caret, g.caret + 1);
      g.cells = r.cells;
      g.caret = r.caret;
      bump(g);
      return;
    }
    case "ArrowLeft":
      g.caret = Math.max(0, g.caret - 1);
      return;
    case "ArrowRight":
      g.caret = Math.min(g.cells.length, g.caret + 1);
      return;
    case "Home":
      g.caret = 0;
      return;
    case "End":
      g.caret = g.cells.length;
      return;
  }
}

/**
 * Route a pointer. Active events see it first (onset order). Once the finale is open
 * its targets go to finalePointer; otherwise a cell target moves the caret.
 */
export function applyPointer(g: GameState, target: PointerTarget): void {
  // Snapshot BEFORE the routing loop so a mutation by a non-consuming handler is
  // still caught. Any handler that changes the cell run (a parasite eviction, a
  // galaga shot, a tetris shatter) is render-affecting: bump and re-clamp the caret.
  const cellsBefore = g.cells;
  const settle = (): void => {
    if (g.cells !== cellsBefore) {
      bump(g);
      g.caret = Math.min(g.caret, g.cells.length);
    }
  };
  for (const inst of activeEvents(g)) {
    const def = DEF_BY_ID.get(inst.defId);
    if (!def?.onPointer) continue;
    if (def.onPointer(inst, makeCtx(g, inst, 0), target)) {
      settle();
      return;
    }
  }
  settle();
  if (g.finale !== null) {
    finalePointer(g, target);
    return;
  }
  if (target.kind === "cell" && typeof target.id === "number") {
    const idx = findCellIndex(g.cells, target.id);
    if (idx >= 0) g.caret = idx;
  }
}

/**
 * Attempt to submit. Refused (with a toast) unless the run is in act3 with every
 * revealed rule passing AND every act3-scheduled non-inhabitant event resolved —
 * the second gate protects the marquee: a fast typist can satisfy the rules before
 * Galaga even onsets, and must not be allowed to skip the invasion. The two refusals
 * carry distinct toasts so the stage can tell the player which gate held.
 */
export function requestSubmit(g: GameState): void {
  if (g.act !== "act3" || !allRulesPass(g)) {
    pushEffect(g, { kind: "toast", text: "The form is not satisfied.", tone: "danger" });
    return;
  }
  if (!nonInhabitantEventsResolvedForAct(g, "act3")) {
    pushEffect(g, { kind: "toast", tone: "danger", text: "The form is not done with you yet." });
    return;
  }
  g.act = "finale";
  g.actElapsedMs = 0; // consistent with other act transitions
  g.finale = createFinale(g);
  bump(g);
  pushEffect(g, { kind: "title-card", act: "finale" });
}

/** Injected view over run state used by rule validators; clock is fixed per run. */
export function makeRuleApi(g: GameState, nowHHMM: () => string): RuleApi {
  const find = (id: string) => g.events.find((e) => e.defId === id);
  return {
    isEventActive(id) {
      const inst = find(id);
      return inst !== undefined && inst.data !== undefined && isActivePhase(inst.phase);
    },
    isEventDone(id) {
      const inst = find(id);
      return inst !== undefined && isResolvedInstance(g, inst);
    },
    getEventData<S>(id: string): S | null {
      const inst = find(id);
      return inst !== undefined && inst.data !== undefined ? (inst.data as S) : null;
    },
    nowHHMM,
  };
}

// --- internals ---------------------------------------------------------------

function bump(g: GameState): void {
  g.version++;
}

function startClock(g: GameState): void {
  // startedAtMs is the elapsedMs-space origin; 0 is a valid base. Only null means
  // "not started", so tick accumulates elapsedMs from the next frame on.
  if (g.startedAtMs === null) g.startedAtMs = 0;
}

function isActivePhase(phase: EventPhase): boolean {
  return phase === "onset" || phase === "peak" || phase === "resolving";
}

/** Live (initialized, non-done) events currently active, earliest onset first. */
function activeEvents(g: GameState): EventInstance[] {
  return g.events
    .filter((e) => e.data !== undefined && isActivePhase(e.phase))
    .sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
}

function makeCtx(g: GameState, inst: EventInstance, dtMs: number): EventContext {
  return { state: g, rng: rngOf(g, inst), dtMs, emit: (e) => pushEffect(g, e) };
}

/** The event-scoped rng, created once from subSeed(seed, defId) and reused. */
function rngOf(g: GameState, inst: EventInstance): Rng {
  const live = inst as LiveInstance;
  if (!live.rng) live.rng = mulberry32(subSeed(g.seed, inst.defId));
  return live.rng;
}

function ensureInited(g: GameState, inst: EventInstance): void {
  const def = DEF_BY_ID.get(inst.defId);
  if (!def) return;
  inst.data = def.init(rngOf(g, inst), g);
}

function isResolvedInstance(g: GameState, inst: EventInstance): boolean {
  if (inst.phase === "done") return true;
  if (inst.data === undefined) return false;
  const def = DEF_BY_ID.get(inst.defId);
  return def !== undefined && def.isResolved(inst, g);
}

/**
 * Every non-inhabitant event scheduled for `act` has resolved. Inhabitants persist
 * to the finale, so they never gate an act boundary or a submit; the blocking beats
 * (forces, invasions, chrome) do. Shared by act advancement and the submit gate so
 * the two agree on what "the act's crises are over" means.
 */
function nonInhabitantEventsResolvedForAct(g: GameState, act: ActId): boolean {
  return g.events
    .filter((e) => e.act === act && e.family !== "inhabitant")
    .every((e) => isResolvedInstance(g, e));
}

function nextUnrevealedCoreRuleForAct(g: GameState): Pg2RuleDef | null {
  const revealed = new Set(g.rules.map((r) => r.id));
  return CORE_RULES.find((d) => d.act === g.act && !revealed.has(d.id)) ?? null;
}

function revealRule(g: GameState, def: Pg2RuleDef): void {
  if (g.rules.some((r) => r.id === def.id)) return; // idempotent: never reveal twice
  g.rules.push(def.create(mulberry32(subSeed(g.seed, "rule-" + def.id))));
  bump(g);
}

function allRulesPass(g: GameState): boolean {
  const password = cellsToPassword(g.cells);
  const api = makeRuleApi(g, clockOf(g));
  return g.rules.every((r) => r.validate(password, g, api).passed);
}

/** Reveal the next core rule once every revealed core rule passes. */
function revalidateAndReveal(g: GameState, password: string, api: RuleApi): void {
  const corePasses = g.rules.every(
    (r) => !CORE_RULE_IDS.has(r.id) || r.validate(password, g, api).passed,
  );
  if (!corePasses) return;
  const next = nextUnrevealedCoreRuleForAct(g);
  if (next) revealRule(g, next);
}

/**
 * Advance the act once every core rule assigned to it is revealed and passing and
 * every non-inhabitant event scheduled for it has resolved. Inhabitants persist
 * until the finale, so they never gate advancement.
 */
function advanceActIfComplete(g: GameState, password: string, api: RuleApi): void {
  const next = NEXT_ACT[g.act];
  if (next === null) return;

  const revealed = new Set(g.rules.map((r) => r.id));
  const allActRulesRevealed = CORE_RULES.filter((d) => d.act === g.act).every((d) =>
    revealed.has(d.id),
  );
  const allActRulesPass = g.rules
    .filter((r) => CORE_RULE_IDS.has(r.id) && r.act === g.act)
    .every((r) => r.validate(password, g, api).passed);
  const eventsResolved = nonInhabitantEventsResolvedForAct(g, g.act);

  if (allActRulesRevealed && allActRulesPass && eventsResolved) {
    g.act = next;
    g.actElapsedMs = 0;
    pushEffect(g, { kind: "title-card", act: next });
    pushEffect(g, { kind: "sound", sound: "act-fanfare" });
    bump(g);
  }
}

function clockOf(g: GameState): () => string {
  return clockByRun.get(g) ?? defaultNowHHMM;
}

function defaultNowHHMM(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

function emptyStats(): RunStats {
  return {
    lettersAbducted: 0,
    lettersRescued: 0,
    infectionsCured: 0,
    garbageCleared: 0,
    missilesIntercepted: 0,
    aliensDowned: 0,
    creaturesSaved: 0,
    peakMsByEvent: {},
    biggestCrisis: "",
    knockbacks: 0,
  };
}
