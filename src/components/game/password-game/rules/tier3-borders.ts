import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { COUNTRY_BORDERS, BORDER_SOURCES } from "../../../../data/password-game/borders";

export const countryBordersRule: RuleDef = {
  id: "country-borders",
  tier: 3,
  create(rng) {
    const source = pickOne(rng, BORDER_SOURCES);
    const neighbors = COUNTRY_BORDERS[source] ?? [];
    return {
      id: "country-borders",
      tier: 3,
      description: `Your password must include the name of a country that shares a land border with ${source}.`,
      params: { source, neighbors },
      validate(state) {
        const pw = state.password.toLowerCase();
        return {
          passed: neighbors.some((n) => pw.includes(n.toLowerCase())),
        };
      },
    };
  },
};
