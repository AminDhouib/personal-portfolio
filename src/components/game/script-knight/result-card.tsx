import type { RunResult } from "./engine/run";
import { getGradeLetter } from "./engine/scoring";
import { GAME_SURFACE, TOUCH } from "./surface";

export interface ResultCardProps {
  result: RunResult;
  /** Why it did not pass, in the player's words; null on a pass. */
  reason: string | null;
  clue: string | null;
  hasNextFloor: boolean;
  onNext: () => void;
  onRetry: () => void;
}

/** What a finished run came to: the score parts and grade on a pass, the reason and clue otherwise. */
export function ResultCard({
  result,
  reason,
  clue,
  hasNextFloor,
  onNext,
  onRetry,
}: ResultCardProps) {
  if (result.passed && result.score) {
    const { warrior, timeBonus, clearBonus, total } = result.score;
    const grade = result.grade ?? 0;
    return (
      <section
        aria-label="Result"
        className={`rounded-lg border border-[#4ade80]/50 p-3 text-sm ${GAME_SURFACE}`}
      >
        <h3 className="text-base font-semibold text-[#4ade80]">Floor passed</h3>
        <p className="mt-1 text-(--foreground)">
          {result.turns} turns. Score {total}: {warrior} from the warrior, {timeBonus} time bonus,{" "}
          {clearBonus} clear bonus. Grade <strong>{getGradeLetter(grade)}</strong> (
          {Math.round(grade * 100)}%).
        </p>
        <div className="mt-2 flex gap-2">
          {hasNextFloor ? (
            <button
              type="button"
              onClick={onNext}
              className={`rounded-md bg-[#4ade80] px-3 py-1.5 text-sm font-medium text-black ${TOUCH}`}
            >
              Next floor
            </button>
          ) : null}
          <button
            type="button"
            onClick={onRetry}
            className={`rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--foreground) ${TOUCH}`}
          >
            Improve this score
          </button>
        </div>
      </section>
    );
  }
  return (
    <section
      aria-label="Result"
      className={`rounded-lg border border-red-400/50 p-3 text-sm ${GAME_SURFACE}`}
    >
      <h3 className="text-base font-semibold text-red-300">Floor not passed</h3>
      {reason ? <p className="mt-1 text-(--foreground)">{reason}</p> : null}
      {clue ? (
        <p className="mt-1 text-(--muted)">
          <span className="font-medium text-(--foreground)">Clue: </span>
          {clue}
        </p>
      ) : null}
    </section>
  );
}
