"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_LEVEL } from "./hgss";
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
  // The object last read or written: a changed object is a change to persist.
  const persistedRef = useRef(stats);

  useEffect(() => {
    if (stats === persistedRef.current) return;
    persistedRef.current = stats;
    saveStats(stats);
  }, [stats]);

  const record = useCallback(
    (round: RoundRecord) => {
      if (!enabled) return;
      setStats((prev) => recordRound(prev, round));
    },
    [enabled],
  );

  /** Lifts highestLevel to the loaded save's level; never lowers it, never writes svf:progress. */
  const raiseHighestLevel = useCallback(
    (level: number) => {
      if (!enabled) return;
      const next = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
      setStats((prev) => (next > prev.highestLevel ? { ...prev, highestLevel: next } : prev));
    },
    [enabled],
  );

  const reset = useCallback(() => setStats(structuredClone(EMPTY_STATS)), []);

  return { stats, record, reset, raiseHighestLevel };
}
