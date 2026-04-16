"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { generateBoard, computeHints, applyDrop } from "./board";
import { deduceAll } from "./auto-memo";
import { THEMES } from "./theme";
import type {
  GameMode,
  GameState,
  WeatherKind,
  TimeOfDay,
  Tile,
  MemoMarks,
  ThemeId,
} from "./types";
import { INITIAL_STATS } from "./types";

const WEATHERS: WeatherKind[] = ["clear", "sunny", "rainy", "snow", "sandstorm", "fog"];

export function pickWeather(rng: () => number = Math.random): WeatherKind {
  // 1 in 5 rolls; majority "clear" for subtlety
  if (rng() < 0.7) return "clear";
  return WEATHERS[1 + Math.floor(rng() * (WEATHERS.length - 1))];
}

export function getTimeOfDay(now: Date = new Date()): TimeOfDay {
  const h = now.getHours();
  if (h >= 6 && h < 10) return "morning";
  if (h >= 10 && h < 17) return "day";
  if (h >= 17 && h < 20) return "evening";
  return "night";
}

export type GameAction =
  | { type: "flip"; row: number; col: number }
  | { type: "advanceAnim"; step: number }
  | { type: "toggleMemo" }
  | { type: "selectMemoTile"; row: number; col: number }
  | { type: "toggleMemoMark"; idx: 0 | 1 | 2 | 3 }
  | { type: "toggleMemoCopy" }
  | { type: "armShield" }
  | { type: "useVoltorbReveal" }
  | { type: "cashOut" }
  | { type: "continue" }
  | { type: "setTheme"; theme: ThemeId }
  | { type: "unlockTheme"; theme: ThemeId }
  | { type: "toggleAutoMemo" }
  | { type: "toggleSpeed" };

export type UseGameOptions = {
  mode: GameMode;
  initialTheme: ThemeId;
  unlockedThemes: ThemeId[];
  autoMemoEnabled: boolean;
  speedMode: boolean;
  totalCoins: number;
  initialStats?: GameState["stats"];
  onPersist: (patch: {
    totalCoins?: number;
    activeTheme?: ThemeId;
    unlockedThemes?: ThemeId[];
    autoMemoEnabled?: boolean;
    speedMode?: boolean;
    musicVolume?: number;
    sfxVolume?: number;
    stats?: GameState["stats"];
  }) => void;
};

export function useGame(opts: UseGameOptions) {
  const [state, setState] = useState<GameState>(() => {
    const { board, maxCoins, twos, threes } = generateBoard(1);
    const { rowHints, colHints } = computeHints(board);
    return {
      mode: opts.mode,
      phase: "ready",
      level: 1,
      board,
      rowHints,
      colHints,
      currentCoins: 0,
      totalCoins: opts.totalCoins,
      maxCoins,
      activeTheme: opts.initialTheme,
      unlockedThemes: new Set(opts.unlockedThemes),
      autoMemoEnabled: opts.autoMemoEnabled,
      speedMode: opts.speedMode,
      weather: pickWeather(),
      timeOfDay: getTimeOfDay(),
      shieldArmed: false,
      shieldedLoss: false,
      voltorbRevealsUsed: 0,
      successfulFlipsThisRound: 0,
      requiredFlipsThisRound: twos + threes,
      selectedMemoTile: null,
      memoCopyMode: false,
      stats: opts.initialStats ?? { ...INITIAL_STATS },
    };
  });

  // Auto-memo refresh when toggle is on
  useEffect(() => {
    if (!state.autoMemoEnabled) return;
    if (state.phase !== "playing" && state.phase !== "ready" && state.phase !== "memo") return;
    setState((prev) => {
      if (!prev.autoMemoEnabled) return prev;
      const deduced = deduceAll(prev.board, prev.rowHints, prev.colHints);
      const newBoard: Tile[][] = prev.board.map((row, r) =>
        row.map((t, c) => (t.flipped ? t : { ...t, memos: deduced[r][c] })),
      );
      return { ...prev, board: newBoard };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.autoMemoEnabled, state.level]);

  const dispatch = useCallback(
    (action: GameAction) => {
      setState((s) => applyAction(s, action, opts));
    },
    [opts],
  );

  return useMemo(() => ({ state, dispatch }), [state, dispatch]);
}

/**
 * Pure reducer for game actions. Only handles a subset in Task 12;
 * later tasks extend with flip, abilities, continue, advanceAnim cases.
 */
export function applyAction(
  s: GameState,
  a: GameAction,
  opts: UseGameOptions,
): GameState {
  switch (a.type) {
    case "toggleMemo":
      if (s.phase === "playing") return { ...s, phase: "memo" };
      if (s.phase === "memo") return { ...s, phase: "playing" };
      return s;

    case "selectMemoTile": {
      if (s.phase !== "memo") return s;
      const tile = s.board[a.row][a.col];
      if (tile.flipped) return s;
      let board = s.board;
      if (s.memoCopyMode && s.selectedMemoTile) {
        const src = s.board[s.selectedMemoTile.row][s.selectedMemoTile.col];
        board = s.board.map((row, r) =>
          row.map((t, c) =>
            r === a.row && c === a.col && !t.flipped
              ? { ...t, memos: src.memos }
              : t,
          ),
        );
      }
      return { ...s, board, selectedMemoTile: { row: a.row, col: a.col } };
    }

    case "toggleMemoMark": {
      if (s.phase !== "memo" || !s.selectedMemoTile) return s;
      const { row, col } = s.selectedMemoTile;
      const current = s.board[row][col].memos;
      const memos = [
        a.idx === 0 ? !current[0] : current[0],
        a.idx === 1 ? !current[1] : current[1],
        a.idx === 2 ? !current[2] : current[2],
        a.idx === 3 ? !current[3] : current[3],
      ] as const as MemoMarks;
      const board = s.board.map((r, ri) =>
        r.map((t, ci) => (ri === row && ci === col ? { ...t, memos } : t)),
      );
      return { ...s, board };
    }

    case "toggleMemoCopy":
      return { ...s, memoCopyMode: !s.memoCopyMode };

    case "toggleAutoMemo":
      opts.onPersist({ autoMemoEnabled: !s.autoMemoEnabled });
      return { ...s, autoMemoEnabled: !s.autoMemoEnabled };

    case "toggleSpeed":
      opts.onPersist({ speedMode: !s.speedMode });
      return { ...s, speedMode: !s.speedMode };

    case "setTheme":
      opts.onPersist({ activeTheme: a.theme });
      return { ...s, activeTheme: a.theme };

    case "unlockTheme": {
      const themeDef = THEMES[a.theme];
      if (s.unlockedThemes.has(a.theme)) {
        opts.onPersist({ activeTheme: a.theme });
        return { ...s, activeTheme: a.theme };
      }
      if (s.totalCoins < themeDef.cost) return s;
      const unlocked = new Set(s.unlockedThemes);
      unlocked.add(a.theme);
      const newTotal = s.totalCoins - themeDef.cost;
      opts.onPersist({
        totalCoins: newTotal,
        unlockedThemes: Array.from(unlocked),
        activeTheme: a.theme,
      });
      return { ...s, totalCoins: newTotal, unlockedThemes: unlocked, activeTheme: a.theme };
    }

    case "flip": {
      if (s.phase !== "playing" && s.phase !== "ready") return s;
      const tile = s.board[a.row][a.col];
      if (tile.flipped) return s;

      const board = s.board.map((row, r) =>
        row.map((t, c) =>
          r === a.row && c === a.col
            ? { ...t, flipped: true, animFrame: 0 }
            : t,
        ),
      );

      const newSuccessful = tile.value === 0
        ? s.successfulFlipsThisRound
        : s.successfulFlipsThisRound + 1;
      const nextCoins = tile.value === 0
        ? s.currentCoins
        : (s.currentCoins === 0 ? tile.value : s.currentCoins * tile.value);

      // Win check
      if (tile.value !== 0 && nextCoins === s.maxCoins) {
        return {
          ...s, board, phase: "won",
          currentCoins: nextCoins,
          successfulFlipsThisRound: newSuccessful,
        };
      }

      // Voltorb hit
      if (tile.value === 0) {
        if (s.mode === "super" && s.shieldArmed) {
          return {
            ...s, board, phase: "lost",
            shieldedLoss: true, shieldArmed: false,
            currentCoins: nextCoins,
            successfulFlipsThisRound: newSuccessful,
          };
        }
        return {
          ...s, board, phase: "lost",
          currentCoins: 0,
          successfulFlipsThisRound: newSuccessful,
        };
      }

      return {
        ...s, board, phase: "playing",
        currentCoins: nextCoins,
        successfulFlipsThisRound: newSuccessful,
      };
    }

    case "advanceAnim": {
      const board = s.board.map((row) =>
        row.map((t) => {
          if (t.animFrame === null) return t;
          const next = t.animFrame + a.step;
          // Voltorbs animate longer for the explosion (Task 17)
          const limit = t.value === 0 ? 82 : 19;
          if (next > limit) return { ...t, animFrame: null };
          return { ...t, animFrame: next };
        }),
      );
      return { ...s, board };
    }

    default:
      // armShield, useVoltorbReveal, cashOut, continue
      // are added in later tasks (18, 20).
      return s;
  }
}

// applyDrop re-exported for convenience in later tasks
export { applyDrop };
