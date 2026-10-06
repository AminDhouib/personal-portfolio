"use client";

import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

/** Milliseconds from `now` to the next 00:00 UTC (a whole day at exactly midnight). */
export function msUntilUtcMidnight(now: Date): number {
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return nextMidnight - now.getTime();
}

/** "Resets in 5h 12m", or "Resets in 42m" under an hour. Rounds a partial minute up. */
export function formatResetCountdown(ms: number): string {
  const minutes = Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 60_000) : 0;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `Resets in ${hours}h ${rest}m` : `Resets in ${rest}m`;
}

function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, TICK_MS);
  return () => clearInterval(id);
}

function getSnapshot(): string {
  return formatResetCountdown(msUntilUtcMidnight(new Date()));
}

// The server cannot know the visitor's clock, so it renders nothing time-dependent and
// the caller falls back to a static "Resets at 00:00 UTC". React swaps in the client
// value after hydration without a mismatch (the same pattern as WebGLOnly).
function getServerSnapshot(): null {
  return null;
}

/** The live countdown string, or null on the server and during hydration. */
export function useResetCountdown(): string | null {
  return useSyncExternalStore<string | null>(subscribe, getSnapshot, getServerSnapshot);
}
