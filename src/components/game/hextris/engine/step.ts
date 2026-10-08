import { fallRowsPerSecond, refreshLevel, runDirector } from "./director";
import { armBoundary, checkGameOver, tickBoundary } from "./limit";
import { resolveClears } from "./match";
import { panic } from "./momentum";
import { expireCombo } from "./scoring";
import { TICK_MS, emit, rotationOffset, sideFacingLane, wrapSide } from "./state";
import type { EngineAction, Piece, RunState, TimedAction } from "./types";

// The fixed-step machine (spec sections 3 and 12). The shell feeds real time to `advance`, which
// runs whole TICK_MS steps and keeps the remainder in `carryMs`, so the same total time gives the
// same run whatever the frame rate.

/** Rush multiplies the fall speed while held (spec section 3.2). */
export const RUSH_FACTOR = 4;

// Time inside `advance` is counted in whole sub-tick units (a million per tick, so 120,000 per
// ms) rather than float milliseconds, so no frame split can move a tick boundary: many short
// frames run exactly the ticks one long call of the same total does.
const UNITS_PER_MS = 120_000;
const TICK_UNITS = 1_000_000;

export function start(state: RunState): void {
  if (state.phase !== "ready") return;
  state.phase = "playing";
  emit(state, { type: "run-start" });
}

export function togglePause(state: RunState): void {
  if (state.phase === "playing") {
    state.phase = "paused";
    // A rush key lifted while paused never reaches the engine, so a pause ends the rush.
    state.rush = false;
    emit(state, { type: "pause" });
  } else if (state.phase === "paused") {
    state.phase = "playing";
    emit(state, { type: "resume" });
  }
}

/** Turns the hexagon one side: 1 clockwise, -1 counter-clockwise. */
export function rotate(state: RunState, dir: 1 | -1): void {
  if (state.phase !== "playing") return;
  // Keep the drawn angle continuous: start the new ease from wherever the last one had reached.
  const offset = rotationOffset(state, state.elapsedMs);
  state.facing = wrapSide(state.facing + dir);
  state.rotationFrom = offset - dir;
  state.rotationAt = state.elapsedMs;
  state.lastInputMs = state.elapsedMs;
  emit(state, { type: "rotate", dir });
  armBoundary(state);
}

export function setRush(state: RunState, on: boolean): void {
  if (state.phase !== "playing") return;
  state.rush = on;
  state.lastInputMs = state.elapsedMs;
}

/** Always allowed, so a release can never be lost. */
export function releaseRush(state: RunState): void {
  state.rush = false;
}

export function applyAction(state: RunState, action: EngineAction): void {
  switch (action) {
    case "start":
      start(state);
      return;
    case "rotate-cw":
      rotate(state, 1);
      return;
    case "rotate-ccw":
      rotate(state, -1);
      return;
    case "rush":
      setRush(state, true);
      return;
    case "rush-off":
      releaseRush(state);
      return;
    case "toggle-pause":
      togglePause(state);
      return;
    case "panic":
      panic(state);
      return;
  }
}

function settle(state: RunState, piece: Piece): void {
  const side = sideFacingLane(state, piece.lane);
  const stack = state.sides[side];
  if (!stack) return;
  const row = stack.length;
  stack.push({ colour: piece.colour, special: piece.special });
  emit(state, { type: "settle", side, row, colour: piece.colour, special: piece.special });
  resolveClears(state, side, row);
  checkGameOver(state, side);
}

function movePieces(state: RunState): void {
  const rows = (fallRowsPerSecond(state.level) * (state.rush ? RUSH_FACTOR : 1) * TICK_MS) / 1000;
  // Lowest first, so a piece behind another in the same lane sees the stack it just grew.
  const order = [...state.falling].sort((a, b) => a.distance - b.distance || a.id - b.id);
  const landed = new Set<number>();
  for (const piece of order) {
    if (state.phase !== "playing") break;
    piece.distance -= rows;
    const height = state.sides[sideFacingLane(state, piece.lane)]?.length ?? 0;
    if (piece.distance <= height) {
      landed.add(piece.id);
      settle(state, piece);
    }
  }
  if (landed.size > 0) state.falling = state.falling.filter((p) => !landed.has(p.id));
}

function tick(state: RunState): void {
  state.ticks += 1;
  state.elapsedMs = state.ticks * TICK_MS;
  runDirector(state);
  movePieces(state);
  if (state.phase !== "playing") return;
  expireCombo(state);
  tickBoundary(state);
  if (state.phase !== "playing") return;
  refreshLevel(state);
}

/**
 * Runs `ms` of real time. Each `input` action is applied just before the tick whose time span
 * contains its `atMs` (measured from the start of this call); any left over apply at the end.
 * A non-finite or negative `ms` is ignored.
 */
export function advance(state: RunState, ms: number, input: readonly TimedAction[] = []): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  const actions = [...input].sort((a, b) => a.atMs - b.atMs);
  let next = 0;
  // `carryMs` always holds a whole number of units, so this round trip is exact.
  const carry = Math.round(state.carryMs * UNITS_PER_MS);
  const budget = carry + Math.round(ms * UNITS_PER_MS);
  const ticks = Math.floor(budget / TICK_UNITS);
  for (let k = 0; k < ticks; k++) {
    const tickEnd = (k + 1) * TICK_UNITS - carry;
    while (
      next < actions.length &&
      Math.round((actions[next]?.atMs ?? 0) * UNITS_PER_MS) < tickEnd
    ) {
      const due = actions[next];
      next += 1;
      if (due) applyAction(state, due.action);
    }
    if (state.phase === "playing") tick(state);
  }
  for (; next < actions.length; next++) {
    const due = actions[next];
    if (due) applyAction(state, due.action);
  }
  state.carryMs = (budget - ticks * TICK_UNITS) / UNITS_PER_MS;
}
