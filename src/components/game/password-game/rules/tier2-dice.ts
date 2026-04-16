import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

/**
 * Dice rule — tier 2. Rolls three 6-sided dice (seeded) and asks the player
 * to include the sum in their password. The rule-card renders pip patterns
 * for each face.
 *
 * Marker format: `[[DICE:v1,v2,v3]]` — comma-separated face values.
 */
export const DICE_MARKER_RE = /\[\[DICE:(\d+(?:,\d+)*)\]\]/;

export const diceRule: RuleDef = {
  id: "dice-roll",
  tier: 2,
  create(rng) {
    const faces = [rangeInt(rng, 1, 6), rangeInt(rng, 1, 6), rangeInt(rng, 1, 6)];
    const sum = faces.reduce((a, b) => a + b, 0);
    return {
      id: "dice-roll",
      tier: 2,
      description: `Your password must include the sum of this dice roll: [[DICE:${faces.join(",")}]]`,
      params: { faces, sum },
      validate(state) {
        const matches = state.password.match(/(?<!\d)\d+(?!\d)/g) ?? [];
        return { passed: matches.some((m) => Number(m) === sum) };
      },
    };
  },
};
