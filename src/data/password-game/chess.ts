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

// Queen mate in the corner, supported by king: Qh7#.
const puzzle6: ChessPuzzle = {
  id: "queen-corner",
  board: [
    `.......${R.bK}`,
    `........`,
    `......${R.wK}${R.wQ}`,
    `........`,
    `........`,
    `........`,
    `........`,
    `........`,
  ],
  toMove: "white",
  bestMove: "Qh7#",
  accept: ["Qh7", "Qh7#", "Qh7+"],
  hint: "Queen finishes it in the corner — the king defends.",
};

// Smothered mate: Nf7# — Black king is boxed in by its own pieces.
const puzzle7: ChessPuzzle = {
  id: "smothered",
  board: [
    `......${R.bR}${R.bK}`,
    `......${R.bP}${R.bP}`,
    `...${R.wN}....`,
    `........`,
    `........`,
    `........`,
    `........`,
    `.......${R.wK}`,
  ],
  toMove: "white",
  bestMove: "Nf7#",
  accept: ["Nf7", "Nf7#", "Nf7+"],
  hint: "The classic smothered mate — the king can't escape its own pieces.",
};

// Knight fork in the corner: Nc7+ hits king and rook.
const puzzle8: ChessPuzzle = {
  id: "fork-corner",
  board: [
    `${R.bK}...${R.bR}...`,
    `........`,
    `........`,
    `.${R.wN}......`,
    `........`,
    `........`,
    `........`,
    `.......${R.wK}`,
  ],
  toMove: "white",
  bestMove: "Nc7+",
  accept: ["Nc7+", "Nc7"],
  hint: "A knight lands on one square and attacks both the king and the rook.",
};

// Pin exploit — the queen is pinned to the king on the d-file.
const puzzle9: ChessPuzzle = {
  id: "pin-queen",
  board: [
    `...${R.bK}....`,
    `........`,
    `........`,
    `...${R.bQ}....`,
    `........`,
    `........`,
    `........`,
    `...${R.wR}.${R.wK}..`,
  ],
  toMove: "white",
  bestMove: "Rxd5",
  accept: ["Rxd5", "Rxd5+"],
  hint: "The queen is pinned against the king — just take it.",
};

// King-and-rook mate on the a-file against h8 — king on g6 seals escape squares.
const puzzle10: ChessPuzzle = {
  id: "king-and-rook",
  board: [
    `.......${R.bK}`,
    `........`,
    `......${R.wK}.`,
    `........`,
    `........`,
    `........`,
    `........`,
    `${R.wR}.......`,
  ],
  toMove: "white",
  bestMove: "Ra8#",
  accept: ["Ra8", "Ra8#", "Ra8+"],
  hint: "The king on g6 seals the escape squares — the rook delivers.",
};

export const CHESS_PUZZLES: readonly ChessPuzzle[] = [
  puzzle1,
  puzzle2,
  puzzle3,
  puzzle4,
  puzzle5,
  puzzle6,
  puzzle7,
  puzzle8,
  puzzle9,
  puzzle10,
];

// Authoritative daily puzzle injected from /api/password-game/chess-puzzle.
// When set, the chess rule prefers this over the static pool.
let _dailyPuzzle: ChessPuzzle | null = null;

export function setDailyChessPuzzle(p: ChessPuzzle | null): void {
  _dailyPuzzle = p;
}

export function getDailyChessPuzzle(): ChessPuzzle | null {
  return _dailyPuzzle;
}
