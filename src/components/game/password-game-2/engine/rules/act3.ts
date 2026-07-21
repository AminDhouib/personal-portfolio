import type { Pg2RuleDef } from "../types";
import { rangeInt } from "../rng";
import { FREEBIE_MESSAGE } from "./act1";
import { getDailyChessPuzzle } from "../../../../../data/password-game/chess";

/** The word the backwards-password rule looks for: "password" reversed. */
export const BACKWARDS_PASSWORD = "drowssap";

/**
 * Rule 14 — the best move in the daily chess puzzle, from the live feed only.
 * When no daily puzzle is injected the rule is a freebie; unlike v1's chessRule
 * it never falls back to the static CHESS_PUZZLES pool. The payload carries the
 * board, the move, and the `fen` the stage loads into the playable widget so the
 * player can click the move out instead of transcribing the SAN by hand.
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
            fen: puzzle.fen,
          }
        : { bestMove: null },
      validate: (password) => {
        if (!puzzle) return { passed: true, message: FREEBIE_MESSAGE };
        return { passed: password.includes(puzzle.bestMove) };
      },
    };
  },
};

/**
 * Rule 15 — a ceiling on length, the security-measure gag. The cap is seeded in
 * [60, 75]: high enough that the base roster (captcha + drowssap + the live-feed
 * answers + the digit block) always fits with room to spare, so the designed
 * tension is against event pressure (Tetris garbage, abductions) rather than
 * against the rules themselves. The 40 of v1 was structurally unsolvable once
 * live feeds injected a long country name and a chess SAN.
 */
const maxLength: Pg2RuleDef = {
  id: "max-length",
  act: "act3",
  create: (rng) => {
    const target = rangeInt(rng, 60, 75);
    return {
      id: "max-length",
      act: "act3",
      description: `Your password must be at most ${target} characters. This is a security measure.`,
      payload: { target },
      validate: (password) => {
        const len = [...password].length;
        return { passed: len <= target, message: `${len} / ${target}` };
      },
    };
  },
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
  maxLength,
  backwardsPassword,
  finalBlessing,
];
