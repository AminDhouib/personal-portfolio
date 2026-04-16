/**
 * Moon phase calculation — used by the "name today's moon phase" rule.
 *
 * Uses the synodic month (29.53 days) and a known New Moon epoch to derive
 * the current phase fraction (0..1). Phase names map the fraction to one of
 * eight canonical names that the player types into their password.
 */
export type MoonPhaseName =
  | "new"
  | "waxing crescent"
  | "first quarter"
  | "waxing gibbous"
  | "full"
  | "waning gibbous"
  | "last quarter"
  | "waning crescent";

const SYNODIC_DAYS = 29.53058867;
// Reference New Moon: 2000-01-06 18:14 UTC.
const EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/** Phase fraction in [0, 1) — 0 = new, 0.5 = full. */
export function moonPhaseFraction(date: Date = new Date()): number {
  const days = (date.getTime() - EPOCH_MS) / 86_400_000;
  const raw = (days / SYNODIC_DAYS) % 1;
  return raw < 0 ? raw + 1 : raw;
}

export function moonPhaseName(fraction: number): MoonPhaseName {
  if (fraction < 0.03 || fraction >= 0.97) return "new";
  if (fraction < 0.22) return "waxing crescent";
  if (fraction < 0.28) return "first quarter";
  if (fraction < 0.47) return "waxing gibbous";
  if (fraction < 0.53) return "full";
  if (fraction < 0.72) return "waning gibbous";
  if (fraction < 0.78) return "last quarter";
  return "waning crescent";
}
