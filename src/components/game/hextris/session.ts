import type { ArcadeSubmitPayload } from "@/hooks/use-arcade-board";

// Whether a finished run belongs in the local high-score list. A run that
// scored nothing (start and lose immediately) is noise, not a record.
export function isRecordableRun(score: number): boolean {
  return score > 0;
}

/** How many scores `hextris_highscores` keeps. */
const HIGH_SCORES_KEPT = 3;

/** The stored high-score list after a finished run: the best three, highest first. */
export function recordHighScore(highScores: readonly number[], score: number): number[] {
  if (!isRecordableRun(score)) return [...highScores];
  return [...highScores, score].sort((a, b) => b - a).slice(0, HIGH_SCORES_KEPT);
}

/** The arcade board's submission for a finished run (blocks cleared go in `kills`). */
export function arcadeSubmission(
  name: string,
  run: { score: number; level: number; elapsedMs: number; cellsCleared: number },
): ArcadeSubmitPayload<"hextris"> {
  return {
    name: name.trim().slice(0, 12) || "Player",
    score: run.score,
    level: Math.max(1, Math.floor(run.level)),
    seconds: Math.floor(run.elapsedMs / 1000),
    kills: run.cellsCleared,
  };
}

/**
 * The seed for a new run: `?seed=<uint32>` from `search` when overrides are allowed (never in
 * production), otherwise a fresh one from `draw`.
 */
export function runSeed(search: string, allowOverride: boolean, draw: () => number): number {
  if (allowOverride) {
    const raw = new URLSearchParams(search).get("seed");
    if (raw !== null && /^\d+$/.test(raw)) {
      const n = Number(raw);
      if (n <= 0xffffffff) return n;
    }
  }
  return draw() >>> 0;
}
