import { comboWindowMs } from "./director";
import { emit } from "./state";
import type { Colour, Pos, RunState } from "./types";

// The kept scoring rules (spec section 6). The leaderboard's plausibility check is built on these,
// so change them only together with src/lib/arcade/games.ts.

/** A clear this soon after the previous one is a chain: +2 combo instead of +1. */
export const CHAIN_WINDOW_MS = 400;
export const CLEAN_SWEEP_MIN_CELLS = 10;
const CLEAN_SWEEP_PER_COMBO = 1000;

export function clearPoints(cells: number, combo: number): number {
  return cells * cells * combo;
}

export function addScore(state: RunState, points: number): void {
  if (points <= 0) return;
  state.score += points;
  emit(state, { type: "score", score: state.score });
}

/**
 * Updates the combo for a clear happening now, then scores it (spec section 6.3). A gravity chain
 * always counts as a chain. `boardEmpty` is whether the clear left no settled cells.
 */
export function scoreClear(
  state: RunState,
  cells: Pos[],
  colour: Colour,
  gravityChain: boolean,
  boardEmpty: boolean,
): void {
  const now = state.elapsedMs;
  const before = state.combo;
  const hadClear = state.lastClearAtMs >= 0;
  const chain = gravityChain || (hadClear && now - state.lastClearAtMs <= CHAIN_WINDOW_MS);
  const inWindow = hadClear && now < state.comboUntilMs;
  if (chain) state.combo += 2;
  else if (inWindow) state.combo += 1;
  else state.combo = 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  state.lastClearAtMs = now;
  state.comboUntilMs = now + comboWindowMs(state.level);

  const count = cells.length;
  const points = clearPoints(count, state.combo);
  state.cellsCleared += count;
  emit(state, { type: "clear", cells, count, colour, combo: state.combo, chain, points });
  if (chain) emit(state, { type: "chain", cells, combo: state.combo, points });
  if (state.combo !== before) emit(state, { type: "combo", cells, combo: state.combo, points });
  addScore(state, points);

  if (boardEmpty && count >= CLEAN_SWEEP_MIN_CELLS) {
    const bonus = CLEAN_SWEEP_PER_COMBO * state.combo;
    emit(state, { type: "clean-sweep", cells, combo: state.combo, points: bonus });
    addScore(state, bonus);
  }
}

/** Drops the combo back to 1 once its window has passed without a clear. */
export function expireCombo(state: RunState): void {
  if (state.combo > 1 && state.elapsedMs >= state.comboUntilMs) {
    state.combo = 1;
    emit(state, { type: "combo-expired" });
  }
}
