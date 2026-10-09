import { useState } from "react";

/** The polite live region repeats the pace at most this often, in ms. */
export const ANNOUNCE_MS = 5000;

/** "+12 ahead", "-5 behind", or "level" when the ghost is exactly alongside. */
export function paceLabel(delta: number): string {
  const n = Math.round(delta);
  if (n > 0) return `+${n} ahead`;
  if (n < 0) return `${n} behind`;
  return "level";
}

/**
 * Where you stand against the ghost, in characters. The pill is decoration and follows every
 * tick; the screen-reader text next to it changes at most once per ANNOUNCE_MS. `at` is the
 * run clock (ms) the delta was taken at. `floating` lays the pill over the live slot instead of
 * into a row.
 */
export function GhostChip({
  delta,
  at,
  floating,
}: {
  delta: number;
  at: number;
  floating: boolean;
}) {
  const label = paceLabel(delta);
  const [said, setSaid] = useState<{ text: string; at: number } | null>(null);
  if (said === null || (label !== said.text && at - said.at >= ANNOUNCE_MS)) {
    setSaid({ text: label, at });
  }
  const n = Math.round(delta);
  const tone = n > 0 ? "text-accent-green" : n < 0 ? "text-accent-amber" : "text-(--muted)";
  const place = floating ? "absolute top-0 left-0 z-10" : "";
  return (
    <>
      <span
        data-testid="ts-ghost-chip"
        aria-hidden="true"
        className={[
          "pointer-events-none rounded-full bg-(--card) px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
          tone,
          place,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {label}
      </span>
      <span role="status" aria-live="polite" data-testid="ts-ghost-live" className="sr-only">
        {said ? `Ghost: ${said.text}` : ""}
      </span>
    </>
  );
}
