"use client";

import { useEffect, useState } from "react";
import { safeLocalSet } from "@/lib/safe-storage";
import { loadProgress } from "./progress";
import type { VoltorbFlip } from "./engine";

/**
 * The saved level, total score and round history (`svf:progress`): restored once on mount, then
 * written back on every change. Returns `hydrated`, which flips in the same batch as the restored
 * game.
 */
export function useProgressPersistence(
  game: VoltorbFlip,
  updateGame: (callback: (game: VoltorbFlip) => void) => void,
  raiseHighestLevel: (level: number) => void,
): boolean {
  // Restore the saved level + total once on mount. The restore always replaces the game this hook
  // was first given (with no save it is an unchanged copy), and `hydrated` is that replacement
  // having arrived, so it flips in the same render as the restored game. The persist effect below
  // waits for it, so the first render's Lv1/0 defaults can never overwrite a save.
  const [firstGame] = useState(game);
  const hydrated = game !== firstGame;
  useEffect(() => {
    const saved = loadProgress();
    updateGame((g) => {
      if (saved) g.restore(saved.currentLevel, saved.totalScore, saved.history);
    });
    if (saved) {
      // Statistics only mirror the save here; svf:progress is never written from them.
      raiseHighestLevel(saved.currentLevel);
    }
    // Mount-only by design; updateGame is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist level + total score to localStorage on change.
  useEffect(() => {
    if (!game || !hydrated) return;
    if (typeof window === "undefined") return;
    safeLocalSet(
      "svf:progress",
      JSON.stringify({
        currentLevel: game.currentLevel,
        totalScore: game.totalScore,
        history: game.history,
      }),
    );
  }, [game, game?.currentLevel, game?.totalScore, game?.history, hydrated]);

  return hydrated;
}
