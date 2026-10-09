import { TICK } from "./sim/config";

// The fixed-step accumulator between animation frames and the sim. Each frame
// adds its elapsed time (scaled by the game speed) and takes as many whole
// 50 ms ticks as fit, at most five: after a long stall the backlog is dropped
// rather than replayed in one burst. Pure: the controller owns the clock.

export const MAX_STEPS_PER_FRAME = 5;
const TICK_MS = TICK * 1000;
// Float sums of frame times land a hair under an exact tick boundary; this
// keeps a boundary a boundary.
const EPSILON_MS = 1e-6;

export interface LoopState {
  accMs: number;
  /** The previous frame's timestamp, or null when the next frame starts the clock. */
  lastMs: number | null;
}

export function createLoop(): LoopState {
  return { accMs: 0, lastMs: null };
}

/** Forget the last timestamp, so time spent paused or hidden is not counted. */
export function resetClock(loop: LoopState): LoopState {
  return { accMs: loop.accMs, lastMs: null };
}

export function advance(
  loop: LoopState,
  nowMs: number,
  timeScale: number,
): { loop: LoopState; steps: number } {
  if (loop.lastMs === null) return { loop: { accMs: loop.accMs, lastMs: nowMs }, steps: 0 };
  const frameMs = Math.max(0, nowMs - loop.lastMs);
  let accMs = loop.accMs + frameMs * Math.max(0, timeScale);
  let steps = Math.floor((accMs + EPSILON_MS) / TICK_MS);
  if (steps > MAX_STEPS_PER_FRAME) {
    steps = MAX_STEPS_PER_FRAME;
    accMs = 0;
  } else {
    accMs = Math.max(0, accMs - steps * TICK_MS);
  }
  return { loop: { accMs, lastMs: nowMs }, steps };
}
