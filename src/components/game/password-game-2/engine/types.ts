import type { Rng } from "./rng";

export type ActId = "prologue" | "act1" | "act2" | "act3" | "finale";
export type EventFamily = "inhabitant" | "force" | "invasion" | "chrome";
export type EventPhase = "telegraph" | "onset" | "peak" | "resolving" | "done";
export type CellStatus =
  | "normal"
  | "infected"
  | "mutated"
  | "orbiting" // captured by the black hole; excluded from password value
  | "abducted" // carried by an alien / swallowed by the snake; excluded from value
  | "garbage" // tetris junk; INCLUDED in password value
  | "parasite" // mimic; rendered but excluded from password value
  | "ember"; // campfire scar; cosmetic, excluded from value

export interface CharCell {
  id: number; // stable identity for animation; monotonic per run
  ch: string; // single code point
  status: CellStatus;
  eventTag?: string; // owning event id when status !== "normal"
}

export interface ValidationResult {
  passed: boolean;
  message?: string;
}

/** Injected clock/event access so rules stay pure and testable. */
export interface RuleApi {
  isEventActive(id: string): boolean;
  isEventDone(id: string): boolean;
  getEventData<S>(id: string): S | null;
  /** Wall-clock HH:MM for the current-time rule; injected for tests. */
  nowHHMM(): string;
}

export interface Pg2Rule {
  id: string;
  act: ActId; // act in which it is revealed
  description: string; // final player-facing copy (no placeholders)
  /** Optional payload shown on the card (sponsor logos, flag, chess board, antidote). */
  payload?: Record<string, unknown>;
  validate(password: string, state: GameState, api: RuleApi): ValidationResult;
}

/** Factory parameterized by seed, mirroring v1's RuleDef.create. */
export interface Pg2RuleDef {
  id: string;
  act: ActId;
  create(rng: Rng): Pg2Rule;
}

export interface EventContext {
  state: GameState;
  rng: Rng; // event-scoped stream, created from subSeed(seed, def.id)
  dtMs: number;
  /** Push a side effect for the stage (sound, shake, toast, title card). */
  emit(effect: Effect): void;
}

export type PointerTargetKind =
  | "cell"
  | "alien"
  | "parasite"
  | "feed-button"
  | "stoke-button"
  | "basket-button"
  | "banner-decline"
  | "banner-reject-all"
  | "settings-gear"
  | "settings-toggle"
  | "missile"
  | "eula-checkbox"
  | "eula-decoy"
  | "submit-button"
  | "black-hole";

export interface PointerTarget {
  kind: PointerTargetKind;
  id?: number | string; // cell id, alien id, toggle index...
}

export interface EventInstance<S = unknown> {
  defId: string;
  family: EventFamily;
  act: ActId; // act this instance is scheduled in
  phase: EventPhase;
  phaseElapsedMs: number;
  scheduledAtMs: number; // act-relative onset time from the Director
  data: S;
}

export interface EventDef<S = unknown> {
  id: string;
  family: EventFamily;
  telegraphMs: number;
  /** Must return a defined (non-undefined) value: data === undefined marks "not yet initialized". */
  init(rng: Rng, state: GameState): S;
  /**
   * Mutates inst.data and advances inst.phase. Cell changes must go through the
   * cells helpers (setCellStatus) or otherwise replace g.cells with a NEW array;
   * in-place element mutation will not be detected and will not bump the version.
   */
  onTick(inst: EventInstance<S>, ctx: EventContext): void;
  /** Keyboard interception BEFORE normal typing. Return true if consumed. */
  onKey?(inst: EventInstance<S>, ctx: EventContext, key: string): boolean;
  /** Pointer interactions routed from the stage. Return true if consumed. */
  onPointer?(inst: EventInstance<S>, ctx: EventContext, target: PointerTarget): boolean;
  /** True once the event no longer needs ticks (phase -> done). */
  isResolved(inst: EventInstance<S>, state: GameState): boolean;
  /** A rule injected into the run when this event onsets. */
  coupledRule?: Pg2RuleDef;
  /** Inhabitants only: ally id granted to the finale when alive at finale start. */
  allyId?: AllyId;
  /** Inhabitants only: is the creature "alive/kept" right now? */
  isAlive?(inst: EventInstance<S>): boolean;
}

export type AllyId = "gerald" | "campfire" | "garden";

export type Effect =
  | { kind: "sound"; sound: string } // motif key, resolved by stage
  | { kind: "shake"; trauma: number } // 0..1
  | { kind: "toast"; text: string; tone: "info" | "danger" | "success" }
  | { kind: "title-card"; act: ActId }
  | { kind: "mood"; eventId: string; text: string } // name-tag mood line
  | { kind: "flash"; ms: number };

export interface RunStats {
  lettersAbducted: number;
  lettersRescued: number;
  infectionsCured: number;
  garbageCleared: number;
  missilesIntercepted: number;
  aliensDowned: number;
  creaturesSaved: number; // filled at finale start
  /** defId -> accumulated ms spent in the peak phase; the engine tick tallies this. */
  peakMsByEvent: Record<string, number>;
  /** Event id with the largest accumulated peak ms; "" until the finale computes it. */
  biggestCrisis: string;
  knockbacks: number; // finale phase restarts
}

export type FinalePhaseId = "missiles" | "eula" | "runaway";

export interface FinaleState {
  phase: FinalePhaseId;
  phaseElapsedMs: number;
  allies: AllyId[];
  attempts: number; // knockbacks within current phase
  data: Record<string, unknown>; // per-phase working state, owned by finale.ts
}

export interface GameState {
  seed: number;
  daily: boolean;
  nextCellId: number;
  cells: CharCell[];
  caret: number; // index into cells (0..cells.length)
  startedAtMs: number | null; // null until first keystroke; clock base
  elapsedMs: number; // since first keystroke
  act: ActId;
  actElapsedMs: number;
  rules: Pg2Rule[]; // revealed so far, in order
  ruleStates: Record<string, unknown>;
  events: EventInstance[]; // scheduled (future), active, and done
  finale: FinaleState | null;
  outcome: "playing" | "victory";
  inputLocked: boolean; // loading-bar / missile stun
  stats: RunStats;
  effects: Effect[]; // drained by the stage every frame
  version: number; // bumped on any cells/rules/act change (DOM re-render key)
}
