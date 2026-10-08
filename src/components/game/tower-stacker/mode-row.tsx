"use client";

import { useSyncExternalStore } from "react";
import { formatResetCountdown, msUntilUtcMidnight } from "@/app/games/hub/reset-countdown";
import { utcDayKey } from "@/lib/arcade/boards";

export type TowerMode = "daily" | "free";

const TICK_MS = 30_000;

function subscribe(onTick: () => void): () => void {
  const id = setInterval(onTick, TICK_MS);
  return () => clearInterval(id);
}

function getSnapshot(): string {
  const now = new Date();
  return `${utcDayKey(now)} UTC. ${formatResetCountdown(msUntilUtcMidnight(now))}`;
}

// The server cannot know the visitor's clock, so it renders the static line and React
// swaps in the live one after hydration (the same pattern as the hub's countdown).
function getServerSnapshot(): string {
  return "Resets at 00:00 UTC";
}

const BASE = "min-h-11 min-w-11 flex-1 border px-3 py-2 text-center font-mono transition";
const ON = "border-accent-red/70 bg-accent-red/10 text-foreground";
const OFF = "border-[var(--border)] text-foreground/70 hover:border-accent-red/40";

/**
 * The ready screen's two ways to play. Today's tower is the ranked one (a seed from the
 * UTC day, the same for everyone); Free build is a random or `?tower-seed=` tower that
 * stays on this device. Selecting only chooses: Start begins the run.
 */
export function ModeRow({
  mode,
  seeded = false,
  onChange,
}: {
  mode: TowerMode;
  /** A `?tower-seed=` text picked the free tower, so it is fixed rather than random. */
  seeded?: boolean;
  onChange: (m: TowerMode) => void;
}) {
  const dailyLine = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return (
    <div role="group" aria-label="Mode" className="flex w-full max-w-[19rem] gap-2">
      <button
        type="button"
        aria-pressed={mode === "daily"}
        onClick={() => onChange("daily")}
        className={`${BASE} ${mode === "daily" ? ON : OFF}`}
      >
        <span className="block text-xs font-bold tracking-[0.15em] uppercase">
          Today&apos;s tower
        </span>
        <span className="text-foreground/60 mt-1 block min-h-[2.5em] text-[10px] leading-tight">
          {dailyLine}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={mode === "free"}
        onClick={() => onChange("free")}
        className={`${BASE} ${mode === "free" ? ON : OFF}`}
      >
        <span className="block text-xs font-bold tracking-[0.15em] uppercase">Free build</span>
        <span className="text-foreground/60 mt-1 block min-h-[2.5em] text-[10px] leading-tight">
          {seeded ? "Fixed seed, unranked" : "Random, unranked"}
        </span>
      </button>
    </div>
  );
}
