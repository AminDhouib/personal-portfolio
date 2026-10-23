"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useEffectsTheme } from "./effects/context";
import { sfx, playLevelWin } from "./audio";
import { LEVEL_WIN_MS, RISK_WARNING_MS } from "./sound-cues";
import { QuitConfirm } from "./quit-confirm";
import { RoundResult, type RoundResultProps } from "./round-result";
import { useUnmountTimers } from "./use-unmount-timers";
import { isTextEntryTarget } from "../text-entry";
import { isRoundLive, isRoundOver, tileRisk } from "./play-rules";
import { isCursorKey, memoKeyFlag, moveCursor, type Cursor } from "./cursor";
import { type MemoFlag, type MemoFlagSet } from "./memo-button";
import { type MemoChange } from "./memo-undo";
import { tileOddsView } from "./odds-input";
import { type Odds } from "./use-odds";
import { VOLTORB_FACE_SCALE } from "./art/original-sprites";
import { VoltorbSprite } from "./art/voltorb-sprite";
import { VoltorbFlip, indexToCoordinate } from "./engine";
import { Card } from "./card";
import { RowColCard } from "./row-col-card";

// ---------------------------------------------------------------------------
// src/components/Gameboard.tsx (1:1 port).
// ---------------------------------------------------------------------------

type GameboardProps = {
  game: VoltorbFlip;
  updateGame: (callback: (game: VoltorbFlip) => void) => void;
  waitForClick: boolean;
  muted: boolean;
  onFirstInteraction: () => void;
  memoFlags: MemoFlagSet;
  peek?: boolean;
  /**
   * Called after the level-win fanfare finishes (or after an equivalent
   * silent delay when muted), BEFORE flipCardsDown runs. Returns a
   * Promise that resolves once the parent's payout sequence has finished
   * — counter scrolling + drain SE chain. Gameboard awaits the promise
   * so the cards stay revealed while the parent animates the score
   * cards.
   */
  runPostFanfare?: () => Promise<void>;
  /**
   * Fired right before flipCardsDown begins so the parent can flash the
   * Lv card with the level-up / level-down SE in time with the cards
   * folding away (rather than after the new round has already loaded).
   */
  onFlipDownStart?: (dir: "up" | "down") => void;
  /** Called for every memo toggle (tap or key) so the parent can offer undo. */
  onMemoChange?: (change: MemoChange) => void;
  /** Reports whether the board is held by the quit confirmation or a risk fanfare. */
  onLockChange?: (locked: boolean) => void;
  /** Odds assist answer for the live board; null while off, unsolved or the round is over. */
  odds?: Odds | null;
  /** Whether the round that just ended was played with the odds assist (for the banner). */
  isAssisted?: () => boolean;
  /**
   * Daily board mode: the board is a fixed layout that is never redealt. `restored`
   * is a finished board shown again after a reload (revealed, no end sequence).
   */
  daily?: {
    restored: boolean;
    idleLine: string;
    onFlipped: (row: number, col: number) => void;
    onFinished: () => void;
  };
};

type ActiveEffect = {
  id: number;
  kind: "bomb" | "coin";
  row: number;
  col: number;
  onDone: () => void;
};

// What each card shows: the cell's own flipped state, or revealed on a restored Daily board.
const cardsOf = (game: VoltorbFlip, restored: boolean | undefined) =>
  game.cells.flat().map((cell) => ({ isFlipped: restored ? true : cell.isFlipped }));

export const Gameboard = ({
  game,
  updateGame,
  waitForClick,
  muted,
  onFirstInteraction,
  memoFlags,
  peek = false,
  runPostFanfare,
  onFlipDownStart,
  onMemoChange,
  onLockChange,
  odds,
  isAssisted,
  daily,
}: GameboardProps) => {
  // Every timer of the round-end flow (reveal, fold-down, risk release) dies with the board.
  const { later, cancel } = useUnmountTimers();
  const [cardsFlipped, setCardsFlipped] = useState<{ isFlipped: boolean }[]>(() =>
    cardsOf(game, daily?.restored),
  );
  // The cards follow the engine's cells: a new game object (every update clones it, a restart
  // deals a new board) or a restored Daily board re-reads them.
  const [seenCells, setSeenCells] = useState({ cells: game.cells, restored: daily?.restored });
  if (seenCells.cells !== game.cells || seenCells.restored !== daily?.restored) {
    setSeenCells({ cells: game.cells, restored: daily?.restored });
    setCardsFlipped(cardsOf(game, daily?.restored));
  }
  const [effects, setEffects] = useState<ActiveEffect[]>([]);
  // True from the first frame of the flip-down until the next board is dealt:
  // the old round's memos must not show on the face-down tiles in between.
  const [flipDownStarted, setFlipDownStarted] = useState(false);
  const theme = useEffectsTheme();
  const nextId = useRef(0);
  // Tile being announced by the risk fanfare. Renders the anxious shake
  // and gates handleFlip so no other tap can land while it's playing.
  const [warningTile, setWarningTile] = useState<{ row: number; col: number } | null>(null);
  const warningTileRef = useRef<{ row: number; col: number } | null>(null);
  // The Daily board saves a flip when it commits. A risk hold that is still pending when the board
  // unmounts (Back to the game) is saved here, at once, so leaving cannot undo a warned tile: the
  // timer that would have committed it is cleared with the component. Storage only, no state.
  const dailyRef = useRef(daily);
  useEffect(() => {
    dailyRef.current = daily;
  });
  useEffect(() => {
    return () => {
      const held = warningTileRef.current;
      if (held) dailyRef.current?.onFlipped(held.row, held.col);
    };
  }, []);
  // Keyboard cursor: the tile that holds the single tab stop. Real DOM focus
  // follows it, so the :focus-visible ring is the on-screen cursor.
  const [cursor, setCursor] = useState<Cursor>({ row: 0, col: 0 });
  // Last flip, spoken through a polite live region for screen readers.
  const [announcement, setAnnouncement] = useState("");
  const gridRef = useRef<HTMLDivElement | null>(null);
  const hintId = useId();
  // The board can be resized (debug panel) while this stays mounted; clamp so
  // exactly one tile always holds the tab stop.
  const lastIndex = game.cells.length - 1;
  const activeCursor: Cursor = {
    row: Math.min(cursor.row, lastIndex),
    col: Math.min(cursor.col, lastIndex),
  };

  // Round-end banner (win or lose). The flow waits on it: the banner button,
  // a pointerdown on the board, or Enter/Space/any printable key continues.
  const [roundResult, setRoundResult] = useState<Omit<RoundResultProps, "onContinue"> | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const [quitConfirmOpen, setQuitConfirmOpen] = useState(false);
  const quitButtonRef = useRef<HTMLButtonElement | null>(null);
  // Quit is only offered while a round is live: not during a risk fanfare, an
  // open confirmation, or the end-of-round sequence.
  const canQuit = isRoundLive(game.gameStatus) && !warningTile && !quitConfirmOpen;
  // Level shown while the round was live; the engine moves currentLevel the
  // instant the round ends, so the "from" side has to be remembered.
  const roundStartLevelRef = useRef(game.currentLevel);
  // Aborts the pending wait (and removes all its listeners) on resolve or unmount.
  const pendingWaitRef = useRef<AbortController | null>(null);
  const continueRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (isRoundLive(game.gameStatus)) {
      roundStartLevelRef.current = game.currentLevel;
    }
  }, [game.gameStatus, game.currentLevel]);

  useEffect(() => {
    return () => pendingWaitRef.current?.abort();
  }, []);

  const locked = quitConfirmOpen || warningTile !== null;
  useEffect(() => {
    onLockChange?.(locked);
  }, [locked, onLockChange]);

  function waitForUserInteraction() {
    pendingWaitRef.current?.abort();
    const controller = new AbortController();
    pendingWaitRef.current = controller;
    const { signal } = controller;
    return new Promise<void>((resolve) => {
      const done = () => {
        if (signal.aborted) return;
        controller.abort();
        pendingWaitRef.current = null;
        continueRef.current = null;
        resolve();
      };
      continueRef.current = done;
      frameRef.current?.addEventListener("pointerdown", done, { signal });
      document.addEventListener(
        "keydown",
        (e) => {
          if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
          // Never take keys meant for a text field elsewhere on the page.
          if (isTextEntryTarget(e)) return;
          if (e.key === "Enter" || e.key === " " || e.key.length === 1) done();
        },
        { signal },
      );
      // An unmount aborts the controller without resolving: the flow just
      // stops instead of animating a dead component.
    });
  }

  function handleFlip(row: number, col: number) {
    if (!game) return;
    // Once the round is settled (voltorb hit or all valuable coins found),
    // the board freezes until restartGame() runs from the win/lose flow.
    if (isRoundOver(game.gameStatus)) {
      return;
    }
    // The quit confirmation is modal over the board.
    if (quitConfirmOpen) return;
    // While ME_CARDGAME1 is announcing a high-risk tile, the board is
    // locked — only the targeted tile is "live" and it commits when the
    // delay below resolves. Mirrors voltorb_flip.c, which freezes input
    // for the duration of the fanfare.
    if (warningTileRef.current) return;
    const rowCells = game.cells[row];
    if (!rowCells) return; // provably never fires: row is always a valid grid index
    if (memoFlags.size > 0) {
      const cell = rowCells[col];
      if (!cell) return; // provably never fires: col is always a valid grid index
      // Tapping an already-revealed tile while memo is open does nothing
      // — same DP_BOX03 thunk as the non-memo case.
      if (cell.isFlipped) {
        if (!muted) void sfx.invalidTap();
        return;
      }
      // Apply the selected memo flag to the tile. memoFlags is radio
      // (≤1 entry) — voltorb_flip.c only ever toggles one flag per tap
      // (VoltorbFlip_TryToggleCardMemo takes a single memoId). The loop
      // is kept since flagCell already toggles, but it runs at most
      // once. HG/SS plays DP_BOX01 each time a memo flag lands on a tile.
      if (!muted) void sfx.memoToggle();
      for (const f of memoFlags) onMemoChange?.({ row, col, flag: f });
      updateGame((g) => {
        for (const f of memoFlags) g.flagCell(row, col, f);
      });
      return;
    }
    const cell = rowCells[col];
    if (!cell) return; // provably never fires: col is always a valid grid index
    // Already-flipped tile: HG/SS plays an "invalid action" thunk and
    // does nothing. Mirror that here.
    if (cell.isFlipped) {
      if (!muted) void sfx.invalidTap();
      return;
    }
    // Visual: voltorbs explode, every coin tile (1/2/3) sparkles.
    // Audio: HG/SS plays PANERU_MEKURU on every flip, and overlays
    // COIN_HAZURE (the buzzer) only when the revealed tile is a Voltorb.
    const kind: "bomb" | "coin" = cell.value === "V" ? "bomb" : "coin";
    // Risk pre-check — voltorb_flip.c:905 plays ME_CARDGAME1 when the
    // row/col still has ≥75% voltorb density among unflipped tiles.
    // We additionally suppress on deterministic rows/cols: a 0-voltorb
    // direction means the tile is a guaranteed coin, and a 100%-voltorb
    // direction means it's a guaranteed Voltorb — in either case the
    // outcome isn't "uncertain", so the warning would just feel wrong.
    const voltorbsInRow = game.rowValues[row]?.voltorbs ?? 0;
    const voltorbsInCol = game.colValues[col]?.voltorbs ?? 0;
    const { highRisk } = tileRisk(game.cells, voltorbsInRow, voltorbsInCol, row, col);

    onFirstInteraction();

    const commitFlip = () => {
      setAnnouncement(
        `Row ${row + 1}, Col ${col + 1}: ${cell.value === "V" ? "Voltorb" : cell.value}`,
      );
      if (theme) {
        const id = nextId.current++;
        const onDone = () => setEffects((prev) => prev.filter((x) => x.id !== id));
        setEffects((prev) => [...prev, { id, kind, row, col, onDone }]);
      }
      if (!muted) {
        void sfx.flip();
        if (kind === "bomb") {
          // Stagger the buzzer so the flip click is audible first.
          later(() => void sfx.voltorbPop(), 140);
        }
      }
      daily?.onFlipped(row, col);
      updateGame((g) => g.flipCell(row, col));
    };

    if (highRisk) {
      // Lock the board, shake the targeted tile, fire the fanfare, wait
      // for it to finish, then pause 500ms before committing the flip.
      // sfx.riskWarning() returns a promise that resolves when the cue ends
      // (RISK_WARNING_MS, with or without an AudioContext), so the reveal
      // lands cleanly after the fanfare; works for voltorb and coin tiles alike.
      warningTileRef.current = { row, col };
      setWarningTile({ row, col });
      const release = () => {
        warningTileRef.current = null;
        setWarningTile(null);
        commitFlip();
      };
      if (!muted) {
        void sfx.riskWarning().then(() => {
          later(release, 500);
        });
      } else {
        // Muted: wait out the same fanfare length plus the same 500ms beat so
        // timing stays consistent regardless of audio state.
        later(release, RISK_WARNING_MS + 500);
      }
      return;
    }

    commitFlip();
  }

  // Memo mark by keyboard: toggles one flag on a tile without touching the
  // memo-bar selection. Same gates as a tap (round over, quit dialog, risk hold).
  function toggleMemoAt(row: number, col: number, flag: MemoFlag) {
    if (isRoundOver(game.gameStatus)) {
      return;
    }
    if (quitConfirmOpen || warningTileRef.current) return;
    const cell = game.cells[row]?.[col];
    if (!cell) return;
    if (cell.isFlipped) {
      if (!muted) void sfx.invalidTap();
      return;
    }
    if (!muted) void sfx.memoToggle();
    onMemoChange?.({ row, col, flag });
    updateGame((g) => g.flagCell(row, col, flag));
  }

  // Board-scoped on purpose (React onKeyDown on the grid, not a document
  // listener): it only ever sees keys pressed while a tile has focus, so it
  // cannot take keys from the AI chat or any other field.
  function handleBoardKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTextEntryTarget(e.nativeEvent)) return;
    if (isCursorKey(e.key)) {
      e.preventDefault();
      const next = moveCursor(activeCursor, e.key, game.cells.length);
      if (next.row === activeCursor.row && next.col === activeCursor.col) return;
      setCursor(next);
      if (!muted) void sfx.cursorMove();
      gridRef.current?.querySelector<HTMLElement>(`[data-cell="${next.row}-${next.col}"]`)?.focus();
      return;
    }
    const flag = memoKeyFlag(e.key);
    if (flag === null || e.repeat) return;
    toggleMemoAt(activeCursor.row, activeCursor.col, flag);
  }

  const N = game.cells.length;

  const flipCardsUp = useCallback(() => {
    // HG/SS plays the panel-flip SE once at the start of RevealBoard_Main
    // (voltorb_flip.c:1077) — covers the win/lose whole-board reveal.
    if (!muted) void sfx.flip();
    return new Promise<void>((resolve) => {
      later(() => {
        setCardsFlipped((prev) => prev.map(() => ({ isFlipped: true })));
        resolve();
      }, 1000);
    });
  }, [muted, later]);

  const flipCardsDown = useCallback(
    (delay = 1500, onStart?: () => void) => {
      // Column c of an N-wide board is every index with index % N === c (`?size=N` and the
      // debug panel make boards 2 to 10 wide).
      const columns = Array.from({ length: N }, (_, col) =>
        Array.from({ length: N }, (_, row) => row * N + col),
      );

      later(() => {
        // Fire onStart at the exact frame the first column begins flipping
        // — keeps the level-up/down flash + SE in lockstep with the cards.
        onStart?.();
        setFlipDownStarted(true);
        let stagger = 0;
        for (let col = 0; col < N; col++) {
          later(() => {
            // PANERU_MEKURU once per column (not per card) — the cards in
            // a column flip together, so a single SE matches the visual.
            if (!muted) void sfx.flip();
            const activeColumn = columns[col];
            if (!activeColumn) return; // provably never fires: col < N === columns.length
            setCardsFlipped((prev) =>
              prev.map((card, index) =>
                activeColumn.includes(index) ? { isFlipped: false } : card,
              ),
            );
          }, stagger);
          stagger += 200;
        }
        later(() => {
          updateGame((g) => g.restartGame());
          setFlipDownStarted(false);
        }, stagger + 200);
      }, delay);
    },
    [updateGame, muted, later, N],
  );

  useEffect(() => {
    const status = game.gameStatus;
    if (status !== "win" && status !== "lose" && status !== "quit") return;
    if (daily?.restored) return;
    const fromLevel = roundStartLevelRef.current;
    const toLevel = game.currentLevel;
    const coins = game.currentScore;
    const dir: "up" | "down" = toLevel > fromLevel ? "up" : "down";

    // Round-end order follows voltorb_flip.c:
    //   win:  WinRound_Main (clear fanfare over the hidden board) -> AwardCoins_Main
    //         (payout) -> RevealBoard_Main -> wait for a press
    //   quit: QuitRound_Run goes to AwardCoins only when the payout is above 0,
    //         then the same reveal and wait
    //   lose: reveal -> wait (the game-over jingle plays from the parent)
    // Then the level flash fires with the first column folding down, and
    // flipCardsDown's restartGame deals the next board.
    void (async () => {
      if (status === "win") {
        // 1. Clear fanfare (or the silent equivalent) while the board is still hidden.
        await new Promise<void>((resolve) => {
          if (muted) {
            // Same length as the audible clear fanfare (the audio-timing contract).
            later(resolve, LEVEL_WIN_MS);
          } else {
            const fallback = later(resolve, 4000);
            playLevelWin(() => {
              cancel(fallback);
              resolve();
            });
          }
        });
      }
      // 2. Coin payout chain (BGM 64 + per-tick SE) lives in the parent.
      if ((status === "win" || status === "quit") && coins > 0 && runPostFanfare) {
        await runPostFanfare();
      }
      // 3. Reveal the whole board.
      await flipCardsUp();
      // 4. Wait for a press with the result banner up.
      if (waitForClick) {
        setRoundResult({
          kind: status,
          fromLevel,
          toLevel: daily ? fromLevel : toLevel,
          coins,
          assisted: daily ? false : isAssisted?.() === true,
          daily: daily !== undefined,
        });
        await waitForUserInteraction();
        setRoundResult(null);
      }
      // 5. A Daily board is never redealt: hand control back instead of folding
      //    the cards down and restarting. Everything else folds down as before.
      if (daily) {
        daily.onFinished();
        return;
      }
      //    Cards flip down with the level flash fired at the same frame as the
      //    first column, keeping SE and visual in lockstep.
      flipCardsDown(100, () => onFlipDownStart?.(dir));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gameStatus]);

  return (
    // The board plus the result slot under it; a tap anywhere here continues
    // a finished round.
    <div ref={frameRef} className="flex flex-col gap-2">
      <div
        className={`svf-board-frame ${peek ? "svf-peek" : ""} relative border-4 border-white bg-[#448563] p-1.5 shadow-[0_4px_0_rgba(0,0,0,0.18),0_8px_24px_rgba(0,0,0,0.25)] outline outline-2 outline-gray-600`}
        style={{ "--svf-n": N } as React.CSSProperties}
      >
        <p id={hintId} className="sr-only">
          Arrow keys move between tiles. Enter or Space flips a tile. Press 1, 2, 3 or V to mark a
          tile with a memo.
        </p>
        <p role="status" className="sr-only">
          {announcement}
        </p>
        <div className="flex h-full w-full rounded-xl bg-[#58a66c] p-1 sm:p-2">
          <div className="flex flex-col gap-[var(--svf-gap)]">
            <div className="flex gap-[var(--svf-gap)]">
              <div
                ref={gridRef}
                role="group"
                aria-label={`Board, ${N} by ${N}`}
                aria-describedby={hintId}
                onKeyDown={handleBoardKeyDown}
                className="relative grid gap-[var(--svf-gap)]"
                style={{
                  gridTemplateColumns: `repeat(${N}, var(--svf-tile))`,
                }}
              >
                {game.cells.flat().map((cell, i) => {
                  const coordinate = indexToCoordinate(i, N);
                  return (
                    <Card
                      key={i}
                      row={coordinate[0]}
                      col={coordinate[1]}
                      isFlipped={peek || cardsFlipped[i]?.isFlipped}
                      valueLabel={cell.value === "V" ? "Voltorb" : String(cell.value)}
                      tabIndex={
                        coordinate[0] === activeCursor.row && coordinate[1] === activeCursor.col
                          ? 0
                          : -1
                      }
                      cellId={`${coordinate[0]}-${coordinate[1]}`}
                      onFocus={() =>
                        setCursor((c) =>
                          c.row === coordinate[0] && c.col === coordinate[1]
                            ? c
                            : { row: coordinate[0], col: coordinate[1] },
                        )
                      }
                      flipCard={() => handleFlip(coordinate[0], coordinate[1])}
                      flags={peek || cell.isFlipped || flipDownStarted ? undefined : cell.flags}
                      odds={tileOddsView(odds, i, {
                        flipped: cell.isFlipped,
                        peek,
                        flipDown: flipDownStarted,
                      })}
                      warning={
                        warningTile?.row === coordinate[0] && warningTile?.col === coordinate[1]
                      }
                    >
                      {cell.value === "V" ? (
                        // The original Voltorb sprite (22 px, salmon face baked in), so the burst
                        // frames, which carry the same Voltorb, land exactly on it.
                        <VoltorbSprite
                          cssSize={`calc(var(--svf-tile) * ${VOLTORB_FACE_SCALE})`}
                          className="picture-outline voltorb"
                        />
                      ) : (
                        cell.value
                      )}
                    </Card>
                  );
                })}

                {game.colValues.map((col, index) => (
                  <RowColCard coins={col.coins} voltorbs={col.voltorbs} key={index} index={index} />
                ))}

                {theme &&
                  effects.map((e) => {
                    const Comp = e.kind === "bomb" ? theme.BombFlip : theme.CoinReveal;
                    return (
                      <div
                        key={e.id}
                        className="pointer-events-none absolute"
                        style={{
                          left: `calc(${e.col} * (var(--svf-tile) + var(--svf-gap)))`,
                          top: `calc(${e.row} * (var(--svf-tile) + var(--svf-gap)))`,
                          width: "var(--svf-tile)",
                          height: "var(--svf-tile)",
                          zIndex: 20,
                        }}
                      >
                        <Comp row={e.row} col={e.col} onDone={e.onDone} />
                      </div>
                    );
                  })}
              </div>
              <div className="flex flex-col gap-[var(--svf-gap)]">
                {game.rowValues.map((row, index) => (
                  <RowColCard coins={row.coins} voltorbs={row.voltorbs} key={index} index={index} />
                ))}
              </div>
            </div>
          </div>
        </div>
        {quitConfirmOpen && (
          <QuitConfirm
            coins={game.currentScore}
            onCancel={() => {
              setQuitConfirmOpen(false);
              // The button is disabled while the confirmation is open; focus it once it is live again.
              later(() => quitButtonRef.current?.focus(), 0);
            }}
            onConfirm={() => {
              setQuitConfirmOpen(false);
              updateGame((g) => g.quit());
            }}
          />
        )}
      </div>
      {/* The round result sits under the board, never over it: at the end of
          a round every tile is face up and the whole board is worth reading.
          The idle line holds the slot's height so the page does not jump when
          the banner appears, and w-0 min-w-full keeps the slot to the board's
          width instead of letting long text widen the column. */}
      <div className="w-0 min-w-full">
        {roundResult ? (
          <RoundResult {...roundResult} onContinue={() => continueRef.current?.()} />
        ) : (
          <div className="rounded-5 flex min-h-[72px] items-center gap-2 border-2 border-gray-300 bg-white px-3 text-sm text-gray-600 outline outline-2 outline-gray-600 sm:min-h-[60px] sm:text-base">
            <p className="min-w-0 flex-1">
              {daily?.idleLine ?? "Flip the cards and collect coins!"}
            </p>
            <button
              ref={quitButtonRef}
              type="button"
              disabled={!canQuit}
              onClick={() => setQuitConfirmOpen(true)}
              className="min-h-11 min-w-11 shrink-0 cursor-pointer rounded-[6px] border-2 border-gray-300 bg-white px-3 text-sm font-bold text-gray-700 outline outline-2 outline-gray-600 focus-visible:outline-[#ef2020] disabled:cursor-default disabled:opacity-50"
            >
              Quit
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
