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
