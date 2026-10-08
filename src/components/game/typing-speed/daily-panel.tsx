"use client";

import { useState } from "react";
import { Flame } from "lucide-react";
import { ArcadeBoardTabs } from "@/components/game/arcade-board-tabs";
import { SOURCES, sourceUrl } from "./corpus/sources";
import { HANDLE_MAX, type DailyRecord } from "./daily-store";
import { useDailyText } from "./use-daily-text";

const VISIBLE_ROWS = 5;
const ACTIVE_TAB = "border-accent-blue/60 bg-accent-blue/15 text-foreground";
const INACTIVE_TAB =
  "border-[var(--border)] bg-transparent text-foreground/60 hover:text-foreground";
const ACTION =
  "min-h-11 min-w-11 touch-manipulation rounded-lg border border-[var(--border)] bg-transparent px-4 py-2 font-sans text-sm font-semibold transition hover:border-accent-blue/50 disabled:cursor-not-allowed disabled:opacity-40";

const EMPTY_TEXT = {
  daily: "No scores yet today",
  weekly: "No scores yet this week",
  "all-time": "No scores yet",
} as const;

interface DailyPanelProps {
  /** The UTC day of the text being played, "YYYY-MM-DD". */
  day: string;
  sourceId: string;
  record: DailyRecord;
  /** The streak as it stands today, 0 when it has lapsed. */
  streak: number;
  /** The latest attempt used phone suggestions or autocorrect, so it can never be posted. */
  lastBulk: boolean;
  onPosted: (wpm: number, handle: string) => void;
  /** Starts the new day's text after the UTC day has turned over. */
  onNewDay: () => void;
}

/**
 * Today's text: the credit, how the attempts stand, Post (by hand, never automatic) and the
 * Today / This week / All time board. The structure is always rendered; only the body
 * branches, so a tab switch that empties the rows never unmounts the focused tab. Mounted
 * only while the Daily view is open, so the board is read then and not on page load.
 */
export function DailyPanel({
  day,
  sourceId,
  record,
  streak,
  lastBulk,
  onPosted,
  onNewDay,
}: DailyPanelProps) {
  const { entries, you, period, setPeriod, loading, readError, requested, status, notice, post } =
    useDailyText({ day, best: record.best, posted: record.posted, onPosted });
  const [name, setName] = useState(record.handle);
  const source = SOURCES.find((s) => s.id === sourceId);
  const { best, attempts } = record;
  const closed = status === "closed";
  const rows = entries.slice(0, VISIBLE_ROWS);
  const youShown = rows.some((e) => e.isYou);
  const busy = status === "sending" || status === "sent" || status === "rejected";

  return (
    <section aria-label="Daily text" data-testid="ts-daily-panel" className="space-y-3">
      <p role="status" className="sr-only">
        {notice}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="font-sans text-sm font-semibold text-(--foreground)">Daily text</h2>
        <span className="font-mono text-xs text-(--muted) tabular-nums">{day} UTC</span>
        {streak > 0 && (
          <span className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-accent-amber">
            <Flame aria-hidden="true" className="h-3.5 w-3.5" />
            {streak}-day streak
          </span>
        )}
      </div>
      {source && (
        <p className="text-xs text-(--muted)">
          From {source.title} by {source.author}, via{" "}
          <a
            href={sourceUrl(source)}
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2 hover:text-(--foreground)"
          >
            Project Gutenberg
          </a>
          .
        </p>
      )}
      <p className="text-sm text-(--muted)">
        {best
          ? `Your best today: ${best.wpm} WPM, ${attempts} ${attempts === 1 ? "attempt" : "attempts"}.`
          : attempts > 0
            ? `${attempts} ${attempts === 1 ? "attempt" : "attempts"} today, none that can be posted yet.`
            : "Everyone gets the same text today. Try as many times as you like."}
      </p>
      {lastBulk && (
        <p className="text-sm text-accent-amber">
          Keyboard suggestions were used, so this attempt cannot be posted.
        </p>
      )}

      {closed && (
        <div>
          <p className="mb-2 text-sm text-(--foreground)">
            Today&apos;s text closed at 00:00 UTC. Play the new one.
          </p>
          <button type="button" onClick={onNewDay} className={ACTION}>
            Play the new text
          </button>
        </div>
      )}

      {best && !closed && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post(name);
          }}
        >
          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col text-left font-sans text-xs text-(--muted)">
              Name for the board
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, HANDLE_MAX))}
                maxLength={HANDLE_MAX}
                autoComplete="off"
                className="mt-1 min-h-11 min-w-0 rounded-lg border border-[var(--border)] bg-transparent px-2 font-sans text-base text-(--foreground) outline-none focus:border-accent-blue/60 sm:text-sm"
              />
            </label>
            <button type="submit" disabled={busy} className={ACTION}>
              {status === "sending"
                ? "..."
                : status === "sent"
                  ? "Posted"
                  : status === "failed"
                    ? "Retry"
                    : status === "rejected"
                      ? "Rejected"
                      : "Post"}
            </button>
          </div>
          {status === "failed" && (
            <p className="mt-2 text-sm text-accent-red">Could not reach the board. Try again.</p>
          )}
          {status === "rejected" && (
            <p className="mt-2 text-sm text-accent-red">This run was not accepted.</p>
          )}
        </form>
      )}

      <h2 className="font-sans text-sm font-semibold text-(--foreground)">Daily board</h2>
      <ArcadeBoardTabs
        label="Leaderboard period"
        period={period}
        onChange={setPeriod}
        className="mb-2"
        activeClassName={ACTIVE_TAB}
        inactiveClassName={INACTIVE_TAB}
      />
      <div
        data-testid="ts-board-list"
        className="min-h-[9.25rem] rounded-lg border border-[var(--border)]"
      >
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-center text-sm text-(--muted)">
            {loading || !requested
              ? "Loading"
              : readError
                ? "Could not load the board"
                : EMPTY_TEXT[period]}
          </p>
        ) : (
          <ol className="divide-y divide-[var(--border)]">
            {rows.map((entry) => (
              <li
                key={`${entry.rank}-${entry.name}-${entry.createdAt}`}
                aria-current={entry.isYou ? "true" : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 font-mono text-xs ${
                  entry.isYou ? "bg-accent-blue/10 text-accent-blue" : "text-(--foreground)/80"
                }`}
              >
                <span className="w-5 text-right tabular-nums">{entry.rank}</span>
                <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                {entry.acc !== undefined && (
                  <span className="text-(--muted) tabular-nums">{entry.acc}%</span>
                )}
                <span className="tabular-nums">{entry.score} WPM</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {you && !youShown && (
        <p className="text-left font-mono text-xs text-(--muted)">
          Your best: #{you.rank} ({you.score} WPM)
        </p>
      )}
    </section>
  );
}
