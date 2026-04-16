import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { ASCII_ART } from "../../../../data/password-game/ascii-art";

/**
 * ASCII art rule — renders small art via the `[[ASCII:id]]` marker and asks
 * the player to name what it is. Accepts any synonym from the entry's
 * `answers` list (case-insensitive substring match).
 */
export const ASCII_MARKER_RE = /\[\[ASCII:([\w-]+)\]\]/;

export const asciiRule: RuleDef = {
  id: "ascii-art",
  tier: 2,
  create(rng) {
    const entry = pickOne(rng, ASCII_ART);
    return {
      id: "ascii-art",
      tier: 2,
      description: `Your password must name this drawing: [[ASCII:${entry.id}]]`,
      params: { id: entry.id, answers: entry.answers },
      validate(state) {
        const pw = state.password.toLowerCase();
        return { passed: entry.answers.some((a) => pw.includes(a.toLowerCase())) };
      },
    };
  },
};
