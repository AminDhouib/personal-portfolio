import type { RuleDef } from "../types";
import { zodiacForDate } from "../../../../data/password-game/zodiac";

/**
 * Zodiac rule — tier 3. Shows the Unicode glyph for today's actual Western
 * zodiac sign and asks the player to name it. Match is case-insensitive.
 *
 * Marker format: `[[ZODIAC:Name]]` — replaced by the rule-card with the
 * glyph rendered as text (not emoji).
 */
export const ZODIAC_MARKER_RE = /\[\[ZODIAC:([A-Za-z]+)\]\]/;

export const zodiacRule: RuleDef = {
  id: "zodiac",
  tier: 3,
  create() {
    const sign = zodiacForDate();
    return {
      id: "zodiac",
      tier: 3,
      description: `Your password must include today's zodiac sign: [[ZODIAC:${sign.name}]]`,
      params: { name: sign.name, glyph: sign.glyph },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(sign.name.toLowerCase()) };
      },
    };
  },
};
