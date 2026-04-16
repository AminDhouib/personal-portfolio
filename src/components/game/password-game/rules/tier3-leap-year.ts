import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

function isLeap(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export const leapYearRule: RuleDef = {
  id: "leap-year",
  tier: 3,
  create(rng) {
    const width = rangeInt(rng, 30, 60);
    const min = rangeInt(rng, 1900, 2100 - width);
    const max = min + width;
    return {
      id: "leap-year",
      tier: 3,
      description: `Your password must include a leap year between ${min} and ${max}.`,
      params: { min, max },
      validate(state) {
        const matches = state.password.match(/(?<!\d)\d{4}(?!\d)/g) ?? [];
        for (const m of matches) {
          const y = Number(m);
          if (y >= min && y <= max && isLeap(y)) return { passed: true };
        }
        return { passed: false };
      },
    };
  },
};
