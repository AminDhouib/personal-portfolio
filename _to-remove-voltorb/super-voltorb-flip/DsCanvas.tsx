"use client";

import { Header, HEADER_HEIGHT } from "./chrome/Header";
import { Legend, LEGEND_HEIGHT } from "./chrome/Legend";
import { VoltorbMessage, VOLTORB_MESSAGE_HEIGHT } from "./chrome/VoltorbMessage";
import { TotalScoreboard, SCOREBOARD_HEIGHT } from "./chrome/TotalScoreboard";
import { CurrentScoreboard } from "./chrome/CurrentScoreboard";
import { BoardSection, BOARD_SECTION_HEIGHT } from "./chrome/BoardSection";
import { THEMES } from "./theme";
import type { GameState, MemoMarks } from "./types";

const CANVAS_W = 262;
const CANVAS_H =
  HEADER_HEIGHT +
  LEGEND_HEIGHT +
  VOLTORB_MESSAGE_HEIGHT +
  SCOREBOARD_HEIGHT * 2 +
  BOARD_SECTION_HEIGHT;

// Compile-time sanity check: the stacked heights must equal the original canvas.
// Original background.png is 262x399, so sum must equal 399.
if (CANVAS_H !== 399 && typeof console !== "undefined") {
  console.warn(
    `DsCanvas height ${CANVAS_H} does not match the original 399 — chrome slices may be misaligned`,
  );
}

/**
 * Composes the DS Game Corner screen from modular chrome components.
 * Each row owns its own sliced asset under sprites/chrome/ and can be
 * re-skinned or replaced independently.
 */
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
  const theme = THEMES[state.activeTheme];
  const labels = theme.labels;
  const themeId = state.activeTheme;
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
          display: "flex",
          flexDirection: "column",
          imageRendering: "pixelated",
        }}
      >
        <Header
          level={state.level}
          title={labels.headerTitle}
          subtitle={labels.headerSubtitle}
          themeId={themeId}
        />
        <Legend multipliers={labels.legendMultipliers} themeId={themeId} />
        <VoltorbMessage message={labels.voltorbMessage} themeId={themeId} />
        <TotalScoreboard
          value={state.totalCoins}
          label={labels.totalScoreboard}
          themeId={themeId}
        />
        <CurrentScoreboard
          value={state.currentCoins}
          label={labels.currentScoreboard}
          themeId={themeId}
        />
        <BoardSection
          state={state}
          onTileClick={onTileClick}
          onMemoToggle={onMemoToggle}
          onMarkChange={onMarkChange}
          onToggleCopy={onToggleCopy}
          themeId={themeId}
        />
      </div>
    </div>
  );
}

export type { MemoMarks };
