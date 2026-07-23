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

/**
 * A white pawn on e7 with the enemy king boxed on h8: e8 promotions are all legal,
 * and chess.js reports e8=Q+, e8=R+, e8=B, e8=N for the four pieces. The chooser
 * must appear on the e8 click and only type once a piece is picked.
 */
const PROMOTION_FEN = "7k/4P3/8/8/8/8/8/K7 w - - 0 1";
const withPromotion = () => ({
  id: "promo",
  board: fenToGlyphBoard(PROMOTION_FEN),
  toMove: "white",
  bestMove: "e8=N",
  hint: "Underpromote to knight.",
  fen: PROMOTION_FEN,
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

  it("opens a 4-piece promotion chooser on a promotion target instead of typing", () => {
    const { container, sq, onWidgetText } = renderBoard(withPromotion());
    fireEvent.click(sq("e7")!);
    expect(sq("e8")?.dataset.target).toBe("true");
    fireEvent.click(sq("e8")!);
    // Four choices, and nothing typed yet: the move waits on the piece pick.
    expect(container.querySelectorAll("[data-promote]").length).toBe(4);
    expect(onWidgetText).not.toHaveBeenCalled();
  });

  it("types the underpromotion SAN when the knight is chosen", () => {
    const { container, sq, onWidgetText } = renderBoard(withPromotion());
    fireEvent.click(sq("e7")!);
    fireEvent.click(sq("e8")!);
    fireEvent.click(container.querySelector('[data-promote="n"]')!);
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("e8=N");
    // Chooser dismissed and the board deselected after the pick.
    expect(container.querySelectorAll("[data-promote]").length).toBe(0);
    expect(sq("e7")?.dataset.selected).toBeUndefined();
  });

  it("types the queen SAN when the queen is chosen", () => {
    const { container, sq, onWidgetText } = renderBoard(withPromotion());
    fireEvent.click(sq("e7")!);
    fireEvent.click(sq("e8")!);
    fireEvent.click(container.querySelector('[data-promote="q"]')!);
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("e8=Q+");
  });

  it("cancels the chooser without typing when another board square is clicked", () => {
    const { container, sq, onWidgetText } = renderBoard(withPromotion());
    fireEvent.click(sq("e7")!);
    fireEvent.click(sq("e8")!);
    expect(container.querySelectorAll("[data-promote]").length).toBe(4);
    fireEvent.click(sq("a1")!); // any board square dismisses the pending chooser
    expect(container.querySelectorAll("[data-promote]").length).toBe(0);
    expect(onWidgetText).not.toHaveBeenCalled();
    expect(sq("e7")?.dataset.selected).toBeUndefined();
  });

  it("never opens the chooser for a non-promotion move", () => {
    const { container, sq, onWidgetText } = renderBoard(withFen());
    fireEvent.click(sq("h5")!);
    fireEvent.click(sq("f7")!); // Qxf7#, not a promotion — types straight through
    expect(container.querySelectorAll("[data-promote]").length).toBe(0);
    expect(onWidgetText).toHaveBeenCalledWith("Qxf7#");
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
