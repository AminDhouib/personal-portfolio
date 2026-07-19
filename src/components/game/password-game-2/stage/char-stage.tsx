import type { ReactNode, RefObject } from "react";
import type { CellStatus, CharCell } from "../engine/types";

interface CharStageProps {
  cells: readonly CharCell[];
  caret: number;
  /** Forwarded to the box element so the canvas overlay (Task 12) can measure it. */
  boxRef?: RefObject<HTMLDivElement | null>;
  onCellClick: (id: number) => void;
  onBoxClick: () => void;
}

/** Status → visual variant class. "normal"/"parasite" render as plain glyphs. */
function cellClass(status: CellStatus): string {
  switch (status) {
    case "infected":
      return "pg2-cell pg2-cell--infected";
    case "mutated":
      return "pg2-cell pg2-cell--mutated";
    case "garbage":
      return "pg2-cell pg2-cell--garbage";
    case "parasite":
      return "pg2-cell pg2-cell--parasite";
    case "ember":
      return "pg2-cell pg2-cell--ember";
    case "orbiting":
      return "pg2-cell pg2-cell--orbiting";
    case "abducted":
      return "pg2-cell pg2-cell--abducted";
    case "normal":
      return "pg2-cell";
  }
}

/** Spaces would collapse inside inline spans; render them at full monospace width. */
function glyphOf(cell: CharCell): string {
  if (cell.status === "orbiting" || cell.status === "abducted") return "";
  return cell.ch === " " ? " " : cell.ch;
}

/**
 * The password box: each character is its own DOM cell (keyed by stable id) so
 * events can infect, abduct, or orbit individual glyphs. A manual caret span is
 * spliced in at g.caret. data-cell-id lets the Task 12 canvas overlay measure
 * per-cell rects for creature painters and pointer hit-testing.
 */
export function CharStage({ cells, caret, boxRef, onCellClick, onBoxClick }: CharStageProps) {
  const clampedCaret = Math.max(0, Math.min(caret, cells.length));

  const caretNode = <span key="caret" className="pg2-caret" aria-hidden="true" />;

  const nodes: ReactNode[] = [];
  cells.forEach((cell, i) => {
    if (i === clampedCaret) nodes.push(caretNode);
    nodes.push(
      <span
        key={cell.id}
        data-cell-id={cell.id}
        className={cellClass(cell.status)}
        onMouseDown={(e) => {
          e.stopPropagation();
          onCellClick(cell.id);
        }}
      >
        {glyphOf(cell)}
      </span>,
    );
  });
  if (clampedCaret >= cells.length) nodes.push(caretNode);

  return (
    <div
      ref={boxRef}
      data-pg2-box
      className="pg2-box"
      role="textbox"
      aria-label="Password"
      aria-multiline="true"
      onMouseDown={(e) => {
        e.preventDefault();
        onBoxClick();
      }}
    >
      {cells.length === 0 ? (
        <div className="pg2-box__inner">
          {caretNode}
          <span className="pg2-box__placeholder">Begin typing your password…</span>
        </div>
      ) : (
        <div className="pg2-box__inner">{nodes}</div>
      )}
    </div>
  );
}
