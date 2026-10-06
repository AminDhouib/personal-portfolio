export function wpm(charCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round(charCount / 5 / (elapsedMs / 60000));
}

export function accuracyPercent(correct: number, total: number): number {
  if (total <= 0) return 100;
  return Math.round((correct / total) * 100);
}

export function isNewBest(score: number, previousBest: number | null): boolean {
  if (previousBest === null) return false;
  return score > previousBest;
}
