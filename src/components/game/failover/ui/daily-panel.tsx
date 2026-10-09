"use client";

import { useEffect, useRef, useState } from "react";
import { ArcadeBoardTabs } from "@/components/game/arcade-board-tabs";
import { useArcadeBoard } from "@/hooks/use-arcade-board";
import { utcDayKey } from "@/lib/arcade/boards";
import { dayNumber } from "../daily/daily";
import type { DailyResult } from "../daily/result";
import { dailyShareText, shareDaily } from "../daily/share-text";
import { HANDLE_MAX, loadHandle, saveHandle } from "../handle";
import { T, fmt } from "../strings";
import { clock } from "./format";
import { BUTTON, BUTTON_IDLE, TOUCH } from "./surface";

// The Daily Incident's board, on the end-of-run report: submit the run with its proof, read the
// Today / This week / All time boards, share the result. It is rendered only for a run the
// controller started as a daily, so a free or sandbox run never reaches the board.

type SubmitState = "idle" | "sending" | "submitted" | "failed" | "rejected" | "identity" | "busy";

const VISIBLE_ROWS = 5;
const ACTIVE_TAB = "border-[#06b6d4] bg-[#06b6d4]/15 text-[#06b6d4]";
const INACTIVE_TAB = "border-[#27272a] bg-transparent text-[#a1a1aa] hover:text-[#ededed]";

const EMPTY_TEXT = {
  daily: T.daily_empty_daily,
  weekly: T.daily_empty_weekly,
  "all-time": T.daily_empty_all,
} as const;

export function DailyPanel({ result }: { result: DailyResult }) {
  const { entries, you, period, setPeriod, loading, readError, refresh, submit } = useArcadeBoard(
    "failover",
    { fetchOnMount: false, period: "daily" },
  );
  const [name, setName] = useState(loadHandle);
  const [state, setState] = useState<SubmitState>("idle");
  const [rank, setRank] = useState<number | null>(null);
  // False until the first read has settled, so no paint claims an empty board early.
  const [requested, setRequested] = useState(false);
  // The UTC day turned over while the panel was open (seen at Submit time).
  const [lapsed, setLapsed] = useState(false);
  // While set, Retry is not offered yet: the server asked for this much time.
  const [waiting, setWaiting] = useState(false);
  const waitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // One persistent live region: a conditionally mounted status can be skipped on insert.
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void refresh().then(() => setRequested(true));
  }, [refresh]);

  useEffect(
    () => () => {
      if (waitTimer.current) clearTimeout(waitTimer.current);
    },
    [],
  );

  const tooMany = result.proof === null;
  const closed = lapsed || utcDayKey(new Date()) !== result.day;
  const locked = state === "sending" || state === "submitted" || state === "rejected" || waiting;

  function close() {
    setLapsed(true);
    setState("idle");
    setNotice(T.daily_closed);
  }

  async function post() {
    if (locked || result.proof === null) return;
    if (utcDayKey(new Date()) !== result.day) {
      close();
      return;
    }
    const typed = name.trim().slice(0, HANDLE_MAX);
    saveHandle(typed);
    setState("sending");
    const sent = await submit({
      name: typed || "Player",
      score: result.score,
      day: dayNumber(result.day),
      seconds: result.seconds,
      ticks: result.ticks,
      actions: result.actions,
      proof: result.proof,
    });
    if (sent.ok) {
      const dailyRank = sent.boards?.find((b) => b.period === "daily")?.rank ?? null;
      setRank(dailyRank);
      setState("submitted");
      setNotice(
        dailyRank === null ? T.daily_posted_plain : fmt(T.daily_posted, { rank: dailyRank }),
      );
      await refresh();
    } else if (sent.busy) {
      setState("busy");
      setNotice(T.daily_busy);
      setWaiting(true);
      waitTimer.current = setTimeout(() => setWaiting(false), sent.retryAfterMs ?? 0);
    } else if (sent.rejected) {
      // A 422 after the UTC day turned over is the incident closing, not a bad run.
      if (utcDayKey(new Date()) !== result.day) close();
      else {
        setState("rejected");
        setNotice(T.daily_rejected);
      }
    } else if (sent.identityReset) {
      setState("identity");
      setNotice(T.daily_identity);
    } else {
      setState("failed");
      setNotice(T.daily_unreachable);
    }
  }

  async function share() {
    const outcome = await shareDaily(
      dailyShareText({ day: result.day, seconds: result.seconds, score: result.score }),
    );
    if (outcome === "copied") setNotice(T.daily_copied);
    else if (outcome === "failed") setNotice(T.daily_copy_failed);
  }

  const rows = entries.slice(0, VISIBLE_ROWS);
  const youShown = rows.some((e) => e.isYou);
  const retryable = state === "busy" || state === "failed";
  const buttonText =
    state === "sending"
      ? T.daily_sending
      : state === "submitted"
        ? T.daily_saved
        : retryable
          ? T.daily_retry
          : T.daily_submit;

  return (
    <section
      aria-label={T.daily_board}
      data-testid="failover-daily-panel"
      className="flex flex-col gap-2 rounded-lg border border-[#27272a] p-3 text-xs"
    >
      <p role="status" className="sr-only">
        {notice}
      </p>
      <h3 className="text-sm font-semibold">{T.daily_board}</h3>
      {tooMany ? (
        <p className="text-[#fbbf24]">{T.daily_too_many}</p>
      ) : closed ? (
        <p>{T.daily_closed}</p>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void post();
          }}
        >
          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col text-[#a1a1aa]">
              {T.daily_name}
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value.slice(0, HANDLE_MAX))}
                maxLength={HANDLE_MAX}
                autoComplete="off"
                className="mt-1 min-h-11 min-w-0 rounded-md border border-[#27272a] bg-transparent px-2 font-mono text-base text-[#ededed] outline-none focus:border-[#06b6d4] sm:text-sm"
              />
            </label>
            <button
              type="submit"
              disabled={locked}
              className={`${BUTTON} ${BUTTON_IDLE} min-h-11 px-4 disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {buttonText}
            </button>
          </div>
          {state === "submitted" ? (
            <p className="mt-2">
              {rank === null ? T.daily_posted_plain : fmt(T.daily_posted, { rank })}
            </p>
          ) : null}
          {state === "busy" ? <p className="mt-2 text-[#fbbf24]">{T.daily_busy}</p> : null}
          {state === "rejected" ? <p className="mt-2 text-[#f87171]">{T.daily_rejected}</p> : null}
          {state === "identity" ? <p className="mt-2 text-[#f87171]">{T.daily_identity}</p> : null}
          {state === "failed" ? <p className="mt-2 text-[#f87171]">{T.daily_unreachable}</p> : null}
        </form>
      )}

      <button
        type="button"
        onClick={() => void share()}
        className={`${BUTTON} ${BUTTON_IDLE} self-start ${TOUCH}`}
      >
        {T.daily_share_button}
      </button>

      <ArcadeBoardTabs
        label={T.daily_periods}
        period={period}
        onChange={setPeriod}
        activeClassName={ACTIVE_TAB}
        inactiveClassName={INACTIVE_TAB}
      />
      <div
        data-testid="failover-board-list"
        className="min-h-[9.25rem] rounded-md border border-[#27272a]"
      >
        {rows.length === 0 ? (
          <p className="px-3 py-3 text-center font-mono text-[#a1a1aa]">
            {loading || !requested
              ? T.daily_loading
              : readError
                ? T.daily_load_failed
                : EMPTY_TEXT[period]}
          </p>
        ) : (
          <ol className="divide-y divide-[#27272a]">
            {rows.map((entry) => (
              <li
                key={`${entry.rank}-${entry.name}-${entry.createdAt}`}
                aria-current={entry.isYou ? "true" : undefined}
                className={`flex items-center gap-2 px-3 py-1.5 font-mono ${
                  entry.isYou ? "bg-[#06b6d4]/10 text-[#06b6d4]" : "text-[#ededed]"
                }`}
              >
                <span className="w-5 text-right tabular-nums">{entry.rank}</span>
                <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                {entry.seconds !== undefined ? (
                  <span className="text-[#a1a1aa] tabular-nums">{clock(entry.seconds)}</span>
                ) : null}
                <span className="tabular-nums">{entry.score}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      {you && !youShown ? (
        <p className="font-mono text-[11px] text-[#a1a1aa]">
          {fmt(T.daily_your_best, { rank: you.rank, score: you.score })}
        </p>
      ) : null}
    </section>
  );
}
