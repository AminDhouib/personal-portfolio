"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "./modal-shell";
import type { Stats } from "./stats";

function duration(seconds: number): string {
  if (seconds <= 0) return "0s";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-200 py-1">
      <dt className="text-gray-600">{label}</dt>
      <dd className="text-lg tabular-nums">{value}</dd>
    </div>
  );
}

export function StatsPanel({
  stats,
  onReset,
  onClose,
}: {
  stats: Stats;
  onReset: () => void;
  onClose: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const resetRef = useRef<HTMLButtonElement | null>(null);
  const keepRef = useRef<HTMLButtonElement | null>(null);
  const swappedRef = useRef(false);
  // The focused button unmounts on each swap: hand focus to the one that
  // replaces it, so Tab never falls out of the dialog.
  useEffect(() => {
    if (confirming) {
      swappedRef.current = true;
      keepRef.current?.focus();
    } else if (swappedRef.current) {
      resetRef.current?.focus();
    }
  }, [confirming]);
  const n = (x: number) => x.toLocaleString("en-US");
  // Rows for features that do not exist yet (the odds assist, the Daily board)
  // stay hidden until they have something to show.
  const showAssisted = stats.assistedRounds > 0;
  const showDaily = stats.dailyPlayed > 0 || stats.streak.current > 0 || stats.streak.best > 0;
  return (
    <ModalShell title="Statistics" onClose={onClose}>
      <p className="text-sm text-gray-500">
        {showAssisted
          ? "Kept on this device only. Rounds played with the odds assist on are counted as played and nothing else."
          : "Kept on this device only."}
      </p>
      <dl>
        <Line label="Rounds played" value={n(stats.rounds.played)} />
        <Line label="Won" value={n(stats.rounds.won)} />
        <Line label="Lost" value={n(stats.rounds.lost)} />
        <Line label="Quit" value={n(stats.rounds.quit)} />
        {showAssisted && <Line label="Assisted rounds" value={n(stats.assistedRounds)} />}
        <Line label="Coins banked" value={n(stats.coins.total)} />
        <Line label="Best round" value={n(stats.coins.best)} />
        <Line label="Highest level" value={String(stats.highestLevel)} />
        <Line label="Time at Lv.8" value={duration(stats.lv8Seconds)} />
        {showDaily && <Line label="Daily boards played" value={n(stats.dailyPlayed)} />}
        {showDaily && <Line label="Daily streak" value={n(stats.streak.current)} />}
        {showDaily && <Line label="Best daily streak" value={n(stats.streak.best)} />}
      </dl>
      {confirming ? (
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 text-sm">Wipe all of this?</p>
          <button
            type="button"
            onClick={() => {
              onReset();
              setConfirming(false);
            }}
            className="min-h-11 rounded-[6px] border-2 border-gray-300 bg-white px-3 text-sm font-bold text-[#b3261e] outline outline-2 outline-gray-600"
          >
            Yes, reset
          </button>
          <button
            ref={keepRef}
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-11 rounded-[6px] border-2 border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 outline outline-2 outline-gray-600"
          >
            Keep it
          </button>
        </div>
      ) : (
        <button
          ref={resetRef}
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Reset statistics"
          className="min-h-11 self-start rounded-[6px] border-2 border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 outline outline-2 outline-gray-600"
        >
          Reset
        </button>
      )}
    </ModalShell>
  );
}
