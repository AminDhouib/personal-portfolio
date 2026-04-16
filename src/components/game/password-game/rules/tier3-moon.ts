import type { RuleDef } from "../types";
import { moonPhaseFraction, moonPhaseName } from "../../../../data/password-game/moon";

/**
 * Moon phase rule — tier 3. The player's password must include the name of
 * the actual current lunar phase (computed from the system clock). The
 * rule-card renderer reads the `[[MOON:fraction]]` marker and draws an SVG
 * moon that matches the phase visually.
 */
export const MOON_MARKER_RE = /\[\[MOON:([0-9.]+)\]\]/;

export const moonPhaseRule: RuleDef = {
  id: "moon-phase",
  tier: 3,
  create() {
    const fraction = moonPhaseFraction();
    const name = moonPhaseName(fraction);
    return {
      id: "moon-phase",
      tier: 3,
      description: `Your password must include the name of today's moon phase: [[MOON:${fraction.toFixed(3)}]]`,
      params: { fraction, name },
      validate(state) {
        return { passed: state.password.toLowerCase().includes(name) };
      },
    };
  },
};
