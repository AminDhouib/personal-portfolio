"use client";

import type { Tile as TileData } from "../types";
import { Explosion } from "./Explosion";

const ASSETS = "/games/super-voltorb-flip/sprites";

const PIXEL: React.CSSProperties = {
  imageRendering: "pixelated",
  display: "block",
  userSelect: "none",
  pointerEvents: "none",
};

/**
 * Map a Tile's current flipped/animFrame state to its underlying sprite URL.
 * Explosion (for voltorbs in animFrame >= 19) is layered as a separate
 * Explosion component so the revealed voltorb sprite remains visible
 * underneath the explosion cloud.
 *
 * Frame phases:
 *   not flipped: blank
 *   0-5:  pressed-blank (just clicked)
 *   6-11: flip phase 0 (sprite squeezing)
 *   12-17: flip phase 1 (sprite turned)
 *   18:   mid-flip reveal (value-specific edge-on sprite)
 *   19+:  fully settled value sprite (Explosion layer handles the cloud)
 */
function tileSprite(tile: TileData): string {
  if (!tile.flipped) return `${ASSETS}/tile/blank.png`;
  const f = tile.animFrame;
  if (f === null) {
    return tile.value === 0
      ? `${ASSETS}/tile/voltorb.png`
      : `${ASSETS}/tile/${tile.value}.png`;
  }
  if (f < 6) return `${ASSETS}/tile/blank.png`;
  if (f < 12) return `${ASSETS}/tile/flip_0.png`;
  if (f < 18) return `${ASSETS}/tile/flip_1.png`;
  if (f === 18) {
    return tile.value === 0
      ? `${ASSETS}/tile/voltorb_flip.png`
      : `${ASSETS}/tile/${tile.value}_flip.png`;
  }
  // 19+: settled tile face. The Explosion overlay (rendered separately)
  // animates on top for voltorbs.
  return tile.value === 0
    ? `${ASSETS}/tile/voltorb.png`
    : `${ASSETS}/tile/${tile.value}.png`;
}

export function Tile({
  tile,
  row,
  col,
  x,
  y,
  onClick,
}: {
  tile: TileData;
  row: number;
  col: number;
  x: number;
  y: number;
  onClick: (row: number, col: number) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(row, col)}
      aria-label={`Tile row ${row} col ${col}${
        tile.flipped
          ? ` (revealed: ${tile.value === 0 ? "Voltorb" : tile.value})`
          : ""
      }`}
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 22,
        height: 22,
        border: 0,
        padding: 0,
        background: "transparent",
        cursor: tile.flipped ? "default" : "pointer",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tileSprite(tile)}
        alt=""
        draggable={false}
        style={{ ...PIXEL, width: 22, height: 22 }}
      />
      {!tile.flipped && tile.memos.some(Boolean) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateRows: "1fr 1fr",
            pointerEvents: "none",
          }}
        >
          {tile.memos.map((on, i) =>
            on ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={`${ASSETS}/tile/memo_${i}.png`}
                alt=""
                draggable={false}
                style={{ ...PIXEL, width: 10, height: 10 }}
              />
            ) : (
              <div key={i} />
            ),
          )}
        </div>
      )}
      {tile.value === 0 && tile.flipped && tile.animFrame !== null && (
        <Explosion animFrame={tile.animFrame} />
      )}
    </button>
  );
}
