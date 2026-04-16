import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

/**
 * Digital clock rule — tier 3. Shows an HH:MM time in LED 7-segment style
 * and asks the player to include the time in their password. The time is
 * picked deterministically from the PRNG so every same-seed run shows the
 * same clock.
 *
 * Accepted answers: "14:25", "1425", "14 25".
 */
export const CLOCK_MARKER_RE = /\[\[CLOCK:(\d{2}):(\d{2})\]\]/;

export const clockRule: RuleDef = {
  id: "digital-clock",
  tier: 3,
  create(rng) {
    const h = rangeInt(rng, 0, 23);
    const m = rangeInt(rng, 0, 59);
    const hh = String(h).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    return {
      id: "digital-clock",
      tier: 3,
      description: `Your password must include the time shown: [[CLOCK:${hh}:${mm}]]`,
      params: { hh, mm },
      validate(state) {
        const pw = state.password;
        const joined = `${hh}${mm}`;
        if (pw.includes(`${hh}:${mm}`)) return { passed: true };
        if (pw.includes(joined)) return { passed: true };
        if (pw.includes(`${hh} ${mm}`)) return { passed: true };
        return { passed: false };
      },
    };
  },
};
