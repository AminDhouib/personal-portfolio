// The daily tower: one seed per UTC day, the same for everyone. PURE and DOM-free:
// the server's arcade check imports dayNumber from here (daily.test.ts runs in node).
// Seed from utcDayKey (src/lib/arcade/boards.ts) so the tower and the daily board
// turn over at the same instant (DESIGN.md "Daily-seed convention").
import { fnv1a } from "../password-game-2/engine/rng";

/** Bump the version if the recipe ever changes; an old day's tower must not shift. */
export const DAILY_SEED_PREFIX = "tower-daily-v1-";

export function dailyTowerSeed(dayKey: string): number {
  return fnv1a(`${DAILY_SEED_PREFIX}${dayKey}`);
}

/** "2026-10-15" -> 20261015. */
export function dayNumber(dayKey: string): number {
  return Number(dayKey.replace(/-/g, ""));
}

/** A free-build seed from `?tower-seed=<text>`; never equal to a daily seed's input. */
export function freeSeed(text: string): number {
  return fnv1a(`tower-free-${text}`);
}
