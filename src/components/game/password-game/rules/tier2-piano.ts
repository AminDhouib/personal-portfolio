import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { PIANO_KEYS } from "../../../../data/password-game/piano";

/**
 * Piano rule — renders a small keyboard via the `[[PIANO:order]]` marker in
 * the description. The player must include the name of the highlighted note
 * (C, C#, D, etc.). Sharp/flat aliases are accepted (C# or Db).
 */
export const PIANO_MARKER_RE = /\[\[PIANO:(\d+)\]\]/;

export const pianoRule: RuleDef = {
  id: "piano",
  tier: 2,
  create(rng) {
    const key = pickOne(rng, PIANO_KEYS);
    const accepted = key.alt ? [key.note, key.alt] : [key.note];
    return {
      id: "piano",
      tier: 2,
      description: `Your password must include the name of this note: [[PIANO:${key.order}]]`,
      params: { note: key.note, alt: key.alt, order: key.order },
      validate(state) {
        const pw = state.password;
        // Sharp notation uses "#" which is legal in the password; accept
        // both "C#" literal and alt "Db". Plain single-letter notes must
        // be word-like (not part of a longer identifier).
        for (const n of accepted) {
          if (n.length > 1 && pw.includes(n)) return { passed: true };
          if (n.length === 1 && new RegExp(`(^|[^A-Za-z])${n}(?=[^A-Za-z]|$)`).test(pw)) {
            return { passed: true };
          }
        }
        return { passed: false };
      },
    };
  },
};
