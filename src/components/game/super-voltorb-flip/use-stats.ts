"use client";
import { useCallback, useState } from "react";
import {
  EMPTY_STATS,
  loadStats,
  recordRound,
  saveStats,
  type RoundRecord,
  type Stats,
} from "./stats";

/**
 * Local statistics. `enabled` is the settings toggle: while it is off nothing
 * is recorded or written (turning it back on resumes from what was saved).
 */
export function useStats(enabled: boolean) {
  const [stats, setStats] = useState<Stats>(() =>
    typeof window === "undefined" ? structuredClone(EMPTY_STATS) : loadStats(),
  );

  const commit = useCallback((update: (prev: Stats) => Stats) => {
    setStats((prev) => {
      const next = update(prev);
      saveStats(next);
      return next;
    });
  }, []);

  const record = useCallback(
    (round: RoundRecord) => {
      if (!enabled) return;
      commit((prev) => recordRound(prev, round));
    },
    [enabled, commit],
  );

  const reset = useCallback(() => commit(() => structuredClone(EMPTY_STATS)), [commit]);

  return { stats, record, reset, commit };
}
