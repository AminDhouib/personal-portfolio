import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RuleList } from "../rule-list";
import type { GameState, Pg2Rule, RuleApi } from "../../engine/types";

/**
 * Task 9's playable chess board, driven through the REAL RuleList -> RuleCard ->
 * PayloadView -> ChessBoard path (not a mocked stand-in), so this also guards the
 * prop threading the shell-level widget-input test cannot see. A failing chess rule
 * is the first (only) rule, so its card renders active + open and the board shows.
 *
 * The fixture is a scholar's-mate position, white to move: clicking the queen on h5
 * then the target f7 is the mate Qxf7#. Everything derives from the fen so the glyph
 * board the widget renders and the position chess.js drives can never disagree.
 */

const SCHOLAR_FEN = "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4";

const GLYPH: Record<"w" | "b", Record<string, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

/** Render the fen's placement as the 8 glyph rows the chess payload carries. */
function fenToGlyphBoard(fen: string): string[] {
  const placement = fen.split(" ")[0] ?? "";
  return placement.split("/").map((rank) => {
    let row = "";
    for (const ch of rank) {
      if (/\d/.test(ch)) row += ".".repeat(Number(ch));
      else row += GLYPH[ch === ch.toUpperCase() ? "w" : "b"][ch.toLowerCase()] ?? "?";
    }
    return row;
  });
}

const STATE = {} as GameState;
const API: RuleApi = {
  isEventActive: () => false,
  isEventDone: () => false,
  getEventData: () => null,
  ruleState: () => null,
  nowHHMM: () => "12:00",
};

/** A never-passing chess rule so its card stays active and its board stays open. */
function chessRule(payload: Record<string, unknown>): Pg2Rule {
  return {
    id: "chess-best-move",
    act: "act3",
    description: "Your password must include the best move in this position.",
    payload,
    validate: () => ({ passed: false }),
  };
}

function renderBoard(payload: Record<string, unknown>) {
  const onWidgetText = vi.fn();
  const onRuleState = vi.fn();
  const { container } = render(
    <RuleList
      rules={[chessRule(payload)]}
      password=""
      state={STATE}
      api={API}
      onWidgetText={onWidgetText}
      onRuleState={onRuleState}
      version={0}
      validationTick={0}
    />,
  );
  const sq = (name: string) => container.querySelector<HTMLElement>(`[data-square="${name}"]`);
  return { container, onWidgetText, onRuleState, sq };
}

const withFen = () => ({
  id: "scholar",
  board: fenToGlyphBoard(SCHOLAR_FEN),
  toMove: "white",
  bestMove: "Qxf7#",
  hint: "Mate in one.",
  fen: SCHOLAR_FEN,
});

afterEach(() => cleanup());

describe("playable chess board", () => {
  it("lights a side-to-move piece's legal targets when clicked", () => {
    const { sq } = renderBoard(withFen());
    // The white queen sits on h5; before selection nothing is a target.
    expect(sq("f7")?.dataset.target).toBeUndefined();
    fireEvent.click(sq("h5")!);
    expect(sq("h5")?.dataset.selected).toBe("true");
    expect(sq("f7")?.dataset.target).toBe("true");
    expect(sq("g6")?.dataset.target).toBe("true"); // another legal queen destination
  });

  it("types the move's SAN when a lit target is clicked", () => {
    const { sq, onWidgetText } = renderBoard(withFen());
    fireEvent.click(sq("h5")!);
    fireEvent.click(sq("f7")!);
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("Qxf7#");
  });

  it("shakes and types nothing when an opponent piece is clicked with no selection", () => {
    const { sq, onWidgetText } = renderBoard(withFen());
    const black = sq("e5")!; // black pawn — not the side to move
    fireEvent.click(black);
    expect(black.className).toContain("pg2-chess__sq--shake");
    expect(black.dataset.selected).toBeUndefined();
    expect(onWidgetText).not.toHaveBeenCalled();
  });

  it("shakes on an empty square clicked with no selection", () => {
    const { sq, onWidgetText } = renderBoard(withFen());
    const empty = sq("d4")!; // empty in the scholar position
    fireEvent.click(empty);
    expect(empty.className).toContain("pg2-chess__sq--shake");
    expect(onWidgetText).not.toHaveBeenCalled();
  });

  it("resets to the puzzle position after a move, so a retry sees targets again", () => {
    const { sq, onWidgetText } = renderBoard(withFen());
    fireEvent.click(sq("h5")!);
    fireEvent.click(sq("f7")!); // move typed; selection cleared
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(sq("h5")?.dataset.selected).toBeUndefined();
    // Board reset from the same fen: reselecting the queen lights f7 once more.
    fireEvent.click(sq("h5")!);
    expect(sq("f7")?.dataset.target).toBe("true");
  });

  it("falls back to the static diagram when the payload has no fen", () => {
    const { container, onWidgetText } = renderBoard({
      id: "scholar",
      board: fenToGlyphBoard(SCHOLAR_FEN),
      toMove: "white",
      bestMove: "Qxf7#",
      hint: "Mate in one.",
    });
    // No interactive squares; the picture keeps its role=img affordance.
    expect(container.querySelectorAll("[data-square]").length).toBe(0);
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    // Clicking a static square is inert.
    const cells = container.querySelectorAll(".pg2-chess__sq");
    fireEvent.click(cells[0]!);
    expect(onWidgetText).not.toHaveBeenCalled();
  });
});
