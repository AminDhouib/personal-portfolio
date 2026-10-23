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
  // Restore the saved level + total once on mount. The persist effect below
  // waits for `hydrated`, which flips in the same batch as the restored game,
  // so the first render's Lv1/0 defaults can never overwrite a save.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const saved = loadProgress();
    if (saved) {
      updateGame((g) => g.restore(saved.currentLevel, saved.totalScore, saved.history));
      // Statistics only mirror the save here; svf:progress is never written from them.
      raiseHighestLevel(saved.currentLevel);
    }
    setHydrated(true);
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
