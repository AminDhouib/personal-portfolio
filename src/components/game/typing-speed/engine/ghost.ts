import { netCharCount, runMetrics } from "../metrics";
import type { TypingRun } from "./types";

/** A ghost is the run's net characters sampled this often. */
export const SAMPLE_MS = 250;

/** A 120 s run, the longest timed one, has this many samples; the store caps a ghost here. */
export const MAX_SAMPLES = 481;

/** Where a ghost stands on the current words: the letter the real caret would sit on. */
export interface GhostSpot {
  word: number;
  /** Equal to the word length means the space after it (or the end of the last word). */
  letter: number;
}

/** What a finished run shows about the ghost it raced. */
export interface GhostResult {
  /** Net WPM minus the ghost WPM, or null when the run raced no ghost. */
  delta: number | null;
  /** This run replaced the stored ghost. */
  saved: boolean;
  /** The ghost cumulative WPM per second, for the graph overlay, or null. */
  line: number[] | null;
}

/**
 * The net characters at each of `times` (ms since the first keystroke, ascending), by
 * replaying the keystroke log with the engine rules for Space and Backspace.
 */
function replay(run: TypingRun, times: readonly number[]): number[] {
  const state: TypingRun = { ...run, typed: [""], cursor: 0 };
  const out: number[] = [];
  let k = 0;
  for (const t of times) {
    while (k < run.log.length && (run.log[k]?.t ?? Infinity) <= t) {
      const key = run.log[k++];
      if (!key) break;
      const cur = state.typed[state.cursor] ?? "";
      if (key.kind === "char") {
        state.typed[state.cursor] = cur + (key.ch ?? "");
      } else if (key.kind === "space") {
        // Space on the last word of a text run ends it; the engine leaves the cursor there.
        if (run.config.kind === "text" && state.cursor === run.words.length - 1) continue;
        state.cursor++;
        if (state.typed.length <= state.cursor) state.typed.push("");
      } else if (cur !== "") {
        state.typed[state.cursor] = key.kind === "backWord" ? "" : cur.slice(0, -1);
      } else if (state.cursor > 0) {
        // At a word start the engine only logs a Backspace that steps into a wrong word.
        state.typed.length = state.cursor;
        state.cursor--;
      }
    }
    out.push(netCharCount(state));
  }
  return out;
}

/** The run net characters `t` ms after its first keystroke. */
export function netCharsAt(run: TypingRun, t: number): number {
  if (t < 0) return 0;
  return replay(run, [t])[0] ?? 0;
}

/**
 * Net characters every SAMPLE_MS from the start to the end of the run: ceil(elapsed / 250) + 1
 * integers. The first is 0, the clock before the first keystroke counts nothing.
 */
export function sampleRun(run: TypingRun): number[] {
  const elapsed = runMetrics(run).elapsedMs;
  const count = Math.ceil(elapsed / SAMPLE_MS) + 1;
  const times = Array.from({ length: count }, (_, i) => i * SAMPLE_MS);
  const chars = replay(run, times);
  chars[0] = 0;
  return chars;
}

/** The ghost net characters `ms` into the race: linear between samples, held after the end. */
export function ghostCharsAt(samples: readonly number[], ms: number): number {
  const last = samples.length - 1;
  if (last < 0) return 0;
  if (ms <= 0) return samples[0] ?? 0;
  const pos = ms / SAMPLE_MS;
  if (pos >= last) return samples[last] ?? 0;
  const i = Math.floor(pos);
  const a = samples[i] ?? 0;
  const b = samples[i + 1] ?? a;
  return a + (b - a) * (pos - i);
}

/** Puts a character count on the current words; a space counts as one, past the end clamps. */
export function ghostPosition(words: readonly string[], chars: number): GhostSpot {
  let left = Math.max(0, Math.floor(chars));
  for (let i = 0; i < words.length; i++) {
    const len = words[i]?.length ?? 0;
    if (left < len + 1 || i === words.length - 1) return { word: i, letter: Math.min(left, len) };
    left -= len + 1;
  }
  return { word: 0, letter: 0 };
}

/** The live net characters minus the ghost at the same elapsed time; positive is ahead. */
export function paceDelta(run: TypingRun, samples: readonly number[], now: number): number {
  const elapsed = run.startedAt === null ? 0 : now - run.startedAt;
  return netCharCount(run) - ghostCharsAt(samples, elapsed);
}

/** The ghost cumulative net WPM at the end of each of `count` seconds, like the run own line. */
export function ghostSeries(samples: readonly number[], count: number): number[] {
  if (samples.length === 0) return [];
  return Array.from(
    { length: count },
    (_, i) => (ghostCharsAt(samples, (i + 1) * 1000) * 12) / (i + 1),
  );
}
