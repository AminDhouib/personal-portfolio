import { useState } from "react";
import type { KeyStats } from "./engine/series";

const ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", ",.;:'\"!?-"];
const TOP_MISSED = 5;

/** 0 with no misses, then 1-4 at miss rates up to 2%, 5%, 10% and above. */
export function missTier(hits: number, misses: number): 0 | 1 | 2 | 3 | 4 {
  if (misses <= 0) return 0;
  const rate = misses / (hits + misses);
  if (rate <= 0.02) return 1;
  if (rate <= 0.05) return 2;
  if (rate <= 0.1) return 3;
  return 4;
}

const TIER_CLASS = [
  "border-(--border) bg-(--card) text-(--foreground)",
  "border-amber-400/40 bg-amber-400/15 text-(--foreground)",
  "border-amber-500/60 bg-amber-500/30 text-(--foreground)",
  "border-red-400/60 bg-red-400/35 text-(--foreground)",
  "border-red-500 bg-red-500/60 text-white",
];

const TAB =
  "inline-flex min-h-11 items-center rounded-lg px-4 font-sans text-sm font-semibold transition-colors";

function Key({ label, stats, wide }: { label: string; stats: KeyStats; wide?: boolean }) {
  const count = stats[label];
  const typed = !!count && count.hits + count.misses > 0;
  const tier = count ? missTier(count.hits, count.misses) : 0;
  return (
    <span
      data-key={label}
      data-tier={tier}
      data-typed={typed}
      className={[
        "inline-flex h-9 items-center justify-center rounded-md border font-mono text-sm uppercase",
        wide ? "w-48 max-w-full" : "w-8 sm:w-9",
        TIER_CLASS[tier],
        typed ? "" : "opacity-40",
      ].join(" ")}
    >
      {label === " " ? "" : label}
    </span>
  );
}

function summary(stats: KeyStats): string {
  const missed = Object.entries(stats)
    .filter(([, v]) => v.misses > 0)
    .sort((a, b) => b[1].misses - a[1].misses)
    .slice(0, TOP_MISSED)
    .map(([k, v]) => `${k === " " ? "space" : k}: ${v.misses} of ${v.hits + v.misses}`);
  return missed.length > 0 ? `Most missed keys: ${missed.join(", ")}.` : "No missed keys.";
}

/** A QWERTY heat map of misses by expected key, for this run or for every run on this device. */
export function KeyMap({ run, all }: { run: KeyStats; all: KeyStats }) {
  const [scope, setScope] = useState<"run" | "all">("run");
  const stats = scope === "run" ? run : all;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(
          [
            ["run", "This run"],
            ["all", "All runs"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={scope === id}
            onClick={() => setScope(id)}
            className={[
              TAB,
              scope === id ? "bg-accent-blue/20 text-accent-blue" : "text-(--muted)",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-col items-center gap-1">
        {ROWS.map((row) => (
          <div key={row} className="flex gap-1">
            {[...row].map((k) => (
              <Key key={k} label={k} stats={stats} />
            ))}
          </div>
        ))}
        <Key label=" " stats={stats} wide />
      </div>
      <p className="sr-only">{summary(stats)}</p>
    </div>
  );
}
