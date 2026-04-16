import type { RuleDef } from "../types";
import { wordleOfTheDay } from "../../../../data/password-game/wordle";

/**
 * Today's Wordle rule — password must contain today's 5-letter Wordle
 * answer. Deterministic per UTC date so every player on the same day has
 * the same answer (enables daily-challenge competition).
 */
export const wordleRule: RuleDef = {
  id: "wordle",
  tier: 2,
  create() {
    const answer = wordleOfTheDay();
    return {
      id: "wordle",
      tier: 2,
      description: `Your password must include today's Wordle answer.`,
      params: { answer },
      validate(state) {
        return { passed: state.password.toUpperCase().includes(answer) };
      },
    };
  },
};
