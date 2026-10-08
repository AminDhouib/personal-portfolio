import { emit } from "./state";
import type { RunState } from "./types";

// The shrinking boundary and game over (spec section 9).

export const FLOOR_LIMIT_ROWS = 4;
export const SHRINK_EVERY_MS = 60_000;
export const WARN_BEFORE_MS = 10_000;
// Tick times are multiples of 1000/120, so allow float slack when they meet a whole-ms deadline.
const TIME_SLACK = 1e-6;

/** Starts the shrink timer on the run's first rotation, or at GO for one in the countdown. */
export function armBoundary(state: RunState): void {
  if (state.boundaryArmed) return;
  state.boundaryArmed = true;
  state.boundaryWarned = false;
  state.nextShrinkAtMs = Math.max(0, state.elapsedMs) + SHRINK_EVERY_MS;
}

/** The first side whose stack is above the limit, checking `prefer` first, or -1. */
export function overflowSide(state: RunState, prefer = -1): number {
  if ((state.sides[prefer]?.length ?? 0) > state.limitRows) return prefer;
  return state.sides.findIndex((stack) => stack.length > state.limitRows);
}

/** Ends the run if any stack is above the limit. Returns whether it did. */
export function endIfOverflowing(state: RunState, prefer = -1): boolean {
  if (state.phase !== "playing") return state.phase === "over";
  const side = overflowSide(state, prefer);
  if (side < 0) return false;
  state.phase = "over";
  state.rush = false;
  emit(state, {
    type: "game-over",
    side,
    score: state.score,
    cellsCleared: state.cellsCleared,
  });
  return true;
}

/** Warns ahead of, then applies, each scheduled drop of the limit. */
export function tickBoundary(state: RunState): void {
  if (!state.boundaryArmed || state.limitRows <= FLOOR_LIMIT_ROWS) return;
  const now = state.elapsedMs + TIME_SLACK;
  if (!state.boundaryWarned && now >= state.nextShrinkAtMs - WARN_BEFORE_MS) {
    state.boundaryWarned = true;
    emit(state, {
      type: "boundary-warning",
      dropAtMs: state.nextShrinkAtMs,
      nextLimit: state.limitRows - 1,
    });
  }
  if (now >= state.nextShrinkAtMs) {
    state.limitRows -= 1;
    state.nextShrinkAtMs += SHRINK_EVERY_MS;
    state.boundaryWarned = false;
    emit(state, { type: "boundary-drop", limit: state.limitRows });
    endIfOverflowing(state);
  }
}
