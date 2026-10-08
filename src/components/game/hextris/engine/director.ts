import { COLOURS, SIDES, SPAWN_ROWS, emit, nextRandom, randomBelow, wrapSide } from "./state";
import type { Colour, Piece, RunState, Special } from "./types";

// Level, spawn and speed tuning plus the wave director (spec section 10). Every curve is linear in
// the (real-valued) level between the fixed endpoints at level 1 and MAX_LEVEL.

export const MAX_LEVEL = 35;
const LEVEL_PER_CELL = 0.06;
const MS_PER_LEVEL = 45_000;

// Specials unlock by the best combo reached this run (spec section 7.3).
export const BOMB_UNLOCK_COMBO = 3;
export const RAINBOW_UNLOCK_COMBO = 5;
const BOMB_CHANCE = 0.03;
const RAINBOW_CHANCE = 0.02;

function lerpByLevel(level: number, atFirst: number, atMax: number): number {
  const t = (Math.min(MAX_LEVEL, Math.max(1, level)) - 1) / (MAX_LEVEL - 1);
  return atFirst + (atMax - atFirst) * t;
}

export function levelFor(cellsCleared: number, elapsedMs: number): number {
  return Math.min(MAX_LEVEL, 1 + LEVEL_PER_CELL * cellsCleared + elapsedMs / MS_PER_LEVEL);
}

export function spawnIntervalMs(level: number): number {
  return lerpByLevel(level, 1500, 480);
}

export function fallRowsPerSecond(level: number): number {
  return lerpByLevel(level, 2.6, 8.5);
}

export function comboWindowMs(level: number): number {
  return lerpByLevel(level, 2800, 1500);
}

/**
 * Recomputes the level and reports a change of its whole part. Spec section 11's "rounded
 * level" is read as the floor: it is the number the HUD shows and the `level` the arcade
 * submission carries, so the event never runs ahead of either.
 */
export function refreshLevel(state: RunState): void {
  const before = Math.floor(state.level);
  state.level = levelFor(state.cellsCleared, state.elapsedMs);
  const after = Math.floor(state.level);
  if (after !== before) emit(state, { type: "level", level: after });
}

// The first minute (spec section 10.10): a busier start that hands over to the real level.
const FIRST_MINUTE_MS = 60_000;
const FIRST_MINUTE_LEVEL = 4;
const FIRST_MINUTE_MAX_INTERVAL_MS = 1100;

/** The level the director picks patterns by, and the beat it spaces them on, right now. */
export function pace(state: RunState): { level: number; intervalMs: number } {
  if (state.elapsedMs >= FIRST_MINUTE_MS) {
    return { level: state.level, intervalMs: spawnIntervalMs(state.level) };
  }
  const level = Math.max(state.level, FIRST_MINUTE_LEVEL);
  return { level, intervalMs: Math.min(spawnIntervalMs(level), FIRST_MINUTE_MAX_INTERVAL_MS) };
}

export type PatternName = "single" | "opposite" | "fan" | "ring" | "sweep" | "zipper";

export interface Pattern {
  name: PatternName;
  minLevel: number;
  weight: number;
}

export const PATTERNS: readonly Pattern[] = [
  { name: "single", minLevel: 1, weight: 10 },
  { name: "opposite", minLevel: 3, weight: 4 },
  { name: "fan", minLevel: 6, weight: 3 },
  { name: "ring", minLevel: 12, weight: 1 },
  { name: "sweep", minLevel: 8, weight: 2 },
  { name: "zipper", minLevel: 5, weight: 3 },
];

const SINGLE: Pattern = { name: "single", minLevel: 1, weight: 10 };

/** Picks one pattern by weight from those unlocked at `level`. */
export function pickPattern(state: RunState, level: number): Pattern {
  const open = PATTERNS.filter((p) => p.minLevel <= level);
  const total = open.reduce((sum, p) => sum + p.weight, 0);
  let roll = nextRandom(state) * total;
  for (const pattern of open) {
    roll -= pattern.weight;
    if (roll < 0) return pattern;
  }
  return open[open.length - 1] ?? SINGLE;
}

/** The lanes a pattern fills on each of its beats. */
export function patternBeats(state: RunState, name: PatternName): number[][] {
  switch (name) {
    case "single":
      return [[randomBelow(state, SIDES)]];
    case "opposite": {
      const lane = randomBelow(state, SIDES);
      return [[lane, wrapSide(lane + 3)]];
    }
    case "fan": {
      const first = randomBelow(state, 2);
      return [[first, first + 2, first + 4]];
    }
    case "ring":
      return [[0, 1, 2, 3, 4, 5]];
    case "sweep": {
      const lane = randomBelow(state, SIDES);
      const dir = nextRandom(state) < 0.5 ? 1 : -1;
      return Array.from({ length: SIDES }, (_, beat) => [wrapSide(lane + dir * beat)]);
    }
    case "zipper": {
      const lane = randomBelow(state, SIDES);
      return Array.from({ length: SIDES }, (_, beat) => [wrapSide(lane + 3 * (beat % 2))]);
    }
  }
}

/** The pieces that make up the opening (spec section 10.9) are the run's first three. */
const OPENING_PIECES = 3;

/**
 * Deals a piece's colour and special. No colour comes up three times running, and no piece gets
 * the opening's colour while an opening piece is still falling. The opening passes its colour in.
 */
export function makePiece(state: RunState, lane: number, dealt?: Colour): Piece {
  const opening = state.falling.find((p) => p.id <= OPENING_PIECES)?.colour ?? -1;
  const barred = (c: number) => (state.colourRun >= 2 && c === state.lastColour) || c === opening;
  let colour: number = dealt ?? randomBelow(state, COLOURS);
  while (dealt === undefined && barred(colour)) {
    colour = (colour + 1 + randomBelow(state, COLOURS - 1)) % COLOURS;
  }
  state.colourRun = colour === state.lastColour ? state.colourRun + 1 : 1;
  state.lastColour = colour;
  let special: Special = "none";
  if (state.bestCombo >= BOMB_UNLOCK_COMBO && nextRandom(state) < BOMB_CHANCE) {
    special = "bomb";
  } else if (state.bestCombo >= RAINBOW_UNLOCK_COMBO && nextRandom(state) < RAINBOW_CHANCE) {
    special = "rainbow";
  }
  const id = state.nextPieceId;
  state.nextPieceId += 1;
  return { id, lane, distance: SPAWN_ROWS, colour: colour as Colour, special };
}

// The opening (spec section 10.9): a pair at GO, then the third piece this much later, and the
// first picked pattern after OPENING_MS.
const OPENING_THIRD_MS = 900;
const OPENING_MS = 1000;

/**
 * Queues the opening: one colour, lanes a and a+1 at once and lane a+3 later, so the third
 * piece lands beside the pair after one clockwise turn.
 */
function scheduleOpening(state: RunState, now: number): void {
  const colour = randomBelow(state, COLOURS) as Colour;
  const lane = randomBelow(state, SIDES);
  state.queue.push(
    { atMs: now, lane, colour },
    { atMs: now, lane: wrapSide(lane + 1), colour },
    { atMs: now + OPENING_THIRD_MS, lane: wrapSide(lane + 3), colour },
  );
  state.nextSpawnAtMs = now + OPENING_MS;
}

/** Schedules the next pattern when the last one is done, then releases every due spawn. */
export function runDirector(state: RunState): void {
  const now = state.elapsedMs;
  if (state.nextPieceId === 1 && state.queue.length === 0 && now >= state.nextSpawnAtMs) {
    scheduleOpening(state, now);
  } else if (state.queue.length === 0 && now >= state.nextSpawnAtMs) {
    const { level, intervalMs: interval } = pace(state);
    const pattern = pickPattern(state, level);
    const beats = patternBeats(state, pattern.name);
    beats.forEach((lanes, beat) => {
      for (const lane of lanes) state.queue.push({ atMs: now + beat * interval, lane });
    });
    state.nextSpawnAtMs = now + beats.length * interval;
  }
  while (state.queue.length > 0 && (state.queue[0]?.atMs ?? Infinity) <= now) {
    const due = state.queue.shift();
    if (!due) break;
    const piece = makePiece(state, due.lane, due.colour);
    state.falling.push(piece);
    emit(state, {
      type: "spawn",
      id: piece.id,
      lane: piece.lane,
      colour: piece.colour,
      special: piece.special,
    });
  }
}
