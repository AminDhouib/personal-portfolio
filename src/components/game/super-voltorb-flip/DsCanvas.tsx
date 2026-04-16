"use client";

import type { GameState, Tile, MemoMarks } from "./types";

const ASSETS = "/games/super-voltorb-flip/sprites";
const CANVAS_W = 262;
const CANVAS_H = 399;

function tileSprite(tile: Tile): string {
  if (!tile.flipped) return `${ASSETS}/tile/blank.png`;
  const f = tile.animFrame;
  if (f === null) {
    if (tile.value === 0) return `${ASSETS}/tile/voltorb.png`;
    return `${ASSETS}/tile/${tile.value}.png`;
  }
  if (f < 6) return `${ASSETS}/tile/blank.png`;
  if (f < 12) return `${ASSETS}/tile/flip_0.png`;
  if (f < 18) return `${ASSETS}/tile/flip_1.png`;
  if (f === 18) {
    return tile.value === 0
      ? `${ASSETS}/tile/voltorb_flip.png`
      : `${ASSETS}/tile/${tile.value}_flip.png`;
  }
  if (tile.value !== 0) return `${ASSETS}/tile/${tile.value}.png`;
  const explodeFrame = Math.min(8, Math.floor((f - 19) / 7));
  return `${ASSETS}/tile/explode_${explodeFrame}.png`;
}

const PIXEL_STYLE: React.CSSProperties = {
  imageRendering: "pixelated",
  display: "block",
  userSelect: "none",
  pointerEvents: "none",
};

export function DsCanvas({
  state,
  scale = 2,
  onTileClick,
  onMemoToggle,
  onMarkChange,
  onToggleCopy,
}: {
  state: GameState;
  scale?: number;
  onTileClick: (row: number, col: number) => void;
  onMemoToggle: () => void;
  onMarkChange: (idx: 0 | 1 | 2 | 3) => void;
  onToggleCopy: () => void;
}) {
  const levelIdx = Math.max(1, Math.min(8, state.level));
  const selectedMemos: MemoMarks = state.selectedMemoTile
    ? state.board[state.selectedMemoTile.row][state.selectedMemoTile.col].memos
    : [false, false, false, false];

  return (
    <div
      style={{
        width: CANVAS_W * scale,
        height: CANVAS_H * scale,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          position: "relative",
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          backgroundImage: `url(${ASSETS}/background.png)`,
          imageRendering: "pixelated",
        }}
      >
        {/* Level number */}
        <img
          src={`${ASSETS}/number/thin_${levelIdx}.png`}
          alt=""
          draggable={false}
          style={{ ...PIXEL_STYLE, position: "absolute", left: 173, top: 11 }}
        />

        {/* Total scoreboard (5 digits, right-aligned) */}
        {[4, 3, 2, 1, 0].map((i) => {
          const digit = Math.floor(state.totalCoins / Math.pow(10, i)) % 10;
          return (
            <img
              key={`t-${i}`}
              src={`${ASSETS}/number/big_${digit}.png`}
              alt=""
              draggable={false}
              style={{
                ...PIXEL_STYLE,
                position: "absolute",
                left: 236 - 16 * i,
                top: 117,
              }}
            />
          );
        })}

        {/* Current-round scoreboard */}
        {[4, 3, 2, 1, 0].map((i) => {
          const digit = Math.floor(state.currentCoins / Math.pow(10, i)) % 10;
          return (
            <img
              key={`c-${i}`}
              src={`${ASSETS}/number/big_${digit}.png`}
              alt=""
              draggable={false}
              style={{
                ...PIXEL_STYLE,
                position: "absolute",
                left: 236 - 16 * i,
                top: 157,
              }}
            />
          );
        })}

        {/* Tiles (5x5 at fixed pixel positions) */}
        {state.board.flatMap((row, r) =>
          row.map((tile, c) => {
            const x = 12 + c * 32;
            const y = 204 + r * 32;
            return (
              <button
                key={`tile-${r}-${c}`}
                type="button"
                onClick={() => onTileClick(r, c)}
                aria-label={`Tile row ${r} col ${c}${
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
                <img
                  src={tileSprite(tile)}
                  alt=""
                  draggable={false}
                  style={{ ...PIXEL_STYLE, width: 22, height: 22 }}
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
                        <img
                          key={i}
                          src={`${ASSETS}/tile/memo_${i}.png`}
                          alt=""
                          draggable={false}
                          style={{
                            ...PIXEL_STYLE,
                            width: 10,
                            height: 10,
                          }}
                        />
                      ) : (
                        <div key={i} />
                      ),
                    )}
                  </div>
                )}
              </button>
            );
          }),
        )}

        {/* Row info digits */}
        {state.rowHints.map((h, r) => {
          const tens = Math.floor(h.points / 10);
          const ones = h.points % 10;
          return (
            <div key={`rh-${r}`}>
              <img
                src={`${ASSETS}/number/bold_${tens}.png`}
                alt=""
                draggable={false}
                style={{
                  ...PIXEL_STYLE,
                  position: "absolute",
                  left: 180,
                  top: 203 + 32 * r,
                }}
              />
              <img
                src={`${ASSETS}/number/bold_${ones}.png`}
                alt=""
                draggable={false}
                style={{
                  ...PIXEL_STYLE,
                  position: "absolute",
                  left: 188,
                  top: 203 + 32 * r,
                }}
              />
              <img
                src={`${ASSETS}/number/bold_${h.voltorbs}.png`}
                alt=""
                draggable={false}
                style={{
                  ...PIXEL_STYLE,
                  position: "absolute",
                  left: 188,
                  top: 216 + 32 * r,
                }}
              />
            </div>
          );
        })}

        {/* Column info digits */}
        {state.colHints.map((h, c) => {
          const tens = Math.floor(h.points / 10);
          const ones = h.points % 10;
          return (
            <div key={`ch-${c}`}>
              <img
                src={`${ASSETS}/number/bold_${tens}.png`}
                alt=""
                draggable={false}
                style={{
                  ...PIXEL_STYLE,
                  position: "absolute",
                  left: 20 + 32 * c,
                  top: 363,
                }}
              />
              <img
                src={`${ASSETS}/number/bold_${ones}.png`}
                alt=""
                draggable={false}
                style={{
                  ...PIXEL_STYLE,
                  position: "absolute",
                  left: 28 + 32 * c,
                  top: 363,
                }}
              />
              <img
                src={`${ASSETS}/number/bold_${h.voltorbs}.png`}
                alt=""
                draggable={false}
                style={{
                  ...PIXEL_STYLE,
                  position: "absolute",
                  left: 28 + 32 * c,
                  top: 376,
                }}
              />
            </div>
          );
        })}

        {/* Memo button (always visible) */}
        <button
          type="button"
          onClick={onMemoToggle}
          aria-label={state.phase === "memo" ? "Close Memo" : "Open Memo"}
          style={{
            position: "absolute",
            left: 200,
            top: 204,
            border: 0,
            padding: 0,
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <img
            src={`${ASSETS}/button/memo/${state.phase === "memo" ? "close" : "open"}.png`}
            alt=""
            draggable={false}
            style={PIXEL_STYLE}
          />
        </button>

        {/* Memo panel (frame + marks + copy) when open */}
        {state.phase === "memo" && (
          <>
            <img
              src={`${ASSETS}/memo/frame.png`}
              alt=""
              draggable={false}
              style={{
                ...PIXEL_STYLE,
                position: "absolute",
                left: 200,
                top: 272,
              }}
            />
            {([0, 1, 2, 3] as const).map((i) => {
              const x = 200 + 3 + (i % 2) * 24;
              const y = 204 + 71 + Math.floor(i / 2) * 24;
              const on = selectedMemos[i];
              return (
                <button
                  key={`mm-${i}`}
                  type="button"
                  onClick={() => onMarkChange(i)}
                  aria-label={`Memo ${i === 0 ? "voltorb" : i}`}
                  style={{
                    position: "absolute",
                    left: x,
                    top: y,
                    border: 0,
                    padding: 0,
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <img
                    src={`${ASSETS}/button/memo/${i}_${on ? "on" : "off"}.png`}
                    alt=""
                    draggable={false}
                    style={PIXEL_STYLE}
                  />
                </button>
              );
            })}
            <button
              type="button"
              onClick={onToggleCopy}
              aria-label="Toggle memo copy mode"
              style={{
                position: "absolute",
                left: 227,
                top: 323,
                border: 0,
                padding: 0,
                background: "transparent",
                cursor: "pointer",
              }}
            >
              <img
                src={`${ASSETS}/button/memo/s_${state.memoCopyMode ? "on" : "off"}.png`}
                alt=""
                draggable={false}
                style={PIXEL_STYLE}
              />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
