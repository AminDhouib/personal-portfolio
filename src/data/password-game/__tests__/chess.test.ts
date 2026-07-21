import { describe, expect, it } from "vitest";
import { Chess } from "chess.js";
import { CHESS_PUZZLES } from "../chess";

/**
 * Every static puzzle's `fen` must depict the SAME position as its glyph `board`,
 * because the playable widget renders the glyphs but computes legal moves from the
 * fen — a mismatch would let the player click a piece that is not where it looks.
 * chess.js is the referee: `new Chess(fen)` must load (these didactic positions are
 * minimal and some leave the side-not-to-move in check, which chess.js@1.4 tolerates)
 * and its resolved board must match the glyphs square for square.
 */

const GLYPH: Record<"w" | "b", Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

describe("static chess puzzles carry a fen that matches their glyph board", () => {
  for (const puzzle of CHESS_PUZZLES) {
    it(`${puzzle.id}: fen loads and its placement equals the board`, () => {
      const chess = new Chess(puzzle.fen);

      // Side to move agrees with the toMove field.
      expect(chess.turn()).toBe(puzzle.toMove === "white" ? "w" : "b");

      // chess.board() is rank 8 first, matching board row 0.
      const resolved = chess
        .board()
        .map((rank) => rank.map((sq) => (sq === null ? "." : GLYPH[sq.color][sq.type])).join(""));
      const expected = puzzle.board.map((row) => [...row].slice(0, 8).join(""));
      expect(resolved).toEqual(expected);
    });
  }
});
