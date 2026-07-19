import type { Pg2RuleDef } from "../types";
import { FREEBIE_MESSAGE } from "./act1";
import { getDailyChessPuzzle } from "../../../../../data/password-game/chess";

/** The word the backwards-password rule looks for: "password" reversed. */
export const BACKWARDS_PASSWORD = "drowssap";

/**
 * Rule 14 — the best move in the daily chess puzzle, from the live feed only.
 * When no daily puzzle is injected the rule is a freebie; unlike v1's chessRule
 * it never falls back to the static CHESS_PUZZLES pool. The payload carries the
 * board and move so the stage can render the diagram.
 */
const chessBestMove: Pg2RuleDef = {
  id: "chess-best-move",
  act: "act3",
  create: () => {
    const puzzle = getDailyChessPuzzle();
    return {
      id: "chess-best-move",
      act: "act3",
      description: "Your password must include the best move in this position.",
      payload: puzzle
        ? {
            id: puzzle.id,
            board: puzzle.board,
            toMove: puzzle.toMove,
            bestMove: puzzle.bestMove,
            hint: puzzle.hint,
          }
        : { bestMove: null },
      validate: (password) => {
        if (!puzzle) return { passed: true, message: FREEBIE_MESSAGE };
        return { passed: password.includes(puzzle.bestMove) };
      },
    };
  },
};

/** Rule 15 — a ceiling on length, the security-measure gag. */
const maxLength40: Pg2RuleDef = {
  id: "max-length-40",
  act: "act3",
  create: () => ({
    id: "max-length-40",
    act: "act3",
    description: "Your password must be at most 40 characters. This is a security measure.",
    validate: (password) => {
      const len = [...password].length;
      return { passed: len <= 40, message: `${len} / 40` };
    },
  }),
};

/** Rule 16 — the password must contain "password" spelled backwards. */
const backwardsPassword: Pg2RuleDef = {
  id: "backwards-password",
  act: "act3",
  create: () => ({
    id: "backwards-password",
    act: "act3",
    description: "Your password must contain the word password, backwards.",
    validate: (password) => ({
      passed: password.toLowerCase().includes(BACKWARDS_PASSWORD),
    }),
  }),
};

/** Rule 17 — the finish line. Always passes; its reveal is the payoff. */
const finalBlessing: Pg2RuleDef = {
  id: "final-blessing",
  act: "act3",
  create: () => ({
    id: "final-blessing",
    act: "act3",
    description: "The form is now willing to consider your submission. Click Submit.",
    validate: () => ({ passed: true }),
  }),
};

/** Act 3 rules, in reveal order. */
export const ACT3_RULES: readonly Pg2RuleDef[] = [
  chessBestMove,
  maxLength40,
  backwardsPassword,
  finalBlessing,
];
