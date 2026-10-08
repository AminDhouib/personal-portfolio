import type { ArcadeBoardResult } from "@/hooks/use-arcade-board";

/**
 * Whether a just-submitted run earns the "World Record" celebration. The arcade keeps one best
 * row per player per board, so the submit's `rank` is the rank of the player's BEST score, not
 * of this run: the leader submitting a worse run still reports rank 1. Only a run that
 * improved the all-time board AND now sits first is a record.
 */
export function isWorldRecord(boards: readonly ArcadeBoardResult[] | undefined, score: number) {
  const allTime = boards?.find((b) => b.period === "all-time");
  return allTime !== undefined && allTime.improved && allTime.rank === 1 && score > 0;
}

/**
 * What a just-finished run means for the player's stored best. `previousBest` is null when no
 * best was stored yet (absent, not zero): that first scored run is a "first" flight rather than
 * a personal best, since there is nothing to beat. Ties, lower scores and zero runs are nothing.
 */
export function personalBestKind(
  final: number,
  previousBest: number | null,
): "first" | "best" | null {
  if (final <= 0) return null;
  if (previousBest === null) return "first";
  return final > previousBest ? "best" : null;
}
