"use client";

import { useEffect, useState } from "react";
import { ArcadeBoardTabs } from "@/components/game/arcade-board-tabs";
import { useArcadeBoard } from "@/hooks/use-arcade-board";
import { utcDayKey } from "@/lib/arcade/boards";
import { dayNumber } from "./daily";
import { HANDLE_MAX } from "./stats";
import { GAME_SURFACE, TOUCH } from "./surface";

/** A cleared daily floor, as the board panel needs it. */
export interface DailyResult {
  /** The UTC day the floor belongs to, "YYYY-MM-DD". */
  dayKey: string;
  score: number;
  turns: number;
  /** The action log the server re-simulates (the proof); never the code. */
  log: string;
  /** Played by hand (T7-7); a client-claimed, display-only tag. */
  hand: boolean;
}

export interface DailyBoardProps {
  result: DailyResult;
  handle: string;
  streakDays: number;
  onHandle: (name: string) => void;
}

type SubmitState = "idle" | "sending" | "submitted" | "failed" | "rejected" | "identity";

const VISIBLE_ROWS = 5;
const ACTIVE_TAB = "border-[#4ade80]/60 bg-[#4ade80]/15 text-(--foreground)";
const INACTIVE_TAB = "border-(--border) bg-transparent text-(--muted) hover:text-(--foreground)";
const ACTION = `min-h-11 min-w-11 rounded-md border border-(--border) bg-transparent px-4 py-2 text-xs font-medium text-(--foreground) hover:border-[#4ade80] disabled:cursor-not-allowed disabled:opacity-40 ${TOUCH}`;

const EMPTY_TEXT = {
  daily: "No scores yet today",
  weekly: "No scores yet this week",
  "all-time": "No scores yet",
} as const;

/**
 * Submit a cleared daily floor and read the Today / This week / All time boards. Every ranked run
 * is a daily, so all three boards are daily results (the Voltorb register precedent). The board
 * is read when the panel opens, never on page load. A run that crosses midnight UTC cannot be
 * posted: the floor it belongs to has closed.
 */
export function DailyBoardPanel({ result, handle, streakDays, onHandle }: DailyBoardProps) {
  const { entries, you, period, setPeriod, loading, readError, refresh, submit } = useArcadeBoard(
    "script-knight",
    { fetchOnMount: false, period: "daily" },
  );
  const [name, setName] = useState(handle);
  const [state, setState] = useState<SubmitState>("idle");
  const [rank, setRank] = useState<number | null>(null);
  // False until the first read has settled, so no paint claims an empty board early.
  const [requested, setRequested] = useState(false);
  // The UTC day turned over while the panel was open (seen at Submit time).
  const [lapsed, setLapsed] = useState(false);
  // One persistent live region: a conditionally mounted status can be skipped on insert.
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refresh().then(() => setRequested(true));
  }, [refresh]);

  const closed = lapsed || utcDayKey(new Date()) !== result.dayKey;
  const locked = state === "sending" || state === "submitted" || state === "rejected";

  async function post() {
    if (locked) return;
    if (utcDayKey(new Date()) !== result.dayKey) {
      setLapsed(true);
      setState("idle");
      setNotice("Today's floor has closed.");
      return;
    }
    const typed = name.trim().slice(0, HANDLE_MAX);
    onHandle(typed);
    setState("sending");
    const sent = await submit({
      name: typed || "Knight",
      score: result.score,
      day: dayNumber(result.dayKey),
      turns: result.turns,
      hand: result.hand ? 1 : 0,
      proof: result.log,
    });
    if (sent.ok) {
      const dailyRank = sent.boards?.find((b) => b.period === "daily")?.rank ?? null;
      setRank(dailyRank);
      setState("submitted");
      setNotice(dailyRank === null ? "Posted." : `Posted. Rank ${dailyRank} today.`);
      await refresh();
    } else if (sent.rejected) {
      // A 422 after the UTC day turned over is the floor closing, not a bad run.
      if (utcDayKey(new Date()) !== result.dayKey) {
        setLapsed(true);
        setState("idle");
        setNotice("Today's floor has closed.");
      } else {
        setState("rejected");
        setNotice("Run not accepted.");
      }
    } else if (sent.identityReset) {
      setState("identity");
      setNotice("Player id reset, submit again.");
    } else {
      setState("failed");
      setNotice("Board unreachable, try again.");
    }
  }

  const rows = entries.slice(0, VISIBLE_ROWS);
  const youShown = rows.some((e) => e.isYou);

  return (
    <section
      aria-label="Daily board"
      data-testid="knight-board-panel"
      className={`space-y-2 rounded-lg border border-(--border) p-3 ${GAME_SURFACE}`}
    >
      <p role="status" className="sr-only">
        {notice}
      </p>
      {closed ? (
        <p className="text-sm text-(--foreground)">
          Today&apos;s floor closed at 00:00 UTC. Reload to play the new one.
        </p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post();
          }}
        >
          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col text-xs text-(--muted)">
              Name for the board
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, HANDLE_MAX))}
                maxLength={HANDLE_MAX}
                autoComplete="off"
                className="mt-1 min-h-11 min-w-0 rounded-md border border-(--border) bg-transparent px-2 font-mono text-base text-(--foreground) outline-none focus:border-[#4ade80] sm:text-sm"
              />
            </label>
            <button type="submit" disabled={locked} className={ACTION}>
              {state === "sending"
                ? "..."
                : state === "submitted"
                  ? "Saved"
                  : state === "failed"
                    ? "Retry"
                    : state === "rejected"
                      ? "Rejected"
                      : "Submit"}
            </button>
          </div>
          {state === "submitted" ? (
            <p className="mt-2 text-xs text-(--foreground)">
              Posted{rank !== null ? ` #${rank} today` : ""}.
            </p>
          ) : null}
          {state === "rejected" ? (
            <p className="mt-2 text-xs text-red-300">This run was not accepted.</p>
          ) : null}
          {state === "identity" ? (
            <p className="mt-2 text-xs text-red-300">Your player id was reset; submit again.</p>
          ) : null}
          {state === "failed" ? (
            <p className="mt-2 text-xs text-red-300">
              Could not reach the board. Try again in a moment.
            </p>
          ) : null}
        </form>
      )}
      {streakDays > 0 ? (
        <p className="font-mono text-[11px] text-(--muted)">{streakDays}-day streak</p>
      ) : null}
      <h3 className="font-mono text-[11px] tracking-wider text-(--muted) uppercase">Daily board</h3>
      <ArcadeBoardTabs
        label="Leaderboard period"
        period={period}
        onChange={setPeriod}
        activeClassName={ACTIVE_TAB}
        inactiveClassName={INACTIVE_TAB}
      />
      <div
        data-testid="knight-board-list"
        className="min-h-[9.25rem] rounded-md border border-(--border)"
      >
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-center font-mono text-xs text-(--muted)">
            {loading || !requested
              ? "Loading"
              : readError
                ? "Could not load the board"
                : EMPTY_TEXT[period]}
          </p>
        ) : (
          <ol className="divide-y divide-(--border)">
            {rows.map((entry) => (
              <li
                key={`${entry.rank}-${entry.name}-${entry.createdAt}`}
                aria-current={entry.isYou ? "true" : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 font-mono text-xs ${
                  entry.isYou ? "bg-[#4ade80]/10 text-[#4ade80]" : "text-(--foreground)"
                }`}
              >
                <span className="w-5 text-right tabular-nums">{entry.rank}</span>
                <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                {entry.hand === 1 ? (
                  <span className="rounded border border-(--border) px-1 text-[10px] text-(--muted)">
                    by hand
                  </span>
                ) : null}
                {entry.turns !== undefined ? (
                  <span className="text-(--muted) tabular-nums">{entry.turns} turns</span>
                ) : null}
                <span className="tabular-nums">{entry.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {you && !youShown ? (
        <p className="font-mono text-[11px] text-(--muted)">
          Your best: #{you.rank} ({you.score})
        </p>
      ) : null}
    </section>
  );
}
