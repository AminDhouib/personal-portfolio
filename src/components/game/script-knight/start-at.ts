import type { LevelRef } from "./engine/level-ref";
import { FLOORS_PER_TOWER, isTowerUnlocked, type Progress, type ProgressAt } from "./progress";

export interface Start {
  /** True for Today's floor. */
  daily: boolean;
  at: ProgressAt;
  /** Said when the player cannot be put on the floor they asked for. */
  notice: string | null;
}

export const LOCKED_NOTICE =
  "That floor is not open to you yet, so this is as far as you have got there.";

/**
 * Where the stage opens for a replay link's "Play this floor". A daily goes to Today's floor
 * (the stage picks the day). A tower floor goes there when the player has reached it; else to the
 * furthest floor they have, and the notice says so.
 */
export function resolveStart(ref: LevelRef | undefined, progress: Progress): Start {
  if (ref === undefined) return { daily: false, at: progress.at, notice: null };
  if (ref.kind === "daily") return { daily: true, at: progress.at, notice: null };

  const tower = isTowerUnlocked(progress, ref.tower) ? ref.tower : progress.at.tower;
  const { reached, best } = progress.towers[tower];
  const level = Math.max(1, Math.min(ref.level, reached, FLOORS_PER_TOWER));
  const epic = ref.epic && best[String(FLOORS_PER_TOWER)] !== undefined;
  const clamped = tower !== ref.tower || level !== ref.level;
  return { daily: false, at: { tower, level, epic }, notice: clamped ? LOCKED_NOTICE : null };
}
