"use client";

import { Tile } from "./Tile";
import { RowInfoDigits, ColInfoDigits } from "./InfoDigits";
import { MemoControls } from "./MemoControls";
import type { GameState, MemoMarks } from "../types";

const ASSETS = "/games/super-voltorb-flip/sprites";

export const BOARD_SECTION_HEIGHT = 219;

/**
 * Bottom section of the DS canvas: the 5x5 grid, the colored row/col info
 * panels (chrome baked in, digits overlaid), and the memo UI.
 * All internal coordinates are relative to the board-section slice, which
 * begins at y=180 in the full canvas.
 */
export function BoardSection({
  state,
  onTileClick,
  onMemoToggle,
  onMarkChange,
  onToggleCopy,
}: {
  state: GameState;
  onTileClick: (row: number, col: number) => void;
  onMemoToggle: () => void;
  onMarkChange: (idx: 0 | 1 | 2 | 3) => void;
  onToggleCopy: () => void;
}) {
  const selectedMemos: MemoMarks = state.selectedMemoTile
    ? state.board[state.selectedMemoTile.row][state.selectedMemoTile.col].memos
    : [false, false, false, false];

  return (
    <div
      style={{
        position: "relative",
        width: 262,
        height: BOARD_SECTION_HEIGHT,
        backgroundImage: `url(${ASSETS}/chrome/board-section.png)`,
        imageRendering: "pixelated",
      }}
    >
      {/* Tiles */}
      {state.board.flatMap((row, r) =>
        row.map((tile, c) => (
          <Tile
            key={`t-${r}-${c}`}
            tile={tile}
            row={r}
            col={c}
            x={12 + c * 32}
            y={24 + r * 32}
            onClick={onTileClick}
          />
        )),
      )}

      {/* Row info digits */}
      {state.rowHints.map((h, r) => (
        <RowInfoDigits key={`rh-${r}`} hint={h} r={r} />
      ))}

      {/* Col info digits */}
      {state.colHints.map((h, c) => (
        <ColInfoDigits key={`ch-${c}`} hint={h} c={c} />
      ))}

      {/* Memo UI (button + panel + copy) */}
      <MemoControls
        memoOpen={state.phase === "memo"}
        copyMode={state.memoCopyMode}
        selectedMemos={selectedMemos}
        onToggle={onMemoToggle}
        onMarkChange={onMarkChange}
        onToggleCopy={onToggleCopy}
      />
    </div>
  );
}
