import { emit } from "./state";
import type { RunState } from "./types";

// Momentum and Panic Clear (spec section 8). Panic adds its score here rather than through
// scoring.ts, which imports this module.

export const MOMENTUM_MAX = 100;
const MOMENTUM_PER_CELL = 1.5;
export const PANIC_POINTS_PER_CELL = 30;

/** Credits a clear: 1.5 per cell plus the combo level it reached, capped at MOMENTUM_MAX. */
export function addMomentum(state: RunState, cells: number, combo: number): void {
  const value = Math.min(MOMENTUM_MAX, state.momentum + MOMENTUM_PER_CELL * cells + combo);
  if (value === state.momentum) return;
  state.momentum = value;
  emit(state, { type: "momentum", value });
}

/**
 * Clears every settled cell for PANIC_POINTS_PER_CELL each, not multiplied by the combo, and
 * empties the meter. Refused below a full meter, outside play, or on an empty board. A separate
 * bonus (spec 6.6 and 8): the cells do not count toward cellsCleared, so they raise neither the
 * level nor the arcade kills (spec 4.6 counts only group clears).
 */
export function panic(state: RunState): boolean {
  if (state.phase !== "playing" || state.momentum < MOMENTUM_MAX) return false;
  const cells = state.sides.reduce((sum, stack) => sum + stack.length, 0);
  if (cells === 0) return false;
  state.sides = state.sides.map(() => []);
  const points = PANIC_POINTS_PER_CELL * cells;
  state.momentum = 0;
  emit(state, { type: "panic", cells, points });
  emit(state, { type: "momentum", value: 0 });
  state.score += points;
  emit(state, { type: "score", score: state.score });
  return true;
}
