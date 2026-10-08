"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EMPTY_STATS, loadStats, saveStats, type TowerStats } from "./stats";

/**
 * The local statistics (`tower:stats`): read once on the client, written whenever a
 * change produces a new object. The game only mounts in the browser (the registry loads
 * it with ssr: false), so reading storage in the initializer cannot mismatch hydration.
 */
export function useTowerStats() {
  const [stats, setStats] = useState<TowerStats>(() =>
    typeof window === "undefined" ? structuredClone(EMPTY_STATS) : loadStats(),
  );
  // The object last read or written: a changed object is a change to persist.
  const persistedRef = useRef(stats);

  useEffect(() => {
    if (stats === persistedRef.current) return;
    persistedRef.current = stats;
    saveStats(stats);
  }, [stats]);

  const update = useCallback((fold: (prev: TowerStats) => TowerStats) => setStats(fold), []);

  return { stats, update };
}
