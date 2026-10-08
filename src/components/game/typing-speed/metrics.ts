import type { TypingRun } from "./engine/types";

export function wpm(charCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round(charCount / 5 / (elapsedMs / 60000));
}

// The live readout waits a second: a couple of characters over the first
// 80 ms tick would otherwise flash a WPM in the hundreds.
const LIVE_WPM_MIN_MS = 1000;

export function liveWpm(charCount: number, elapsedMs: number): number {
  return elapsedMs < LIVE_WPM_MIN_MS ? 0 : wpm(charCount, elapsedMs);
}

export function accuracyPercent(correct: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((correct / total) * 100);
}

export function isNewBest(score: number, previousBest: number | null): boolean {
  if (previousBest === null) return false;
  return score > previousBest;
}

export interface RunMetrics {
  netWpm: number;
  rawWpm: number;
  /** Correct keystrokes over all character and space keystrokes; corrections still cost. */
  accuracy: number;
  /** Characters of correct words with their spaces, plus a correct unfinished prefix. */
  netChars: number;
  /** Every character and space typed, right or wrong (Backspace excluded). */
  rawChars: number;
  correctKeys: number;
  incorrectKeys: number;
  mistakesTyped: number;
  /** Wrong, extra and missed letters in the final text. */
  mistakesLeft: number;
  elapsedMs: number;
}

export interface CharCounts {
  correct: number;
  incorrect: number;
  extra: number;
  missed: number;
}

/** Consecutive correct keystrokes now and at best; Backspace neither extends nor breaks one. */
export function streaks(run: TypingRun): { current: number; best: number } {
  let current = 0;
  let best = 0;
  for (const k of run.log) {
    if (k.correct === true) {
      current++;
      best = Math.max(best, current);
    } else if (k.correct === false) {
      current = 0;
    }
  }
  return { current, best };
}

function isTextRunDone(run: TypingRun): boolean {
  return run.config.kind === "text" && run.status === "done";
}

/** Letter-level verdicts on the final text; spaces are not counted. */
export function charCounts(run: TypingRun): CharCounts {
  const out: CharCounts = { correct: 0, incorrect: 0, extra: 0, missed: 0 };
  const upTo = Math.min(run.cursor, run.typed.length - 1);
  for (let i = 0; i <= upTo; i++) {
    const word = run.words[i] ?? "";
    const typed = run.typed[i] ?? "";
    for (let j = 0; j < Math.min(word.length, typed.length); j++) {
      if (word[j] === typed[j]) out.correct++;
      else out.incorrect++;
    }
    if (typed.length > word.length) out.extra += typed.length - word.length;
    const finished = i < run.cursor || isTextRunDone(run);
    if (finished && typed.length < word.length) out.missed += word.length - typed.length;
  }
  return out;
}

export function netCharCount(run: TypingRun): number {
  let n = 0;
  const upTo = Math.min(run.cursor, run.typed.length - 1);
  for (let i = 0; i <= upTo; i++) {
    const word = run.words[i] ?? "";
    const typed = run.typed[i] ?? "";
    if (i < run.cursor) {
      if (typed === word) n += word.length + 1;
    } else if (word.startsWith(typed)) {
      n += typed.length;
    }
  }
  return n;
}

/**
 * Honest numbers from the keystroke log. The clock runs from the first
 * keystroke to the last one (text runs) or to the limit (timed runs).
 */
export function runMetrics(run: TypingRun, now?: number): RunMetrics {
  const last = run.log.at(-1);
  const lastAt = run.startedAt === null || !last ? null : run.startedAt + last.t;
  let elapsedMs = 0;
  if (run.startedAt !== null) {
    const end = run.endedAt ?? now ?? lastAt ?? run.startedAt;
    elapsedMs = Math.max(0, end - run.startedAt);
    if (run.config.kind === "time") elapsedMs = Math.min(elapsedMs, run.config.seconds * 1000);
  }
  let correctKeys = 0;
  let incorrectKeys = 0;
  for (const k of run.log) {
    if (k.correct === true) correctKeys++;
    else if (k.correct === false) incorrectKeys++;
  }
  const rawChars = correctKeys + incorrectKeys;
  const netChars = netCharCount(run);
  const left = charCounts(run);
  return {
    netWpm: wpm(netChars, elapsedMs),
    rawWpm: wpm(rawChars, elapsedMs),
    accuracy: accuracyPercent(correctKeys, rawChars),
    netChars,
    rawChars,
    correctKeys,
    incorrectKeys,
    mistakesTyped: incorrectKeys,
    mistakesLeft: left.incorrect + left.extra + left.missed,
    elapsedMs,
  };
}
