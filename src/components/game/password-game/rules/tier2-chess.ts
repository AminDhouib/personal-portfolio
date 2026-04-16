import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { CHESS_PUZZLES, getDailyChessPuzzle } from "../../../../data/password-game/chess";

/**
 * Chess puzzle rule — shows a small chess board via a marker that the
 * RuleCard renders as an HTML/Unicode chess diagram. Player must include
 * the puzzle's correct move in algebraic notation.
 *
 * When the Lichess daily puzzle has been fetched and injected via
 * setDailyChessPuzzle, the rule prefers it over the static pool — every
 * player on the same day sees the same real rated puzzle.
 *
 * Marker format: `[[CHESS:${id}]]` — replaced by the rule-card with a
 * rendered board looked up from CHESS_PUZZLES (or the injected daily).
 */
export const CHESS_MARKER_RE = /\[\[CHESS:([\w-]+)\]\]/;

export const chessRule: RuleDef = {
  id: "chess",
  tier: 2,
  create(rng) {
    const daily = getDailyChessPuzzle();
    const puzzle = daily ?? pickOne(rng, CHESS_PUZZLES);
    return {
      id: "chess",
      tier: 2,
      description: `Your password must include the best move (${puzzle.toMove} to play): [[CHESS:${puzzle.id}]]`,
      params: {
        id: puzzle.id,
        bestMove: puzzle.bestMove,
        accept: puzzle.accept,
        toMove: puzzle.toMove,
      },
      validate(state) {
        return {
          passed: puzzle.accept.some((move) => state.password.includes(move)),
        };
      },
    };
  },
};
