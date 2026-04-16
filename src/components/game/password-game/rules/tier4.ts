import type { RuleDef } from "../types";
import { rangeInt, pickOne } from "../prng";

const VOWELS = ["a", "e", "i", "o", "u"] as const;

const forbiddenVowel: RuleDef = {
  id: "forbidden-vowel",
  tier: 4,
  create(rng) {
    const vowel = pickOne(rng, VOWELS);
    return {
      id: "forbidden-vowel",
      tier: 4,
      description: `Your password cannot contain the letter "${vowel}" (uppercase or lowercase).`,
      params: { vowel },
      validate(state) {
        const lower = state.password.toLowerCase();
        return { passed: !lower.includes(vowel) };
      },
    };
  },
};

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

export const TIER_4_RULES: readonly RuleDef[] = [lengthBomb, clockRule, forbiddenVowel];
