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

/** Deals a piece's colour and special. No colour comes up three times running. */
export function makePiece(state: RunState, lane: number): Piece {
  let colour = randomBelow(state, COLOURS);
  if (state.colourRun >= 2 && colour === state.lastColour) {
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

/** Schedules the next pattern when the last one is done, then releases every due spawn. */
export function runDirector(state: RunState): void {
  const now = state.elapsedMs;
  if (state.queue.length === 0 && now >= state.nextSpawnAtMs) {
    const interval = spawnIntervalMs(state.level);
    // The first piece of a run is always a single (spec section 10.8).
    const pattern = state.nextPieceId === 1 ? SINGLE : pickPattern(state, state.level);
    const beats = patternBeats(state, pattern.name);
    beats.forEach((lanes, beat) => {
      for (const lane of lanes) state.queue.push({ atMs: now + beat * interval, lane });
    });
    state.nextSpawnAtMs = now + beats.length * interval;
  }
  while (state.queue.length > 0 && (state.queue[0]?.atMs ?? Infinity) <= now) {
    const due = state.queue.shift();
    if (!due) break;
    const piece = makePiece(state, due.lane);
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
