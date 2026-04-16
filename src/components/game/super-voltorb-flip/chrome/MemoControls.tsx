"use client";

import type { MemoMarks, ThemeId } from "../types";
import { themedAsset } from "../theme";

const PIXEL: React.CSSProperties = {
  imageRendering: "pixelated",
  display: "block",
  userSelect: "none",
};

/**
 * Memo UI cluster (toggle button + optional expanded mark panel + copy toggle).
 * Coordinates are relative to the board-section slice (y=180 in the original
 * canvas). Original game positions reference this slice:
 *   memo button   (200, 24)   -- original (200, 204)
 *   memo frame    (200, 92)   -- original (200, 272) after full expand
 *   mark buttons  (203/227, 95/119)
 *   copy toggle   (227, 143)  -- original (227, 323)
 */
export function MemoControls({
  memoOpen,
  copyMode,
  selectedMemos,
  onToggle,
  onMarkChange,
  onToggleCopy,
  themeId,
}: {
  memoOpen: boolean;
  copyMode: boolean;
  selectedMemos: MemoMarks;
  onToggle: () => void;
  onMarkChange: (idx: 0 | 1 | 2 | 3) => void;
  onToggleCopy: () => void;
  themeId: ThemeId;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-label={memoOpen ? "Close Memo" : "Open Memo"}
        style={{
          position: "absolute",
          left: 200,
          top: 24,
          border: 0,
          padding: 0,
          background: "transparent",
          cursor: "pointer",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={themedAsset(themeId, `button/memo/${memoOpen ? "close" : "open"}.png`)}
          alt=""
          draggable={false}
          style={PIXEL}
        />
      </button>

      {memoOpen && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={themedAsset(themeId, "memo/frame.png")}
            alt=""
            draggable={false}
            style={{ ...PIXEL, position: "absolute", left: 200, top: 92 }}
          />
          {([0, 1, 2, 3] as const).map((i) => {
            const x = 200 + 3 + (i % 2) * 24;
            const y = 24 + 71 + Math.floor(i / 2) * 24;
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={themedAsset(themeId, `button/memo/${i}_${on ? "on" : "off"}.png`)}
                  alt=""
                  draggable={false}
                  style={PIXEL}
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
              top: 143,
              border: 0,
              padding: 0,
              background: "transparent",
              cursor: "pointer",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={themedAsset(themeId, `button/memo/s_${copyMode ? "on" : "off"}.png`)}
              alt=""
              draggable={false}
              style={PIXEL}
            />
          </button>
        </>
      )}
    </>
  );
}
