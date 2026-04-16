import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { FLAGS, type FlagDef } from "../../../../data/password-game/flags";

/**
 * Flag identification rule — shows a CSS-rendered tricolor via a custom
 * HTML marker embedded in the description string. The rule-card renderer
 * reads the marker and replaces it with a styled div.
 *
 * Marker format: `[[FLAG:${country}]]`
 *
 * RuleCard renders the marker as a small flag box styled with the colors
 * from the FlagDef lookup. We export the data with the marker so validation
 * and display stay in one place.
 */
export const FLAG_MARKER_RE = /\[\[FLAG:([A-Za-z ]+)\]\]/;

export const flagRule: RuleDef = {
  id: "flag",
  tier: 2,
  create(rng) {
    const flag: FlagDef = pickOne(rng, FLAGS);
    return {
      id: "flag",
      tier: 2,
      description: `Your password must include the name of this country: [[FLAG:${flag.country}]]`,
      params: {
        country: flag.country,
        orientation: flag.orientation,
        colors: flag.colors,
      },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(flag.country.toLowerCase()) };
      },
    };
  },
};
