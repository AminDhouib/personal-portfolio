"use client";

import { useState } from "react";
import { clampBoardSize, parseBoardSize } from "./play-rules";
import { VoltorbFlip, cloneGame } from "./engine";

// ---------------------------------------------------------------------------
// src/hooks/useGame.tsx (1:1, with cloneGame replacing lodash's cloneDeep).
// ---------------------------------------------------------------------------

function initialGameSize() {
  // `?size=N` (N in 2..10) creates a non-default board for layout testing.
  // Game logic is scaled proportionally but authored for 5x5 — use at your
  // own risk for "real" play.
  if (typeof window === "undefined") return 5;
  return parseBoardSize(window.location.search);
}

export const useGame = () => {
  const [size, setSize] = useState(initialGameSize);
  const [game, setGame] = useState<VoltorbFlip>(() => new VoltorbFlip(size));

  function updateGame(callback: (game: VoltorbFlip) => void): void {
    if (!game) return;
    const newGame = cloneGame(game);
    callback(newGame);
    setGame(newGame);
  }

  function setGameSize(n: number) {
    const clamped = clampBoardSize(n);
    setSize(clamped);
    setGame(new VoltorbFlip(clamped));
  }

  return { game, updateGame, size, setGameSize };
};
