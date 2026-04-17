"use client";

import type { Tile as TileData, ThemeId } from "../types";
import { themedAsset } from "../theme";
import { Explosion } from "./Explosion";

const ASSETS = "/games/super-voltorb-flip/sprites";

const PIXEL: React.CSSProperties = {
  imageRendering: "pixelated",
  display: "block",
  userSelect: "none",
  pointerEvents: "none",
};

function valueSprite(value: number): string {
  return value === 0
    ? `${ASSETS}/tile/voltorb.png`
    : `${ASSETS}/tile/${value}.png`;
}

/**
 * Tile rendering with a CSS 3D flip instead of the original frame-swap
 * animation. The two faces (blank front, value back) live on the same
 * preserve-3d wrapper which rotates 180° around the Y axis when the tile
 * is flipped. This gives smooth, GPU-accelerated rotation that any
 * consumer can re-time by changing one transition duration.
 *
 * The Explosion overlay is layered on top for voltorbs in their
 * explosion-animation window, fully decoupled from the flip itself.
 */
export function Tile({
  tile,
  row,
  col,
  x,
  y,
  onClick,
  themeId,
}: {
  tile: TileData;
  row: number;
  col: number;
  x: number;
  y: number;
  onClick: (row: number, col: number) => void;
  themeId: ThemeId;
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
        perspective: "180px",
      }}
    >
      <div
        style={{
          position: "relative",
          width: 22,
          height: 22,
          transformStyle: "preserve-3d",
          transform: tile.flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          transition: "transform 320ms cubic-bezier(0.4, 0.0, 0.2, 1)",
        }}
      >
        {/* Front face: blank tile (per-theme tinted) */}
        <img
          src={themedAsset(themeId, "tile/blank.png")}
          alt=""
          draggable={false}
          style={{
            ...PIXEL,
            position: "absolute",
            inset: 0,
            width: 22,
            height: 22,
            backfaceVisibility: "hidden",
          }}
        />
        {/* Back face: revealed value */}
        <img
          src={valueSprite(tile.value)}
          alt=""
          draggable={false}
          style={{
            ...PIXEL,
            position: "absolute",
            inset: 0,
            width: 22,
            height: 22,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        />
      </div>

      {/* Memo markers — render on the front face only (when not flipped) */}
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

      {/* Explosion is its own overlay on top of the flipped voltorb */}
      {tile.value === 0 && tile.flipped && tile.animFrame !== null && (
        <Explosion animFrame={tile.animFrame} />
      )}
    </button>
  );
}
