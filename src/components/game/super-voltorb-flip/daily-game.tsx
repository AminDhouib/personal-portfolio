"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { sfx, stopGameOver, stopLevelWin } from "./audio";
import { isRoundLive } from "./play-rules";
import { MemoBar, type MemoFlag, type MemoFlagSet } from "./memo-button";
import { useMemoUndo } from "./use-memo-undo";
import { DailyPanel } from "./daily-panel";
import { useDailyRound } from "./use-daily-round";
import type { DailyOutcome } from "./daily-store";
import { Gameboard } from "./gameboard";
import { Footer } from "./footer";

/**
 * The Daily screen. It renders three grid children (header and memo bar, board,
 * panel) so the root's grid places them like the main game and a phone stacks
 * them in order. There is no odds assist here: nothing on this screen reads the
 * setting, so a Daily board never shows odds and a Daily round is never assisted.
 */
export function DailyGame({
  muted,
  memoUndoEnabled,
  memoFlags,
  onToggleMemo,
  onClearMemo,
  overlayOpen,
  registerUndo,
  onOutcome,
  onFirstInteraction,
  onExit,
  streak,
}: {
  muted: boolean;
  memoUndoEnabled: boolean;
  memoFlags: MemoFlagSet;
  onToggleMemo: (f: MemoFlag) => void;
  onClearMemo: () => void;
  overlayOpen: boolean;
  registerUndo: (fn: (() => void) | null) => void;
  onOutcome: (outcome: DailyOutcome, dayKey: string, coins: number) => void;
  onFirstInteraction: () => void;
  onExit: () => void;
  streak: (dayKey: string) => number;
}) {
  const d = useDailyRound({ onOutcome });
  // Its own history, so the paused main round keeps the one it had.
  const { canUndo, record: recordMemo, undo: undoMemoStack } = useMemoUndo();
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Held by a risk fanfare (reported by Gameboard): no undo while the board is locked.
  const [locked, setLocked] = useState(false);
  const live = isRoundLive(d.game.gameStatus);

  const undo = useCallback(() => {
    if (!memoUndoEnabled || !live || locked) return;
    if (undoMemoStack(d.game, d.updateGame) && !muted) void sfx.memoToggle();
  }, [memoUndoEnabled, live, locked, undoMemoStack, d.game, d.updateGame, muted]);

  // The root's Ctrl/Cmd+Z handler calls whatever is registered here.
  useEffect(() => {
    registerUndo(undo);
    return () => registerUndo(null);
  }, [registerUndo, undo]);

  // Entering and leaving start from a clean memo selection, a Daily round's
  // game-over jingle must not outlive the screen, and focus lands on the heading.
  useEffect(() => {
    onClearMemo();
    headingRef.current?.focus();
    return () => {
      onClearMemo();
      stopGameOver();
      stopLevelWin();
    };
    // Mount and unmount only; the callbacks are recreated every render by the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="order-1 flex w-full flex-col gap-2 lg:col-start-1 lg:row-start-1 lg:w-[360px]">
        <div className="flex items-center gap-2 rounded-[6px] border-2 border-gray-300 bg-white px-2 py-1 text-gray-700 outline outline-2 outline-gray-600">
          <div className="min-w-0 flex-1 leading-tight">
            <h2 ref={headingRef} tabIndex={-1} className="text-base font-bold outline-none">
              Daily board
            </h2>
            <p className="text-xs text-gray-500">{d.dayKey} (UTC), Lv.5, no odds assist</p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-[6px] border-2 border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 outline outline-2 outline-gray-600 hover:bg-zinc-200 focus-visible:outline-[#ef2020]"
          >
            Back to the game
          </button>
        </div>
        <MemoBar
          activeFlags={memoFlags}
          onToggle={onToggleMemo}
          onClear={onClearMemo}
          onUndo={memoUndoEnabled ? undo : undefined}
          canUndo={canUndo && !overlayOpen && live && !locked}
          size={44}
          showLabel={false}
          fullWidth
          spread
        />
      </div>
      <div
        data-daily-board
        className="order-2 flex flex-col items-center gap-2 lg:col-start-2 lg:row-span-2 lg:row-start-1"
      >
        <Gameboard
          game={d.game}
          updateGame={d.updateGame}
          waitForClick
          muted={muted}
          onFirstInteraction={onFirstInteraction}
          memoFlags={memoFlags}
          onMemoChange={memoUndoEnabled ? recordMemo : undefined}
          onLockChange={setLocked}
          daily={{
            restored: d.restored,
            idleLine: d.restored
              ? "Today's board is done. See you at 00:00 UTC."
              : "One board a day. Flip carefully.",
            onFlipped: d.onFlipped,
            onFinished: () => {},
          }}
        />
        <Footer />
      </div>
      <div className="order-3 w-full lg:col-start-1 lg:row-start-2 lg:w-[360px]">
        <DailyPanel
          dayKey={d.dayKey}
          outcome={d.outcome}
          score={d.score}
          handle={d.handle}
          submitted={d.submitted}
          submitState={d.submitState}
          rank={d.rank}
          streak={streak(d.dayKey)}
          entries={d.leaderboard.entries}
          loading={d.leaderboard.loading}
          readError={d.leaderboard.readError}
          onPost={(name) => void d.post(name)}
        />
      </div>
    </>
  );
}
