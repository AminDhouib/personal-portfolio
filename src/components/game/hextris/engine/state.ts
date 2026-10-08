import { mulberry32 } from "@/components/game/password-game-2/engine/rng";
import type { EngineEvent, RunState } from "./types";

export const SIDES = 6;
export const COLOURS = 4;
/** One fixed simulation step (spec section 12.1). */
export const TICK_MS = 1000 / 120;
/** The stack limit at the start of a run, in rows. */
export const START_LIMIT_ROWS = 12;
/** How far out a new piece appears, in rows: past the tallest stack a live run can hold. */
export const SPAWN_ROWS = START_LIMIT_ROWS + 2;
/** How long the drawn hexagon takes to ease into a new rotation. */
export const ROTATION_EASE_MS = 90;
/** The countdown before play (spec section 3.7): 3, 2, 1, each this long, then GO. */
export const COUNTDOWN_STEP_MS = 800;
export const COUNTDOWN_MS = 3 * COUNTDOWN_STEP_MS;

// mulberry32 advances its 32-bit state by this constant on every draw, so one draw from a fresh
// generator seeded with the stored state, plus this step, continues the same stream.
const MULBERRY_STEP = 0x6d2b79f5;

export function createRun(options: { seed: number }): RunState {
  const seed = options.seed >>> 0;
  return {
    seed,
    rngState: seed,
    phase: "ready",
    sides: Array.from({ length: SIDES }, () => []),
    falling: [],
    nextPieceId: 1,
    facing: 0,
    rotationFrom: 0,
    rotationAt: 0,
    rush: false,
    score: 0,
    combo: 1,
    comboUntilMs: 0,
    lastClearAtMs: -1,
    bestCombo: 1,
    cellsCleared: 0,
    ticks: 0,
    elapsedMs: 0,
    carryMs: 0,
    freezeUntilMs: 0,
    level: 1,
    nextSpawnAtMs: 0,
    queue: [],
    lastColour: -1,
    colourRun: 0,
    limitRows: START_LIMIT_ROWS,
    nextShrinkAtMs: -1,
    boundaryArmed: false,
    boundaryWarned: false,
    momentum: 0,
    lastInputMs: 0,
    afk: true,
    events: [],
  };
}

/** The run's next random number in [0, 1). The only source of randomness in the engine. */
export function nextRandom(state: RunState): number {
  const value = mulberry32(state.rngState)();
  state.rngState = (state.rngState + MULBERRY_STEP) >>> 0;
  return value;
}

/** A random integer in [0, n). */
export function randomBelow(state: RunState, n: number): number {
  return Math.floor(nextRandom(state) * n);
}

export function emit(state: RunState, event: EngineEvent): void {
  state.events.push(event);
}

/** Hands the queued events to the shell and empties the queue. */
export function drainEvents(state: RunState): EngineEvent[] {
  const out = state.events;
  state.events = [];
  return out;
}

export function wrapSide(side: number): number {
  return ((side % SIDES) + SIDES) % SIDES;
}

/** The side that currently faces a screen lane. */
export function sideFacingLane(state: RunState, lane: number): number {
  return wrapSide(lane - state.facing);
}

/**
 * The drawn rotation's remaining offset from `facing`, in side steps, at `nowMs` on the
 * run clock. It eases linearly from `rotationFrom` to 0 over ROTATION_EASE_MS.
 */
export function rotationOffset(state: RunState, nowMs: number): number {
  const progress = Math.min(1, Math.max(0, (nowMs - state.rotationAt) / ROTATION_EASE_MS));
  return state.rotationFrom * (1 - progress);
}
