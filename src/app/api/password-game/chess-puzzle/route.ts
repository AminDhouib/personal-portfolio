import { NextResponse } from "next/server";
import { Chess } from "chess.js";
import { captureException, logWarn } from "@/lib/log";

export const runtime = "nodejs";

/**
 * Server-side proxy for Lichess's daily puzzle.
 *
 * Fetches `/api/puzzle/daily`, resolves the puzzle's starting position,
 * converts the FEN into our 8-string Unicode board format, and computes the
 * SAN (algebraic notation) of every accepted first move — the answer the
 * player types into their password. Cached for 12h via Next's fetch cache.
 *
 * The position comes from the payload's own `puzzle.fen` when present (the
 * primary path — it sidesteps PGN-replay fragility entirely); otherwise we
 * replay the game's PGN. `initialPly` is the INDEX of the last played ply, so
 * the puzzle position is reached by replaying indices 0..initialPly INCLUSIVE.
 */

interface LichessDaily {
  game?: { pgn?: string };
  puzzle?: {
    id?: string;
    fen?: string;
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
  K: "\u2654",
  Q: "\u2655",
  R: "\u2656",
  B: "\u2657",
  N: "\u2658",
  P: "\u2659",
  k: "\u265A",
  q: "\u265B",
  r: "\u265C",
  b: "\u265D",
  n: "\u265E",
  p: "\u265F",
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
  const first = ordered[0];
  if (!first) return "Find the best move.";
  const top = first
    .replace(/([A-Z])/g, " $1")
    .replace(/^\s+/, "")
    .toLowerCase();
  return `Theme: ${top}.`;
}

/**
 * Resolve the puzzle's starting position into a chess.js instance. Prefer the
 * payload's own `puzzle.fen` — loading it directly avoids the whole PGN-replay
 * fragility class. Fall back to replaying the PGN when the FEN is absent:
 * `initialPly` is the INDEX of the last played ply, so the puzzle position is
 * reached by replaying indices 0..initialPly INCLUSIVE. Returns null when the
 * payload lacks a usable position or the data is malformed.
 */
function loadPuzzlePosition(data: LichessDaily): Chess | null {
  const fen = data.puzzle?.fen;
  if (typeof fen === "string" && fen.length > 0) {
    try {
      return new Chess(fen);
    } catch {
      // silent-ok: a malformed upstream FEN just means no usable position; the
      // caller logs the miss and serves the unavailable fallback.
      return null;
    }
  }

  const pgn = data.game?.pgn;
  const initialPly = data.puzzle?.initialPly;
  if (!pgn || typeof initialPly !== "number") return null;

  const chess = new Chess();
  chess.loadPgn(pgn);
  const history = chess.history({ verbose: true });
  // The last played ply is at index initialPly, so we need at least that many
  // moves plus one to replay through it.
  if (history.length <= initialPly) return null;

  const replay = new Chess();
  for (let i = 0; i <= initialPly; i++) {
    const move = history[i];
    if (!move) continue;
    replay.move({ from: move.from, to: move.to, promotion: move.promotion });
  }
  return replay;
}

async function fetchLichess(): Promise<ChessPuzzleDto | null> {
  try {
    const res = await fetch("https://lichess.org/api/puzzle/daily", {
      headers: { "User-Agent": "password-game-portfolio/1.0" },
      next: { revalidate: 60 * 60 * 12 },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logWarn("api:chess-puzzle", "upstream returned a non-OK status", { status: res.status });
      return null;
    }
    const data: LichessDaily = await res.json();
    const puzzle = data.puzzle;
    if (!puzzle?.solution || puzzle.solution.length === 0) {
      logWarn("api:chess-puzzle", "upstream payload missing required puzzle fields");
      return null;
    }

    const replay = loadPuzzlePosition(data);
    if (!replay) {
      logWarn("api:chess-puzzle", "could not resolve the puzzle's starting position");
      return null;
    }

    const fen = replay.fen();
    const board = fenToBoard(fen);
    const toMove: "white" | "black" = replay.turn() === "w" ? "white" : "black";

    // Convert the first UCI solution move into SAN, collecting every legal
    // notation variant so the validator accepts all common forms.
    const firstUci = puzzle.solution[0];
    if (!firstUci) return null;
    const from = firstUci.slice(0, 2);
    const to = firstUci.slice(2, 4);
    const promotion = firstUci.length > 4 ? firstUci.slice(4) : undefined;
    const applied = replay.move({ from, to, promotion });
    if (!applied) return null;

    const san = applied.san;
    const sanBare = san.replace(/[+#]/g, "");
    const accept = Array.from(new Set([san, sanBare, `${sanBare}+`, `${sanBare}#`]));

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
  } catch (err) {
    captureException("api:chess-puzzle", err);
    return null;
  }
}

export async function GET() {
  const puzzle = await fetchLichess();
  if (!puzzle) {
    return NextResponse.json(
      { puzzle: null, source: "unavailable" },
      { headers: { "cache-control": "public, s-maxage=300" } },
    );
  }
  return NextResponse.json(
    { puzzle, source: "lichess" },
    { headers: { "cache-control": "public, s-maxage=43200, stale-while-revalidate=86400" } },
  );
}
