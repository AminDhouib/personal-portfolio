"use client";

import type { Tile, LineHint } from "./types";
import { RowInfo, ColInfo } from "./InfoPanel";

const SPRITES = "/games/super-voltorb-flip/sprites/tile";

const TILE_SRC: Record<number, string> = {
  0: `${SPRITES}/voltorb.png`,
  1: `${SPRITES}/1.png`,
  2: `${SPRITES}/2.png`,
  3: `${SPRITES}/3.png`,
};

const BLANK_SRC = `${SPRITES}/blank.png`;
const MEMO_SPRITES = [
  `${SPRITES}/memo_0.png`,
  `${SPRITES}/memo_1.png`,
  `${SPRITES}/memo_2.png`,
  `${SPRITES}/memo_3.png`,
];

export function Board({
  board,
  rowHints,
  colHints,
  onTileClick,
}: {
  board: Tile[][];
  rowHints: LineHint[];
  colHints: LineHint[];
  onTileClick?: (row: number, col: number) => void;
}) {
  const cells: React.ReactNode[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const tile = board[r][c];
      cells.push(
        <button
          key={`t-${r}-${c}`}
          type="button"
          onClick={() => onTileClick?.(r, c)}
          className="relative aspect-square bg-transparent border-0 cursor-pointer p-0"
          aria-label={`Tile row ${r} col ${c}${tile.flipped ? ` (revealed: ${tile.value === 0 ? "Voltorb" : tile.value})` : ""}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={tile.flipped ? TILE_SRC[tile.value] : BLANK_SRC}
            alt=""
            className="w-full h-full select-none"
            style={{ imageRendering: "pixelated" as const }}
            draggable={false}
          />
          {!tile.flipped && tile.memos.some(Boolean) && (
            <div className="absolute inset-0 grid grid-cols-2 gap-0 pointer-events-none">
              {tile.memos.map((on, i) =>
                on ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={i}
                    src={MEMO_SPRITES[i]}
                    alt=""
                    className="w-full h-full"
                    style={{ imageRendering: "pixelated" as const }}
                  />
                ) : (
                  <div key={i} />
                ),
              )}
            </div>
          )}
        </button>,
      );
    }
    cells.push(<RowInfo key={`r-${r}`} hint={rowHints[r]} />);
  }
  for (let c = 0; c < 5; c++) {
    cells.push(<ColInfo key={`c-${c}`} hint={colHints[c]} />);
  }
  cells.push(<div key="corner" />);

  return (
    <div
      className="grid gap-[2px] w-full"
      style={{
        gridTemplateColumns: "repeat(6, 1fr)",
        imageRendering: "pixelated" as const,
      }}
    >
      {cells}
    </div>
  );
}
