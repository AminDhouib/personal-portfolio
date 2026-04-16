import type { RuleDef } from "../types";
import { rangeInt } from "../prng";

function currentTimeString(): string {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

const clockRule: RuleDef = {
  id: "clock",
  tier: 4,
  create() {
    return {
      id: "clock",
      tier: 4,
      description: "Your password must include the current time in HH:MM format.",
      params: {},
      validate(state) {
        return { passed: state.password.includes(currentTimeString()) };
      },
    };
  },
};

const lengthBomb: RuleDef = {
  id: "length-bomb",
  tier: 4,
  create(rng) {
    const max = rangeInt(rng, 40, 60);
    return {
      id: "length-bomb",
      tier: 4,
      description: `Your password must be no longer than ${max} characters.`,
      params: { max },
      validate(state) {
        const len = [...state.password].length;
        return { passed: len <= max, message: `${len} / ${max}` };
      },
    };
  },
};

export const TIER_4_RULES: readonly RuleDef[] = [lengthBomb, clockRule];
