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
