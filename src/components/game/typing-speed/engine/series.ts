import { runMetrics } from "../metrics";
import type { TypingRun } from "./types";

export interface SeriesPoint {
  /** Cumulative net WPM up to the end of this second. */
  wpm: number;
  /** Raw WPM of this second alone. */
  raw: number;
  /** Incorrect keystrokes in this second. */
  errors: number;
}

export interface KeyCount {
  hits: number;
  misses: number;
}

export type KeyStats = Record<string, KeyCount>;

/**
 * One point per started second of the run. The cumulative figure counts
 * correct keystrokes, so the last point is replaced by the headline net WPM:
 * the graph ends on the number the card shows.
 */
export function wpmSeries(run: TypingRun): SeriesPoint[] {
  const m = runMetrics(run);
  const count = Math.max(1, Math.ceil(m.elapsedMs / 1000));
  const correct = Array.from({ length: count }, () => 0);
  const keys = Array.from({ length: count }, () => 0);
  const errors = Array.from({ length: count }, () => 0);
  for (const k of run.log) {
    if (k.correct === undefined) continue;
    const s = Math.min(count - 1, Math.floor(k.t / 1000));
    keys[s]!++;
    if (k.correct) correct[s]!++;
    else errors[s]!++;
  }
  const points: SeriesPoint[] = [];
  let cumulative = 0;
  for (let s = 0; s < count; s++) {
    cumulative += correct[s]!;
    points.push({ wpm: (cumulative * 12) / (s + 1), raw: keys[s]! * 12, errors: errors[s]! });
  }
  const last = points[count - 1];
  if (last) last.wpm = m.netWpm;
  return points;
}

/** Hits and misses by lowercased expected character; spaces, extras and Backspace are ignored. */
export function keyStats(run: TypingRun): KeyStats {
  const out: KeyStats = {};
  for (const k of run.log) {
    if (k.correct === undefined || !k.expected || k.expected === " ") continue;
    const key = k.expected.toLowerCase();
    const entry = (out[key] ??= { hits: 0, misses: 0 });
    if (k.correct) entry.hits++;
    else entry.misses++;
  }
  return out;
}

export function mergeKeyStats(a: KeyStats, b: KeyStats): KeyStats {
  const out: KeyStats = {};
  for (const src of [a, b]) {
    for (const [key, v] of Object.entries(src)) {
      const entry = (out[key] ??= { hits: 0, misses: 0 });
      entry.hits += v.hits;
      entry.misses += v.misses;
    }
  }
  return out;
}
