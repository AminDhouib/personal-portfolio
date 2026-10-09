import { TICK } from "./config";
import { S } from "./state";

const TICKS_PER_SECOND = Math.round(1 / TICK);

/**
 * The ranked score of the run so far: ten points per whole second survived plus
 * the points banked (Server Survival's own total, floored, never below zero).
 * Whole seconds come from the tick count, not from multiplying by 0.05, so a run
 * on a second boundary is never a rounding error short of it.
 */
export function scoreOf(): number {
  return Math.floor(S.tick / TICKS_PER_SECOND) * 10 + Math.floor(Math.max(0, S.score.total));
}
