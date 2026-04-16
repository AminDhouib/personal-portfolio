import type { RuleDef } from "../types";
import { pickOne } from "../prng";
import { CHESS_PUZZLES } from "../../../../data/password-game/chess";

/**
 * Chess puzzle rule — shows a small chess board via a marker that the
 * RuleCard renders as an HTML/Unicode chess diagram. Player must include
 * the puzzle's correct move in algebraic notation.
 *
 * Marker format: `[[CHESS:${id}]]` — replaced by the rule-card with a
 * rendered board looked up from CHESS_PUZZLES.
 */
export const CHESS_MARKER_RE = /\[\[CHESS:([\w-]+)\]\]/;

export const chessRule: RuleDef = {
  id: "chess",
  tier: 2,
  create(rng) {
    const puzzle = pickOne(rng, CHESS_PUZZLES);
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
