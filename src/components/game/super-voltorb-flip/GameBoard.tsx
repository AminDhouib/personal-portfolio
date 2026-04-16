"use client";

import type { Tile, LineHint } from "./types";
import { RowInfo, ColInfo } from "./InfoPanel";

const SPRITES = "/games/super-voltorb-flip/sprites/tile";

function tileSprite(tile: Tile): string {
  if (!tile.flipped) return `${SPRITES}/blank.png`;
  const f = tile.animFrame;
  if (f === null || f >= 19) {
    if (tile.value === 0) return `${SPRITES}/voltorb.png`;
    return `${SPRITES}/${tile.value}.png`;
  }
  if (f < 6) return `${SPRITES}/blank.png`;
  if (f < 12) return `${SPRITES}/flip_0.png`;
  if (f < 18) return `${SPRITES}/flip_1.png`;
  if (f === 18) {
    return tile.value === 0
      ? `${SPRITES}/voltorb_flip.png`
      : `${SPRITES}/${tile.value}_flip.png`;
  }
  return tile.value === 0
    ? `${SPRITES}/voltorb.png`
    : `${SPRITES}/${tile.value}.png`;
}

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
            src={tileSprite(tile)}
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
