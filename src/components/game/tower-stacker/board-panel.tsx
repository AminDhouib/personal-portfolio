"use client";

import { useEffect, useState } from "react";
import { ArcadeBoardTabs } from "@/components/game/arcade-board-tabs";
import { useArcadeBoard } from "@/hooks/use-arcade-board";
import { dayNumber } from "./daily";
import { shareResult, shareText, type ShareOutcome } from "./share";
import { HANDLE_MAX } from "./stats";
import type { TowerMode } from "./mode-row";

/** A finished run, as the game-over card needs it. */
export interface FinishedRun {
  mode: TowerMode;
  /** The UTC day the run began on, "YYYY-MM-DD". */
  dayKey: string;
  score: number;
  floors: number;
  perfects: number;
  bestStreak: number;
  /** Whole seconds of active play (pauses excluded). */
  seconds: number;
  /** The UTC day turned over before the run ended: today's board no longer takes it. */
  closed: boolean;
}

type SubmitState = "idle" | "sending" | "submitted" | "failed" | "rejected" | "identity";

const VISIBLE_ROWS = 5;
const ACTIVE_TAB = "border-accent-red/60 bg-accent-red/15 text-foreground";
const INACTIVE_TAB =
  "border-[var(--border)] bg-transparent text-foreground/60 hover:text-foreground";
const ACTION =
  "min-h-11 min-w-11 border border-[var(--border)] bg-transparent px-4 py-2 font-mono text-xs font-bold tracking-[0.3em] uppercase transition hover:border-accent-red/50 disabled:cursor-not-allowed disabled:opacity-40";

const EMPTY_TEXT = {
  daily: "No scores yet today",
  weekly: "No scores yet this week",
  "all-time": "No scores yet",
} as const;

/**
 * The game-over card's board: submit a daily result and read the Today / This week / All
 * time boards. The structure (heading, tabs) is always rendered for a daily run; only the
 * body branches, so a tab switch that empties the rows never unmounts the focused tab.
 * The board is read when the card opens (this component mounting), never on page load.
 * A free build is unranked: it gets a pointer to today's tower and nothing else.
 */
export function BoardPanel({
  run,
  handle,
  streakDays,
  onHandle,
  onPlayDaily,
}: {
  run: FinishedRun;
  handle: string;
  streakDays: number;
  onHandle: (name: string) => void;
  onPlayDaily: () => void;
}) {
  const { entries, you, period, setPeriod, loading, readError, refresh, submit } = useArcadeBoard(
    "tower-stacker",
    { fetchOnMount: false, period: "daily" },
  );
  const [name, setName] = useState(handle);
  const [state, setState] = useState<SubmitState>("idle");
  const [rank, setRank] = useState<number | null>(null);
  const [shared, setShared] = useState<ShareOutcome | null>(null);
  const daily = run.mode === "daily";

  useEffect(() => {
    if (daily) void refresh();
  }, [daily, refresh]);

  if (!daily) {
    return (
      <div className="mb-4">
        <p className="text-muted mb-3 font-mono text-[10px] tracking-[0.2em] uppercase">
          Free builds stay on this device
        </p>
        <button type="button" onClick={onPlayDaily} className={`${ACTION} w-full`}>
          Play today&apos;s tower
        </button>
      </div>
    );
  }

  const canPost = !run.closed && run.floors > 0;
  const locked = state === "sending" || state === "submitted" || state === "rejected";

  async function share() {
    setShared(
      await shareResult(
        shareText({
          dayKey: run.dayKey,
          floors: run.floors,
          score: run.score,
          bestStreak: run.bestStreak,
        }),
      ),
    );
  }

  async function post() {
    if (locked) return;
    const typed = name.trim().slice(0, HANDLE_MAX);
    onHandle(typed);
    setState("sending");
    const result = await submit({
      name: typed || "Stacker",
      score: run.score,
      day: dayNumber(run.dayKey),
      blocks: run.floors,
      perfects: run.perfects,
      streak: run.bestStreak,
      seconds: run.seconds,
    });
    if (result.ok) {
      setRank(result.boards?.find((b) => b.period === "daily")?.rank ?? null);
      setState("submitted");
      await refresh();
    } else if (result.rejected) {
      setState("rejected");
    } else if (result.identityReset) {
      setState("identity");
    } else {
      setState("failed");
    }
  }

  const rows = entries.slice(0, VISIBLE_ROWS);
  const youShown = rows.some((e) => e.isYou);

  return (
    <section aria-label="Today's tower board" data-testid="tower-board-panel" className="mb-4">
      {run.closed && (
        <div className="mb-3">
          <p role="status" className="text-foreground/80 mb-2 font-mono text-xs leading-relaxed">
            Today&apos;s tower closed at 00:00 UTC. Play the new one.
          </p>
          <button type="button" onClick={onPlayDaily} className={`${ACTION} w-full`}>
            Play the new tower
          </button>
        </div>
      )}

      {canPost && (
        <form
          className="mb-3"
          onSubmit={(event) => {
            event.preventDefault();
            void post();
          }}
        >
          <div className="flex items-end gap-2">
            <label className="text-muted flex min-w-0 flex-1 flex-col text-left font-mono text-[10px] tracking-[0.2em] uppercase">
              Name for the board
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, HANDLE_MAX))}
                maxLength={HANDLE_MAX}
                autoComplete="off"
                className="text-foreground mt-1 min-h-11 min-w-0 border border-[var(--border)] bg-transparent px-2 font-mono text-sm tracking-normal normal-case outline-none focus:border-accent-red/60"
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
          {state === "submitted" && (
            <p role="status" className="text-foreground/80 mt-2 font-mono text-xs">
              Posted
              {rank !== null && (
                <>
                  {" "}
                  <span>#{rank} today</span>
                </>
              )}
              .
            </p>
          )}
          {state === "rejected" && (
            <p role="alert" className="mt-2 font-mono text-xs text-accent-red">
              This run was not accepted.
            </p>
          )}
          {state === "identity" && (
            <p role="alert" className="mt-2 font-mono text-xs text-accent-red">
              Your player id was reset; submit again.
            </p>
          )}
          {state === "failed" && (
            <p role="alert" className="mt-2 font-mono text-xs text-accent-red">
              Could not reach the board. Try again in a moment.
            </p>
          )}
        </form>
      )}
      {run.floors > 0 && (
        <button type="button" onClick={() => void share()} className={`${ACTION} mb-3 w-full`}>
          {shared === "copied" ? "Copied" : shared === "failed" ? "Could not copy" : "Share"}
        </button>
      )}
      {streakDays > 0 && (
        <p className="text-muted mb-2 font-mono text-[10px] tracking-[0.2em] uppercase">
          {streakDays}-day streak
        </p>
      )}

      <h2 className="text-foreground/70 mb-2 text-left font-mono text-[10px] tracking-[0.3em] uppercase">
        Today&apos;s tower board
      </h2>
      <ArcadeBoardTabs
        label="Leaderboard period"
        period={period}
        onChange={setPeriod}
        className="mb-2"
        activeClassName={ACTIVE_TAB}
        inactiveClassName={INACTIVE_TAB}
      />
      {rows.length === 0 ? (
        <p className="text-foreground/50 border border-[var(--border)] px-3 py-3 text-center font-mono text-xs">
          {loading ? "Loading" : readError ? "Could not load the board" : EMPTY_TEXT[period]}
        </p>
      ) : (
        <ol className="divide-y divide-[var(--border)] border border-[var(--border)]">
          {rows.map((entry) => (
            <li
              key={`${entry.rank}-${entry.name}-${entry.createdAt}`}
              aria-current={entry.isYou ? "true" : undefined}
              className={`flex items-center gap-2 px-3 py-1.5 font-mono text-xs ${
                entry.isYou ? "bg-accent-red/10 text-accent-red" : "text-foreground/80"
              }`}
            >
              <span className="w-5 text-right tabular-nums">{entry.rank}</span>
              <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
              {entry.blocks !== undefined && (
                <span className="text-foreground/50 tabular-nums">{entry.blocks} fl</span>
              )}
              <span className="tabular-nums">{entry.score}</span>
            </li>
          ))}
        </ol>
      )}
      {you && !youShown && (
        <p className="text-muted mt-2 text-left font-mono text-[10px]">
          Your best: #{you.rank} ({you.score})
        </p>
      )}
    </section>
  );
}
