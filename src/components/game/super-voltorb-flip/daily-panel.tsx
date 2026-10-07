"use client";

import { useState } from "react";
import type { ArcadeBoardEntry } from "@/hooks/use-arcade-board";
import type { DailyOutcome } from "./daily-store";
import type { DailySubmitState } from "./use-daily-round";

const PANEL =
  "w-full rounded-[6px] border-2 border-gray-300 bg-white p-3 text-gray-700 outline outline-2 outline-gray-600";
const BTN =
  "min-h-11 min-w-11 shrink-0 cursor-pointer rounded-[6px] border-2 border-white bg-[#3D7757] px-3 text-sm font-bold text-white outline outline-2 outline-gray-600 focus-visible:outline-[#ef2020] disabled:cursor-default disabled:opacity-50";
const ROW = "flex items-center gap-2 py-0.5 text-sm";
const ROW_YOU = "flex items-center gap-2 bg-[#eef5ef] py-0.5 text-sm font-bold";

const FAILURE: Partial<Record<DailySubmitState, string>> = {
  failed: "Could not reach the board. Try again in a moment.",
  rejected: "That score was not accepted for today's board.",
  closed: "Today's board has closed (00:00 UTC passed). Your score stays on this device.",
};

export function DailyPanel({
  dayKey,
  outcome,
  score,
  handle,
  submitted,
  submitState,
  rank,
  streak,
  entries,
  loading,
  readError,
  onPost,
}: {
  dayKey: string;
  outcome: DailyOutcome | null;
  score: number;
  handle: string;
  submitted: boolean;
  submitState: DailySubmitState;
  rank: number | null;
  streak: number;
  entries: readonly ArcadeBoardEntry[];
  loading: boolean;
  readError: string | null;
  onPost: (name: string) => void;
}) {
  const [name, setName] = useState(handle);
  const finished = outcome !== null;
  const canPost = finished && score > 0 && !submitted && submitState !== "closed";
  const failure = FAILURE[submitState];

  return (
    <section className={PANEL} aria-label="Daily board">
      {!finished && (
        <p className="text-sm">
          One board a day, the same for everyone. Bank coins, then post your score.
        </p>
      )}
      {finished && score <= 0 && (
        <p className="text-sm">No score to post today. A new board lands at 00:00 UTC.</p>
      )}
      {finished && score > 0 && (
        <p className="text-sm">
          Today: <strong>{score}</strong> {score === 1 ? "coin" : "coins"}.
        </p>
      )}
      {submitted && (
        <p className="text-sm" role="status">
          Posted{rank !== null ? `, rank ${rank} today` : ""}.
        </p>
      )}
      {canPost && (
        <form
          className="mt-2 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            onPost(name);
          }}
        >
          <label className="flex min-w-0 flex-1 flex-col text-xs text-gray-500">
            Name for the board
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={12}
              autoComplete="off"
              className="mt-1 h-11 min-w-0 rounded-[6px] border-2 border-gray-300 px-2 text-base text-gray-700"
            />
          </label>
          <button type="submit" disabled={submitState === "sending"} className={BTN}>
            Post score
          </button>
        </form>
      )}
      {failure && (
        <p role="alert" className="mt-2 text-sm text-[#b3261e]">
          {failure}
        </p>
      )}
      {streak > 0 && <p className="mt-2 text-xs text-gray-500">{streak}-day streak</p>}

      <h2 className="mt-3 text-sm font-bold">Today ({dayKey}, UTC)</h2>
      {readError ? (
        <p className="text-sm text-gray-500">Board unavailable right now.</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500">{loading ? "Loading." : "No scores yet today."}</p>
      ) : (
        <ol className="mt-1">
          {entries.slice(0, 10).map((entry) => (
            <li
              key={entry.rank}
              className={entry.isYou ? ROW_YOU : ROW}
              aria-current={entry.isYou ? "true" : undefined}
            >
              <span className="w-5 shrink-0 tabular-nums">{entry.rank}</span>
              <span className="min-w-0 flex-1 truncate">{entry.name}</span>
              <span className="shrink-0 tabular-nums">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
