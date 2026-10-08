"use client";

import { useCallback, useEffect, useState } from "react";
import { useArcadeBoard } from "@/hooks/use-arcade-board";
import { utcDayKey } from "@/lib/arcade/boards";
import { dayNumber } from "./engine/daily";
import { HANDLE_MAX, type DailyBest } from "./daily-store";

export type SubmitState = "idle" | "sending" | "sent" | "failed" | "rejected" | "closed";

export interface DailyTextOptions {
  /** The UTC day the text was drawn for, "YYYY-MM-DD"; fixed when the Daily view opened. */
  day: string;
  /** The best attempt of that day, or null before any countable attempt. */
  best: DailyBest | null;
  /** The WPM the board last accepted for that day, or null. */
  posted: number | null;
  onPosted: (wpm: number, handle: string) => void;
}

/**
 * Today's board and the Post flow for the best daily attempt. Mounted only while the Daily
 * view is open, so the board is read then and never on page load. Posting is by hand: the
 * UTC day is rechecked at Post, and a day that has turned over (seen there, or by a 422)
 * is `closed`, never a retryable failure.
 */
export function useDailyText({ day, best, posted, onPosted }: DailyTextOptions) {
  const board = useArcadeBoard("typing-speed", { fetchOnMount: false, period: "daily" });
  const [state, setState] = useState<SubmitState>("idle");
  // The WPM the last Post was for: a better attempt afterwards makes Post available again.
  const [sentFor, setSentFor] = useState<number | null>(null);
  const [rank, setRank] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  // False until the first read has settled, so no paint claims an empty board early.
  const [requested, setRequested] = useState(false);

  const stale = state !== "closed" && state !== "sending" && sentFor !== (best?.wpm ?? null);
  const base: SubmitState = stale ? "idle" : state;
  const status: SubmitState =
    base === "idle" && best !== null && posted !== null && posted >= best.wpm ? "sent" : base;

  const { submit, refresh } = board;

  useEffect(() => {
    void refresh().then(() => setRequested(true));
  }, [refresh]);

  const close = useCallback(() => {
    setState("closed");
    setNotice("Today's text has closed.");
  }, []);

  const post = useCallback(
    async (name: string) => {
      if (best === null || status === "sending" || status === "sent" || status === "closed") return;
      if (utcDayKey(new Date()) !== day) {
        close();
        return;
      }
      const typed = name.trim().slice(0, HANDLE_MAX);
      setState("sending");
      setSentFor(best.wpm);
      const result = await submit({
        name: typed || "Typist",
        score: best.wpm,
        day: dayNumber(day),
        ms: best.ms,
        chars: best.chars,
        acc: best.acc,
      });
      if (result.ok) {
        const dailyRank = result.boards?.find((b) => b.period === "daily")?.rank ?? null;
        setRank(dailyRank);
        setState("sent");
        setNotice(dailyRank === null ? "Posted." : `Posted. Rank ${dailyRank} today.`);
        onPosted(best.wpm, typed);
        await refresh();
      } else if (result.rejected) {
        // A 422 after the UTC day turned over is the text closing, not a bad run.
        if (utcDayKey(new Date()) !== day) {
          close();
        } else {
          setState("rejected");
          setNotice("Run not accepted.");
        }
      } else {
        setState("failed");
        setNotice(
          result.identityReset ? "Player id reset, post again." : "Board unreachable, try again.",
        );
      }
    },
    [best, status, day, submit, refresh, onPosted, close],
  );

  return { ...board, requested, status, rank, notice, post };
}
