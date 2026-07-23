import { useState } from "react";
import { Chess, type PieceSymbol, type Square } from "chess.js";
import type { WidgetChannel } from "./types";

const CHESS_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

/** Chooser roster, in the order a promotion dialog conventionally offers them. */
const PROMOTION_ROLES = [
  { role: "q", label: "queen" },
  { role: "r", label: "rook" },
  { role: "b", label: "bishop" },
  { role: "n", label: "knight" },
] as const;

/** Unicode glyphs for the chooser, keyed by the promoting side's color. */
const PROMOTION_GLYPHS: Record<"w" | "b", Record<string, string>> = {
  w: { q: "♕", r: "♖", b: "♗", n: "♘" },
  b: { q: "♛", r: "♜", b: "♝", n: "♞" },
};

/** Algebraic square for a grid cell: row 0 is rank 8, col 0 is file a. */
function squareAt(row: number, col: number): string {
  return `${CHESS_FILES[col] ?? "?"}${8 - row}`;
}

/**
 * The chess payload's board is 8 rows of 8 Unicode piece glyphs or '.'. When the
 * payload also carries a `fen` (the live feed and the static pool both supply one)
 * the grid is PLAYABLE: click a side-to-move piece to light its legal targets, then
 * click a target to type that move's SAN into the password through the widget
 * channel. Without a fen — a stale cached feed shape from before fen was served —
 * it degrades to the static diagram it has always been.
 *
 * chess.js is re-instantiated from the fen for every interaction: cheap, and it
 * keeps the component stateless between renders apart from the current selection, so
 * every move starts from the puzzle position again. Validation stays `includes(best
 * move)`, so any legal move types text — a wrong one is simply backspaced and retried
 * against the reset board. Square clicks stopPropagation so they never toggle the
 * rule card, and the squares are `[role=button]`, which the shell's global keydown
 * handler already ignores, so playing here never leaks keystrokes into the password.
 */
export function ChessBoard({
  board,
  hint,
  fen,
  widget,
}: {
  board: string[];
  hint?: string;
  fen?: string;
  widget: WidgetChannel;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [shake, setShake] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(
    null,
  );
  const interactive = typeof fen === "string" && fen.length > 0;

  // Legal destinations for the current selection, resolved fresh from the fen.
  // A promotion contributes four verbose moves (q/r/b/n) all sharing one `to`;
  // the Set collapses them, and `promotionTargets` remembers which squares need
  // the chooser rather than an immediate move.
  const targets = new Set<string>();
  const promotionTargets = new Set<string>();
  if (interactive && selected) {
    try {
      for (const m of new Chess(fen).moves({ square: selected as Square, verbose: true })) {
        targets.add(m.to);
        if (m.isPromotion()) promotionTargets.add(m.to);
      }
    } catch {
      // silent-ok: an unexpected square just yields no targets.
    }
  }

  /** Complete a move to its SAN and reset the board back to the puzzle position. */
  function typeMove(from: string, to: string, promotion: PieceSymbol) {
    try {
      const move = new Chess(fen).move({ from: from as Square, to: to as Square, promotion });
      if (move) widget.onWidgetText(move.san);
    } catch {
      // silent-ok: an illegal move (should not happen — from/to came from moves()) types nothing.
    }
    setSelected(null);
    setShake(null);
    setPendingPromotion(null);
  }

  function onSquare(row: number, col: number) {
    if (!interactive) return;
    const sq = squareAt(row, col);
    // 0) With a chooser open, any board square is a dismissal: deselect, no shake.
    if (pendingPromotion) {
      setPendingPromotion(null);
      setSelected(null);
      setShake(null);
      return;
    }
    // 1) A click onto a lit target either opens the promotion chooser or, for an
    //    ordinary move, types its SAN and resets the board. The chooser lets a
    //    player pick under-promotions (e8=N#) that a hardcoded queen could never
    //    reach; validate is a plain string check against whichever SAN is typed.
    if (selected && targets.has(sq)) {
      if (promotionTargets.has(sq)) {
        setPendingPromotion({ from: selected, to: sq });
        setShake(null);
        return;
      }
      typeMove(selected, sq, "q");
      return;
    }
    // 2) Selecting one of the side-to-move's own pieces lights its targets.
    try {
      const chess = new Chess(fen);
      const piece = chess.get(sq as Square);
      if (piece && piece.color === chess.turn()) {
        setSelected(sq);
        setShake(null);
        return;
      }
    } catch {
      // silent-ok
    }
    // 3) An empty square or an opponent piece is a dead click: shake, type nothing.
    setSelected(null);
    setShake(sq);
  }

  // The chooser offers the side-to-move's pieces; resolve the color from the fen.
  let promotionColor: "w" | "b" = "w";
  if (pendingPromotion) {
    try {
      promotionColor = new Chess(fen).turn();
    } catch {
      // silent-ok: default to white if the fen somehow will not parse.
    }
  }

  return (
    <div className="mt-3">
      <div
        className="pg2-chess"
        aria-label={interactive ? "Playable chess position" : "Chess position"}
        role={interactive ? "group" : "img"}
      >
        {board.flatMap((row, r) =>
          [...row].slice(0, 8).map((cell, c) => {
            const glyph = cell === "." ? "" : cell;
            const shade = (r + c) % 2 === 0 ? "pg2-chess__sq--light" : "pg2-chess__sq--dark";
            if (!interactive) {
              return (
                <div key={`${r}-${c}`} className={`pg2-chess__sq ${shade}`}>
                  {glyph}
                </div>
              );
            }
            const square = squareAt(r, c);
            const isSelected = selected === square;
            const isTarget = targets.has(square);
            const isShake = shake === square;
            return (
              <div
                key={`${r}-${c}`}
                role="button"
                tabIndex={0}
                aria-label={glyph ? `${square} ${glyph}` : square}
                aria-pressed={isSelected}
                data-square={square}
                data-selected={isSelected ? "true" : undefined}
                data-target={isTarget ? "true" : undefined}
                onClick={(e) => {
                  e.stopPropagation();
                  onSquare(r, c);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onSquare(r, c);
                  }
                }}
                className={`pg2-chess__sq pg2-chess__sq--btn ${shade} ${isSelected ? "pg2-chess__sq--selected" : ""} ${isTarget ? "pg2-chess__sq--target" : ""} ${isShake ? "pg2-chess__sq--shake" : ""}`}
              >
                {glyph}
              </div>
            );
          }),
        )}
      </div>
      {pendingPromotion ? (
        <div className="pg2-chess__promo" role="group" aria-label="Choose promotion piece">
          {PROMOTION_ROLES.map(({ role, label }) => (
            <div
              key={role}
              role="button"
              tabIndex={0}
              aria-label={`promote to ${label}`}
              data-promote={role}
              onClick={(e) => {
                e.stopPropagation();
                typeMove(pendingPromotion.from, pendingPromotion.to, role);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  typeMove(pendingPromotion.from, pendingPromotion.to, role);
                }
              }}
              className="pg2-chess__promo-piece"
            >
              {PROMOTION_GLYPHS[promotionColor][role]}
            </div>
          ))}
        </div>
      ) : null}
      {hint ? <p className="mt-2 text-xs text-[color:var(--pg2-muted)]">{hint}</p> : null}
    </div>
  );
}
