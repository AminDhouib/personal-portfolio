/**
 * Simple chess puzzles. Each puzzle's `board` is an 8x8 array of squares
 * using Unicode chess pieces:
 *   ♔=wK  ♕=wQ  ♖=wR  ♗=wB  ♘=wN  ♙=wP
 *   ♚=bK  ♛=bQ  ♜=bR  ♝=bB  ♞=bN  ♟=bP
 *   '.' = empty
 *
 * Row 0 is rank 8 (top), row 7 is rank 1 (bottom).
 * `bestMove` is in simplified algebraic notation: the answer the player
 * must include in their password. Multiple equivalent notations are
 * accepted via `accept`.
 */
export interface ChessPuzzle {
  id: string;
  board: readonly string[];
  toMove: "white" | "black";
  bestMove: string;
  accept: readonly string[];
  hint: string;
}

// Board helpers
const R = {
  wK: "♔", wQ: "♕", wR: "♖", wB: "♗", wN: "♘", wP: "♙",
  bK: "♚", bQ: "♛", bR: "♜", bB: "♝", bN: "♞", bP: "♟",
  "_": ".",
};

// Back-rank mate in one: White to move, Ra8#.
const puzzle1: ChessPuzzle = {
  id: "back-rank",
  board: [
    `${R.bK}......${R._}`,
    `.${R.bP}${R.bP}${R.bP}....`,
    `........`,
    `........`,
    `........`,
    `........`,
    `${R.wR}.......`,
    `${R.wK}.......`,
  ],
  toMove: "white",
  bestMove: "Ra8",
  accept: ["Ra8", "Ra8#", "Ra8+"],
  hint: "White mates in one on the back rank.",
};

// Fool's mate already played — White to capture: Qxh4.
const puzzle2: ChessPuzzle = {
  id: "queen-capture",
  board: [
    `${R.bR}.${R.bB}${R.bQ}${R.bK}${R.bB}.${R.bR}`,
    `${R.bP}${R.bP}${R.bP}${R.bP}${R.bP}${R.bP}${R.bP}${R.bP}`,
    `..${R.bN}....${R.bN}.`,
    `........`,
    `.......${R.bQ}`,
    `....${R.wP}...`,
    `${R.wP}${R.wP}${R.wP}${R.wP}.${R.wP}${R.wP}${R.wP}`,
    `${R.wR}${R.wN}${R.wB}${R.wQ}${R.wK}${R.wB}${R.wN}${R.wR}`,
  ],
  toMove: "white",
  bestMove: "Qxh4",
  accept: ["Qxh4"],
  hint: "Take the exposed queen.",
};

// Knight fork: Nxe5 forks king and rook.
const puzzle3: ChessPuzzle = {
  id: "knight-fork",
  board: [
    `${R.bK}.......`,
    `.......${R.bR}`,
    `........`,
    `....${R.bP}...`,
    `...${R.wN}....`,
    `........`,
    `${R.wP}......${R.wP}`,
    `${R.wK}.......`,
  ],
  toMove: "white",
  bestMove: "Nxe5",
  accept: ["Nxe5"],
  hint: "Knight forks two pieces — pick the capture.",
};

// Rook lift to mate: Rh1#.
const puzzle4: ChessPuzzle = {
  id: "rook-mate",
  board: [
    `.......${R.bK}`,
    `.....${R.bP}${R.bP}${R.bP}`,
    `........`,
    `........`,
    `........`,
    `........`,
    `........`,
    `${R.wR}${R.wK}......`,
  ],
  toMove: "white",
  bestMove: "Rh1",
  accept: ["Rh1", "Rh1#", "Rh1+"],
  hint: "Slide the rook to deliver mate.",
};

// Pawn promotion: e8=Q.
const puzzle5: ChessPuzzle = {
  id: "promote",
  board: [
    `${R.bK}.......`,
    `....${R.wP}...`,
    `........`,
    `........`,
    `........`,
    `........`,
    `........`,
    `.......${R.wK}`,
  ],
  toMove: "white",
  bestMove: "e8=Q",
  accept: ["e8=Q", "e8Q", "e8=Q+", "e8Q+"],
  hint: "Promote the pawn.",
};

export const CHESS_PUZZLES: readonly ChessPuzzle[] = [puzzle1, puzzle2, puzzle3, puzzle4, puzzle5];
