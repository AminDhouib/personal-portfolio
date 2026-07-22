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
 * [116, 132]. The floor is set by the worst-case required content: every rule's
 * mandatory substring present at once, measured at 114 characters across a sweep
 * of 3000 seeds under the production feeds and the length-maximizing exogenous
 * inputs (clock 00:00, which forces the largest digit-sum block; the longest daily
 * chess SAN; the longest served country). That worst case is dominated by the
 * country-name rule: /api/password-game/countries serves the full vendored capitals
 * list and the rule picks one per seed, so ~6% of seeds draw a country over 20
 * characters and the longest ("Saint Helena, Ascension and Tristan da Cunha") is 44
 * characters on its own. A 116 floor clears 114 with ~2 of headroom, so the designed
 * tension is against event pressure (Tetris garbage, abductions transiently inflating
 * the password) rather than against the rules themselves; the 16-wide window keeps
 * the cap varying across seeds. The floor moved 40 -> 74 -> 81 -> 116 as live feeds
 * and the act1/act2 widget rules grew the mandatory content; the earlier 81 was
 * measured against a single short injected country and silently under-counted the
 * live feed's long tail. The budget is enforced by rules.test.ts: the rule-15 bounds
 * test pins [116, 132], and the "solves every seed 1..20 under worst-case live feeds"
 * solveAll test injects the longest served country under both clock extremes and
 * asserts the fully-solved password fits the seed's cap.
 */
const maxLength: Pg2RuleDef = {
  id: "max-length",
  act: "act3",
  create: (rng) => {
    const target = rangeInt(rng, 116, 132);
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
