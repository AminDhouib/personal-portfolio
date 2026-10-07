"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { utcDayKey } from "@/lib/arcade/boards";
import { useArcadeBoard } from "@/hooks/use-arcade-board";
import { DAILY_LEVEL, dailyBoard, dayNumber, type DailyBoard } from "./daily-board";
import {
  HANDLE_MAX,
  freshDaily,
  loadDaily,
  saveDaily,
  type DailyOutcome,
  type DailyRound,
} from "./daily-store";
import { VoltorbFlip, cloneGame } from "./engine";

export type DailySubmitState = "idle" | "sending" | "sent" | "failed" | "rejected" | "closed";

function replay(board: DailyBoard, round: DailyRound): VoltorbFlip {
  const game = VoltorbFlip.daily(board.boardId, board.layout, DAILY_LEVEL);
  for (const index of round.flips) game.flipCell(Math.floor(index / 5), index % 5);
  if (round.outcome === "quit") game.quit();
  return game;
}

function outcomeOf(game: VoltorbFlip): DailyOutcome | null {
  const status = game.gameStatus;
  if (status === "win") return "won";
  if (status === "lose") return "lost";
  return status === "quit" ? "quit" : null;
}

/** Coins a finished board banked: a win and a quit pay what was collected, a loss pays nothing. */
function banked(game: VoltorbFlip, outcome: DailyOutcome | null): number {
  return outcome === "won" || outcome === "quit" ? game.currentScore : 0;
}

/**
 * One attempt at today's Daily board. The day is fixed when the hook mounts (UTC),
 * the attempt is the saved list of flips (a reload replays it, so it never
 * rerolls), and the outcome is saved the moment the round ends. `onOutcome`
 * fires once per live finish, never for a board restored finished.
 */
export function useDailyRound({
  onOutcome,
}: {
  onOutcome: (outcome: DailyOutcome, dayKey: string, coins: number) => void;
}) {
  const [start] = useState(() => {
    const dayKey = utcDayKey(new Date());
    const board = dailyBoard(dayKey);
    const stored = loadDaily();
    const round =
      stored && stored.day === dayKey ? stored : freshDaily(dayKey, stored?.handle ?? "");
    return { dayKey, board, round, game: replay(board, round) };
  });
  const [game, setGame] = useState(start.game);
  const roundRef = useRef(start.round);
  // Derived from the board: a restored finish replays to the same status.
  const outcome = outcomeOf(game);
  const [handle, setHandle] = useState(start.round.handle);
  const [submitted, setSubmitted] = useState(start.round.submitted);
  const [submitState, setSubmitState] = useState<DailySubmitState>(
    start.round.submitted ? "sent" : "idle",
  );
  const [rank, setRank] = useState<number | null>(null);
  const restored = start.round.outcome !== null;
  const onOutcomeRef = useRef(onOutcome);
  // Declared before the outcome effect below, so it runs first and the latest callback is read.
  useEffect(() => {
    onOutcomeRef.current = onOutcome;
  });
  const leaderboard = useArcadeBoard("super-voltorb-flip", { period: "daily" });
  const { submit, refresh } = leaderboard;

  const persist = useCallback((patch: Partial<DailyRound>) => {
    roundRef.current = { ...roundRef.current, ...patch };
    saveDaily(roundRef.current);
  }, []);

  // Same shape as the main game's updateGame: clone, mutate, replace.
  function updateGame(callback: (g: VoltorbFlip) => void): void {
    const next = cloneGame(game);
    callback(next);
    setGame(next);
  }

  /** Called by Gameboard when a flip commits; the saved order is what a reload replays. */
  const onFlipped = useCallback(
    (row: number, col: number) => {
      persist({ flips: [...roundRef.current.flips, row * 5 + col] });
    },
    [persist],
  );

  useEffect(() => {
    if (roundRef.current.outcome !== null) return;
    const next = outcomeOf(game);
    if (next === null) return;
    persist({ outcome: next });
    onOutcomeRef.current(next, start.dayKey, banked(game, next));
  }, [game, persist, start.dayKey]);

  const score = banked(game, outcome);
  // Safe tiles flipped: what the server's flip bound counts (a Voltorb is not a flip).
  const flips = game.cells.flat().filter((c) => c.isFlipped && c.value !== "V").length;

  async function post(name: string) {
    if (outcome === null || score <= 0 || submitted) return;
    if (submitState === "sending") return;
    // The server only takes today's board by ITS clock; a round that ran past
    // 00:00 UTC has nowhere to go (DESIGN.md: no grace window).
    if (utcDayKey(new Date()) !== start.dayKey) {
      setSubmitState("closed");
      return;
    }
    const cleaned = name.trim().slice(0, HANDLE_MAX) || "Player";
    setSubmitState("sending");
    persist({ handle: cleaned });
    setHandle(cleaned);
    const result = await submit({
      name: cleaned,
      score,
      day: dayNumber(start.dayKey),
      flips,
    });
    if (result.ok) {
      const mine = result.boards?.find((b) => b.period === "daily")?.rank ?? result.rank ?? null;
      setRank(mine);
      persist({ submitted: true });
      setSubmitted(true);
      setSubmitState("sent");
      void refresh();
    } else if (result.rejected) {
      setSubmitState("rejected");
    } else {
      setSubmitState("failed");
    }
  }

  return {
    dayKey: start.dayKey,
    board: start.board,
    game,
    updateGame,
    onFlipped,
    outcome,
    score,
    flips,
    restored,
    handle,
    submitted,
    submitState,
    rank,
    post,
    leaderboard,
  };
}
