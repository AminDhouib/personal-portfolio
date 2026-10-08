import { fallRowsPerSecond, refreshLevel, runDirector } from "./director";
import { resolveClears } from "./match";
import { expireCombo } from "./scoring";
import { TICK_MS, emit, rotationOffset, sideFacingLane, wrapSide } from "./state";
import type { EngineAction, Piece, RunState, TimedAction } from "./types";

// The fixed-step machine (spec sections 3 and 12). The shell feeds real time to `advance`, which
// runs whole TICK_MS steps and keeps the remainder in `carryMs`, so the same total time gives the
// same run whatever the frame rate.

/** Rush multiplies the fall speed while held (spec section 3.2). */
export const RUSH_FACTOR = 4;

// Float slack so that, say, sixty 1000/60 ms frames run exactly the 120 ticks one 1000 ms call
// does.
const TICK_SLACK = 1e-9;
const CARRY_PRECISION = 1e6;

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
  refreshLevel(state);
}

/**
 * Runs `ms` of real time. `input` actions are applied at the first tick boundary at or after
 * their `atMs` (measured from the start of this call); any left over apply at the end.
 */
export function advance(state: RunState, ms: number, input: readonly TimedAction[] = []): void {
  const actions = [...input].sort((a, b) => a.atMs - b.atMs);
  let next = 0;
  const budget = state.carryMs + Math.max(0, ms);
  const ticks = Math.floor(budget / TICK_MS + TICK_SLACK);
  for (let k = 0; k < ticks; k++) {
    const tickStart = k * TICK_MS - state.carryMs;
    while (next < actions.length && (actions[next]?.atMs ?? Infinity) <= tickStart) {
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
  const carry = budget - ticks * TICK_MS;
  state.carryMs = Math.max(0, Math.round(carry * CARRY_PRECISION) / CARRY_PRECISION);
}
