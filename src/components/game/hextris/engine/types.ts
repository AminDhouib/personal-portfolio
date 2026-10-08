// Plain data shapes for the clean-room engine (docs/specs/2026-10-hextris-engine-behaviour.md).
// Everything here is JSON-safe so a run can be copied, compared and replayed.

export type Phase = "ready" | "countdown" | "playing" | "paused" | "over";

/** One of the four piece colours, as an index into the painter's palette. */
export type Colour = 0 | 1 | 2 | 3;

export type Special = "none" | "bomb" | "rainbow";

/** A settled cell. Its row is its index in the side's stack (row 0 touches the hexagon). */
export interface Cell {
  colour: Colour;
  special: Special;
}

/** A cell position on the board. */
export interface Pos {
  side: number;
  row: number;
}

/** A piece in flight along a fixed screen lane, `distance` rows out from the hexagon. */
export interface Piece {
  id: number;
  lane: number;
  distance: number;
  colour: Colour;
  special: Special;
}

/** A spawn the director has scheduled but not yet released. */
export interface QueuedSpawn {
  atMs: number;
  lane: number;
  /** Set only for the opening, whose colours are fixed in advance (spec section 10.9). */
  colour?: Colour;
}

/** The abstract player actions (spec section 2.7). The engine never reads the keyboard. */
export type EngineAction =
  "start" | "rotate-cw" | "rotate-ccw" | "rush" | "rush-off" | "toggle-pause" | "panic";

/** An action scheduled `atMs` after the start of an `advance` call. */
export interface TimedAction {
  atMs: number;
  action: EngineAction;
}

export type EngineEvent =
  | { type: "run-start" }
  | { type: "countdown"; count: number }
  | { type: "go" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "game-over"; side: number; score: number; cellsCleared: number }
  | { type: "spawn"; id: number; lane: number; colour: Colour; special: Special }
  | { type: "settle"; side: number; row: number; colour: Colour; special: Special }
  | { type: "rotate"; dir: 1 | -1 }
  | {
      type: "clear";
      cells: Pos[];
      count: number;
      colour: Colour;
      combo: number;
      chain: boolean;
      points: number;
    }
  | { type: "chain"; cells: Pos[]; combo: number; points: number }
  | { type: "combo"; cells: Pos[]; combo: number; points: number }
  | { type: "combo-expired" }
  | { type: "bomb"; side: number; row: number }
  | { type: "gravity" }
  | { type: "clean-sweep"; cells: Pos[]; combo: number; points: number }
  | { type: "panic"; cells: number; points: number }
  | { type: "momentum"; value: number }
  | { type: "level"; level: number }
  | { type: "boundary-warning"; dropAtMs: number; nextLimit: number }
  | { type: "boundary-drop"; limit: number }
  | { type: "score"; score: number };

export interface RunState {
  seed: number;
  /** mulberry32 state, kept as a number so the run stays serialisable. */
  rngState: number;
  phase: Phase;
  /** Six stacks, index = side, inner index = row. */
  sides: Cell[][];
  falling: Piece[];
  nextPieceId: number;
  /** Rotation in side steps (0..5): side `i` faces lane `(i + facing) % 6`. */
  facing: number;
  /** Animation only: the visual offset in side steps the last rotation eases out from. */
  rotationFrom: number;
  /** Animation only: `elapsedMs` when the last rotation happened. */
  rotationAt: number;
  rush: boolean;
  score: number;
  combo: number;
  comboUntilMs: number;
  /** `elapsedMs` of the most recent clear, or -1 before the first. */
  lastClearAtMs: number;
  /** Highest combo reached this run (unlocks specials). */
  bestCombo: number;
  cellsCleared: number;
  /**
   * Fixed ticks of unpaused play, counted from GO: negative during the countdown. `elapsedMs`
   * is derived from it, so the run clock reads -2400 ms at the start and 0 at GO.
   */
  ticks: number;
  elapsedMs: number;
  /** Real time not yet consumed by a whole tick. */
  carryMs: number;
  level: number;
  nextSpawnAtMs: number;
  queue: QueuedSpawn[];
  /** The previous spawned colour and how many times in a row it came up. */
  lastColour: number;
  colourRun: number;
  limitRows: number;
  nextShrinkAtMs: number;
  boundaryArmed: boolean;
  boundaryWarned: boolean;
  momentum: number;
  /** `elapsedMs` of the player's last input (meaningful once `afk` has first gone false). */
  lastInputMs: number;
  /**
   * The player is away (spec section 6.9): no input yet this run, or none for 8 s of play.
   * Clears still happen but score nothing. Any input sets it back to false.
   */
  afk: boolean;
  events: EngineEvent[];
}
