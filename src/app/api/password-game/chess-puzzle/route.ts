import { NextResponse } from "next/server";
import { Chess } from "chess.js";

export const runtime = "nodejs";

/**
 * Server-side proxy for Lichess's daily puzzle.
 *
 * Fetches `/api/puzzle/daily`, replays the PGN to the puzzle's starting ply,
 * converts the FEN into our 8-string Unicode board format, and computes the
 * SAN (algebraic notation) of every accepted first move — the answer the
 * player types into their password. Cached for 12h via Next's fetch cache.
 */

interface LichessDaily {
  game?: { pgn?: string };
  puzzle?: {
    id?: string;
    initialPly?: number;
    rating?: number;
    themes?: string[];
    solution?: string[];
  };
}

interface ChessPuzzleDto {
  id: string;
  board: readonly string[];
  toMove: "white" | "black";
  bestMove: string;
  accept: readonly string[];
  hint: string;
  rating?: number;
  themes?: readonly string[];
}

const UNICODE: Record<string, string> = {
  K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658", P: "\u2659",
  k: "\u265A", q: "\u265B", r: "\u265C", b: "\u265D", n: "\u265E", p: "\u265F",
};

function fenToBoard(fen: string): string[] {
  const placement = fen.split(" ")[0] ?? "";
  const ranks = placement.split("/");
  if (ranks.length !== 8) throw new Error("invalid FEN rank count");
  return ranks.map((rank) => {
    let row = "";
    for (const ch of rank) {
      if (/\d/.test(ch)) row += ".".repeat(Number(ch));
      else row += UNICODE[ch] ?? "?";
    }
    if (row.length !== 8) throw new Error("invalid FEN rank length");
    return row;
  });
}

function themeToHint(themes: readonly string[] | undefined): string {
  if (!themes || themes.length === 0) return "Find the best move.";
  const ordered = themes.slice().sort((a, b) => a.length - b.length);
  const top = ordered[0]
    .replace(/([A-Z])/g, " $1")
    .replace(/^\s+/, "")
    .toLowerCase();
  return `Theme: ${top}.`;
}

async function fetchLichess(): Promise<ChessPuzzleDto | null> {
  try {
    const res = await fetch("https://lichess.org/api/puzzle/daily", {
      headers: { "User-Agent": "password-game-portfolio/1.0" },
      next: { revalidate: 60 * 60 * 12 },
    });
    if (!res.ok) return null;
    const data: LichessDaily = await res.json();
    const pgn = data.game?.pgn;
    const puzzle = data.puzzle;
    if (!pgn || !puzzle?.initialPly || !puzzle.solution || puzzle.solution.length === 0) {
      return null;
    }

    const chess = new Chess();
    chess.loadPgn(pgn);
    const history = chess.history({ verbose: true });
    if (history.length < puzzle.initialPly) return null;

    // Replay only up to initialPly to reach the puzzle's starting position.
    const replay = new Chess();
    for (let i = 0; i < puzzle.initialPly; i++) {
      const move = history[i];
      replay.move({ from: move.from, to: move.to, promotion: move.promotion });
    }

    const fen = replay.fen();
    const board = fenToBoard(fen);
    const toMove: "white" | "black" = replay.turn() === "w" ? "white" : "black";

    // Convert the first UCI solution move into SAN, collecting every legal
    // notation variant so the validator accepts all common forms.
    const firstUci = puzzle.solution[0];
    const from = firstUci.slice(0, 2);
    const to = firstUci.slice(2, 4);
    const promotion = firstUci.length > 4 ? firstUci.slice(4) : undefined;
    const applied = replay.move({ from, to, promotion });
    if (!applied) return null;

    const san = applied.san;
    const sanBare = san.replace(/[+#]/g, "");
    const accept = Array.from(
      new Set([san, sanBare, `${sanBare}+`, `${sanBare}#`])
    );

    return {
      id: `lichess-${puzzle.id ?? "daily"}`,
      board,
      toMove,
      bestMove: san,
      accept,
      hint: themeToHint(puzzle.themes),
      rating: puzzle.rating,
      themes: puzzle.themes,
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const puzzle = await fetchLichess();
  if (!puzzle) {
    return NextResponse.json(
      { puzzle: null, source: "unavailable" },
      { headers: { "cache-control": "public, s-maxage=300" } }
    );
  }
  return NextResponse.json(
    { puzzle, source: "lichess" },
    { headers: { "cache-control": "public, s-maxage=43200, stale-while-revalidate=86400" } }
  );
}
