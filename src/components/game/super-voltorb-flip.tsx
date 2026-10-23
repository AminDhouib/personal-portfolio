"use client";

/**
 * Super Voltorb Flip — 1:1 port of https://github.com/jv-vogler/voltorb-flip
 * Copyright (c) 2023 João Vogler. Licensed under MIT.
 * See upstream LICENSE (https://github.com/jv-vogler/voltorb-flip/blob/main/LICENSE).
 *
 * Modifications by <amin dhouib@outlook.com>:
 * - Next.js 16 / portfolio codebase integration
 * - All art and sound are original: pixel sprites drawn as text in
 *   super-voltorb-flip/art/, sound effects synthesized in
 *   super-voltorb-flip/sound-cues.ts. No sprite or audio from the Pokemon
 *   games or from upstream's asset folder ships.
 * - Fonts shipped under public/games/voltorb-flip/fonts/.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { EffectsProvider } from "./super-voltorb-flip/effects/context";
import {
  sfx,
  playMusic,
  stopMusic,
  fadeOutMusic,
  playGameOver,
  stopGameOver,
  stopLevelWin,
  stopAllCues,
  setMusicMuted,
} from "./super-voltorb-flip/audio";
import { useMute } from "./super-voltorb-flip/use-mute";
import { useUnmountTimers } from "./super-voltorb-flip/use-unmount-timers";
import { isTextEntryTarget } from "./text-entry";
import { numberFont, pokemonFont, scoreFont } from "./super-voltorb-flip/fonts";
import { SCOPED_STYLES } from "./super-voltorb-flip/scoped-styles";
import { useGame } from "./super-voltorb-flip/use-game";
import { usePayoutDisplay } from "./super-voltorb-flip/use-payout-display";
import { useProgressPersistence } from "./super-voltorb-flip/use-progress-persistence";
import { afterPageLoad } from "./super-voltorb-flip/startup";
import { isRoundLive, padDigits, roundStatsResult } from "./super-voltorb-flip/play-rules";
import { MemoBar, type MemoFlag, type MemoFlagSet } from "./super-voltorb-flip/memo-button";
import { isUndoKey, type MemoChange } from "./super-voltorb-flip/memo-undo";
import { useMemoUndo } from "./super-voltorb-flip/use-memo-undo";
import { useSettings } from "./super-voltorb-flip/use-settings";
import { useOdds } from "./super-voltorb-flip/use-odds";
import { useStats } from "./super-voltorb-flip/use-stats";
import { activeStreak } from "./super-voltorb-flip/stats";
import type { DailyOutcome } from "./super-voltorb-flip/daily-store";
import { utcDayKey } from "@/lib/arcade/boards";
import {
  clockSeconds,
  endClock,
  newRoundClock,
  pauseClock,
  resumeClock,
  startClock,
} from "./super-voltorb-flip/round-clock";
import { ModeRow } from "./super-voltorb-flip/mode-row";
import { SettingsPanel } from "./super-voltorb-flip/settings-panel";
import { StatsPanel } from "./super-voltorb-flip/stats-panel";
import { preloadOriginalSprites } from "./super-voltorb-flip/art/original-sprites";
import {
  CoinSpinner,
  InstructionsBtns,
  PixelMuteButton,
  PixelFullscreenButton,
  useFullscreen,
} from "./super-voltorb-flip/chrome";
import { DailyGame } from "./super-voltorb-flip/daily-game";
import { DebugPanel } from "./super-voltorb-flip/debug-panel";
import { Footer } from "./super-voltorb-flip/footer";
import { Gameboard } from "./super-voltorb-flip/gameboard";
import { InstructionsModal } from "./super-voltorb-flip/instructions-modal";
import { Scoreboard } from "./super-voltorb-flip/scoreboard";

// ---------------------------------------------------------------------------
// src/components/Settings.tsx (1:1 port).
// ---------------------------------------------------------------------------

// Settings panel (upstream's "wait for click" toggle) removed — upstream's
// default behavior is always-on in this portfolio build.

// ---------------------------------------------------------------------------
// Exported root component — mirrors upstream src/pages/index.tsx layout, but
// renders only the game panel (no full-screen background), matching the
// portfolio's per-game-page behavior.
// ---------------------------------------------------------------------------

// Static class strings (never built from parts): the Tailwind prettier plugin
// strips leading spaces inside template literals.
const MAIN_SHOWN = "contents";
const MAIN_HIDDEN = "hidden";

export function SuperVoltorbFlipGame() {
  const { game, updateGame, size, setGameSize } = useGame();
  // The payout drain, the game-over jingle delay and the level flash die with the game.
  const { later, sleep } = useUnmountTimers();
  const [peek, setPeek] = useState(false);
  const [muted, toggleMute] = useMute();
  const svfRootRef = useRef<HTMLDivElement | null>(null);
  const [fullscreenActive, toggleFullscreen] = useFullscreen(svfRootRef);
  // Hidden by default; revealed after 10 taps on the mute button (Konami-style
  // unlock so debug knobs aren't visible to normal players).
  const [debugVisible, setDebugVisible] = useState(false);
  const muteTapCountRef = useRef(0);
  const handleMuteToggle = () => {
    toggleMute();
    muteTapCountRef.current += 1;
    if (muteTapCountRef.current >= 10 && !debugVisible) {
      setDebugVisible(true);
    }
  };
  const [memoFlags, setMemoFlags] = useState<MemoFlagSet>(() => new Set<MemoFlag>());
  const toggleMemoFlag = (f: MemoFlag) => {
    // HG/SS plays DP_SELECT whenever the memo cursor changes button.
    if (!muted) void sfx.cursorMove();
    // Radio-style — voltorb_flip.c's VoltorbFlip_TryToggleCardMemo takes
    // exactly one memoId per tap. Picking a new button replaces the
    // previous selection; tapping the same one twice deselects it.
    setMemoFlags((prev) => {
      if (prev.has(f)) return new Set<MemoFlag>();
      return new Set<MemoFlag>([f]);
    });
  };
  const clearMemoFlags = useCallback(() => {
    // The "Back" pad button in the memo overlay (HG/SS DP_BUTTON3).
    if (!muted) void sfx.backButton();
    setMemoFlags(new Set<MemoFlag>());
  }, [muted]);
  const [howToPlayOpen, setHowToPlayOpen] = useState(false);
  const [settings, updateSettings] = useSettings();
  const odds = useOdds(game, settings.assist);
  const {
    stats,
    record: recordStats,
    recordDay: recordDayResult,
    reset: resetStats,
    raiseHighestLevel,
  } = useStats(settings.stats);
  const { canUndo, record: recordMemo, undo: undoMemoStack, reset: resetMemoUndo } = useMemoUndo();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  // Held by the quit confirmation or a risk fanfare (reported by Gameboard).
  const [boardLocked, setBoardLocked] = useState(false);
  // Visible time since the round's first action, for the Lv.8 statistic.
  const roundClockRef = useRef(newRoundClock());
  // Start level for the statistics. The level is read while the round is live
  // (the engine moves currentLevel the instant a round ends).
  const roundStartLevelRef = useRef<number>(1);
  // True once the odds assist was on at any point while this round was live.
  const assistedRoundRef = useRef(false);
  const musicStartedRef = useRef(false);
  const [mode, setMode] = useState<"play" | "daily">("play");
  const dailyUndoRef = useRef<(() => void) | null>(null);
  const returnFocusRef = useRef(false);
  const registerDailyUndo = useCallback((fn: (() => void) | null) => {
    dailyUndoRef.current = fn;
  }, []);

  const overlayOpen = settingsOpen || statsOpen || howToPlayOpen;
  // Undo is offered only while a memo could be made: a live round, no panel or
  // modal over the board, and no quit confirmation or risk fanfare holding it.
  // The main game's undo is off while the Daily screen is open (its board is hidden).
  const undoAllowed =
    mode === "play" &&
    settings.memoUndo &&
    !!game &&
    isRoundLive(game.gameStatus) &&
    !overlayOpen &&
    !boardLocked;
  // Only between rounds of the main game: a round-end sequence is mid-flight otherwise.
  const canSwitchMode = !!game && isRoundLive(game.gameStatus) && !boardLocked;

  const undoMemo = useCallback(() => {
    if (!undoAllowed || !game) return;
    if (undoMemoStack(game, updateGame) && !muted) void sfx.memoToggle();
  }, [undoAllowed, game, undoMemoStack, updateGame, muted]);

  const handleMemoChange = useCallback(
    (change: MemoChange) => {
      roundClockRef.current = startClock(roundClockRef.current, Date.now(), document.hidden);
      if (settings.memoUndo) recordMemo(change);
    },
    [settings.memoUndo, recordMemo],
  );

  // Switching statistics off closes their panel, so switching them back on does
  // not pop it open again.
  function changeSettings(patch: Partial<typeof settings>) {
    if (patch.stats === false) setStatsOpen(false);
    updateSettings(patch);
  }

  // On .svf-root (React onKeyDown), not on document: it only hears keys pressed
  // while focus is inside the game, so the AI chat and every other field keep
  // theirs, and the text-field guard is a second belt.
  function handleRootKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.defaultPrevented || !isUndoKey(e)) return;
    if (isTextEntryTarget(e.nativeEvent)) return;
    if (mode === "daily") {
      if (!settings.memoUndo || overlayOpen) return;
      e.preventDefault();
      dailyUndoRef.current?.();
      return;
    }
    if (!undoAllowed) return;
    e.preventDefault();
    undoMemo();
  }

  // Everything the main game's status effect does for a finished round, for the
  // Daily board: the jingle, then the day into the statistics and the streak.
  // A loss is neutral for the streak, and so is a quit with no coins.
  const handleDailyOutcome = useCallback(
    (outcome: DailyOutcome, dayKey: string, coins: number) => {
      if (outcome === "lost") {
        fadeOutMusic(350);
        later(() => {
          if (!muted) playGameOver();
        }, 320);
      } else {
        fadeOutMusic(250);
      }
      recordDayResult(dayKey, outcome === "won" || (outcome === "quit" && coins > 0));
    },
    [muted, recordDayResult, later],
  );

  const exitDaily = useCallback(() => {
    stopGameOver();
    stopLevelWin();
    setMode("play");
    returnFocusRef.current = true;
    if (!muted && game && musicStartedRef.current) playMusic(game.currentLevel);
  }, [muted, game]);

  // After Back, focus returns to the Daily button that opened the screen (the
  // visible one: the phone and desktop columns each render a mode row).
  useEffect(() => {
    if (mode !== "play" || !returnFocusRef.current) return;
    returnFocusRef.current = false;
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("[data-daily-open]"));
    (buttons.find((b) => b.getClientRects().length > 0) ?? buttons[0])?.focus();
  }, [mode]);

  useEffect(() => {
    setMusicMuted(muted);
  }, [muted]);

  // The first bomb of a visit should not stall on eleven network round trips.
  useEffect(() => {
    preloadOriginalSprites();
  }, []);

  useEffect(() => {
    return () => {
      stopMusic();
      stopGameOver();
      stopLevelWin();
      stopAllCues();
      musicStartedRef.current = false;
    };
  }, []);

  // Pause music when the tab becomes hidden; don't auto-resume on return.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      if (document.hidden) {
        // Fully stop music (not just pause) when tab loses focus. This prevents
        // music from continuing to play in the background on some browsers, and
        // ensures the next game session starts fresh without auto-resuming.
        stopMusic();
        musicStartedRef.current = false;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const {
    displayTotal,
    displayCurrent,
    displayLevel,
    levelDir,
    runPostFanfare,
    triggerLevelTransition,
  } = usePayoutDisplay({ game, muted, later, sleep });

  const hydrated = useProgressPersistence(game, updateGame, raiseHighestLevel);

  // Reset memo mode + drive music/game-over audio on status transitions.
  // restartGame sets status back to "playing" after cards flip down.
  const prevGameStatusRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!game) return;
    const prev = prevGameStatusRef.current;
    const cur = game.gameStatus;
    let clearMemoTimer: number | null = null;

    if (cur === "lose" && prev !== "lose") {
      // Fade the loop fast, then the game_over jingle plays over the reveal.
      fadeOutMusic(350);
      later(() => {
        if (!muted) playGameOver();
      }, 320);
    }
    if ((cur === "win" && prev !== "win") || (cur === "quit" && prev !== "quit")) {
      // Fade the loop so the clear fanfare plays cleanly (a quit fades too, so
      // the payout is not played over the loop); Gameboard handles actually
      // starting the clear fanfare.
      fadeOutMusic(250);
    }
    if ((prev === "win" || prev === "lose" || prev === "quit") && cur === "playing") {
      resetMemoUndo();
      assistedRoundRef.current = false;
      clearMemoTimer = window.setTimeout(() => clearMemoFlags(), 0);
      stopGameOver();
      stopLevelWin();
      if (!muted) {
        musicStartedRef.current = true;
        playMusic(game.currentLevel);
      }
    }
    if (cur === "playing" || cur === "memo") roundStartLevelRef.current = game.currentLevel;
    if (cur === "playing" && prev !== "playing" && prev !== "memo") {
      roundClockRef.current = newRoundClock();
    }
    if ((cur === "win" || cur === "lose" || cur === "quit") && prev !== cur) {
      // The round is over: nothing left to undo, and the old board is still
      // flipping down while the Undo button would otherwise stay live.
      resetMemoUndo();
      const now = Date.now();
      recordStats({
        ...roundStatsResult(cur, game.currentScore),
        level: roundStartLevelRef.current,
        levelAfter: game.currentLevel,
        assisted: assistedRoundRef.current,
        seconds: clockSeconds(roundClockRef.current, now),
      });
      roundClockRef.current = endClock(roundClockRef.current, now);
    }
    prevGameStatusRef.current = cur;

    return () => {
      if (clearMemoTimer) window.clearTimeout(clearMemoTimer);
    };
  }, [game, game?.gameStatus, muted, clearMemoFlags, resetMemoUndo, recordStats, later]);

  // A round is assisted if the odds assist was on at any point while it was
  // live; switching it off mid-round does not clean the round. It must be
  // declared AFTER the status effect: on the commit that deals a new round that
  // effect clears the flag first and this one re-marks it. Turning the assist on
  // while the result banner is up affects the next round, not the one just over.
  useEffect(() => {
    if (!game) return;
    const live = isRoundLive(game.gameStatus);
    if (live && settings.assist) assistedRoundRef.current = true;
  }, [game, game?.gameStatus, settings.assist]);

  // The level the next loop should be picked for. A ref, not an effect
  // dependency: a level change mid-round (the win moves it at once) must not
  // restart the music over the clear fanfare.
  const levelRef = useRef(1);
  useEffect(() => {
    levelRef.current = game?.currentLevel ?? 1;
  }, [game?.currentLevel]);

  // Visible time only: a hidden tab banks the running stretch and stops counting.
  useEffect(() => {
    function onVisibility() {
      const now = Date.now();
      roundClockRef.current = document.hidden
        ? pauseClock(roundClockRef.current, now)
        : resumeClock(roundClockRef.current, now);
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  function handleFirstInteraction() {
    roundClockRef.current = startClock(roundClockRef.current, Date.now(), document.hidden);
    if (!musicStartedRef.current && !muted) {
      musicStartedRef.current = true;
      playMusic(levelRef.current);
    }
  }

  // Try autoplay once the page has loaded, so the MP3 fetch does not compete
  // with the page's own render (it used to start the moment progress hydrated).
  // A first tile flip before the load event starts the loop itself through
  // handleFirstInteraction; playMusic is a no-op for a track that is already
  // loaded. If the browser rejects autoplay, audio.ts retries on the first
  // gesture (pointer or key), so musicStartedRef no longer strands the loop.
  useEffect(() => {
    if (muted || !hydrated) return;
    return afterPageLoad(() => {
      // A tab opened in the background still fires load; the hidden-tab stop
      // only reacts to a change, so do not start the loop for a hidden page.
      if (document.hidden) return;
      musicStartedRef.current = true;
      playMusic(levelRef.current);
    });
  }, [muted, hydrated]);

  return (
    <>
      {debugVisible && (
        <DebugPanel
          size={size}
          onSizeChange={setGameSize}
          onWinLevel={() => updateGame((g) => g.debugWinLevel())}
          peek={peek}
          onPeekToggle={() => setPeek((v) => !v)}
        />
      )}
      <EffectsProvider>
        <div
          ref={svfRootRef}
          className={`svf-root relative ${pokemonFont.variable} ${numberFont.variable} ${scoreFont.variable} ${pokemonFont.className} flex flex-col items-center p-1 text-white sm:p-2 lg:grid lg:grid-cols-[auto_1fr] lg:items-start lg:gap-4`}
          onKeyDown={handleRootKeyDown}
        >
          <style>{SCOPED_STYLES}</style>

          {howToPlayOpen && <InstructionsModal language="en" setModalOpen={setHowToPlayOpen} />}
          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onChange={changeSettings}
              onClose={() => setSettingsOpen(false)}
            />
          )}
          {statsOpen && settings.stats && (
            <StatsPanel
              stats={stats}
              today={utcDayKey(new Date())}
              onReset={resetStats}
              onClose={() => setStatsOpen(false)}
            />
          )}

          {/* The Daily board replaces the two columns below while it is open; they
            stay mounted (hidden) so the main round and its state survive the trip. */}
          <div className={mode === "play" ? MAIN_SHOWN : MAIN_HIDDEN}>
            {/* Desktop / tablet left column (sm+ only). Holds everything except
            the board so the right column can devote full width to tiles. */}
            <div className="hidden flex-col items-center gap-2 lg:flex">
              <div className="flex w-full items-center gap-2">
                <InstructionsBtns onOpen={() => setHowToPlayOpen(true)} />
                <PixelMuteButton muted={muted} onToggle={handleMuteToggle} size={44} />
                <PixelFullscreenButton
                  active={fullscreenActive}
                  onToggle={toggleFullscreen}
                  size={44}
                />
                {game && (
                  <div
                    className={`drop-shadow-default flex h-11 flex-1 items-center justify-center gap-2 rounded-[6px] border-2 border-white bg-[#3D7757] px-3 outline outline-2 outline-gray-600 ${
                      levelDir === "up"
                        ? "svf-lv-flash-up"
                        : levelDir === "down"
                          ? "svf-lv-flash-down"
                          : ""
                    }`}
                  >
                    <span className="text-xs font-bold tracking-widest text-white uppercase">
                      Lv
                    </span>
                    <span className="text-lg leading-none font-black">{displayLevel}</span>
                    <span className="text-sm text-white/90">VOLTORB Flip</span>
                  </div>
                )}
              </div>
              <ModeRow
                statsEnabled={settings.stats}
                onOpenSettings={() => setSettingsOpen(true)}
                onOpenStats={() => setStatsOpen(true)}
                onOpenDaily={() => setMode("daily")}
                dailyDisabled={!canSwitchMode}
              />
              <div className="flex w-full">
                <MemoBar
                  activeFlags={memoFlags}
                  onToggle={toggleMemoFlag}
                  onClear={clearMemoFlags}
                  size={32}
                  fullWidth
                  onUndo={settings.memoUndo ? undoMemo : undefined}
                  canUndo={canUndo && undoAllowed}
                />
              </div>
              {game && <Scoreboard currentScore={displayCurrent} totalScore={displayTotal} />}
            </div>

            {/* Right column: board + footer (and mobile bar at <lg, sized
            to match board width). */}
            <div className="flex flex-col items-center gap-2">
              {game && (
                <div className="flex w-full flex-col gap-1.5 lg:hidden">
                  <div className="flex items-stretch gap-2 rounded-[6px] border-2 border-gray-300 bg-white px-2 py-1 text-gray-700 outline outline-2 outline-gray-600">
                    <div
                      className={`flex items-center justify-center gap-1.5 rounded-[3px] bg-[#3D7757] px-2 leading-none text-white ${
                        levelDir === "up"
                          ? "svf-lv-flash-up"
                          : levelDir === "down"
                            ? "svf-lv-flash-down"
                            : ""
                      }`}
                    >
                      <span className="text-xs font-bold tracking-widest text-white uppercase">
                        Lv
                      </span>
                      <span className="text-xl font-black">{displayLevel}</span>
                    </div>
                    <div className="flex flex-1 items-center justify-around gap-2">
                      <div className="flex flex-col items-center gap-0.5 leading-none">
                        <div className="flex items-center gap-1">
                          <CoinSpinner size={14} />
                          <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                            Total Coins
                          </span>
                        </div>
                        <span className={`${scoreFont.className} flex text-xl`}>
                          {padDigits(displayTotal, 5)
                            .split("")
                            .map((d, i) => (
                              <span
                                key={i}
                                className="inline-block text-center"
                                style={{ width: "0.5em" }}
                              >
                                {d}
                              </span>
                            ))}
                        </span>
                      </div>
                      <div className="h-8 w-[2px] bg-gray-200" />
                      <div className="flex flex-col items-center gap-0.5 leading-none">
                        <div className="flex items-center gap-1">
                          <CoinSpinner size={14} />
                          <span className="text-[10px] font-bold tracking-widest text-gray-500 uppercase">
                            This Game
                          </span>
                        </div>
                        <span className={`${scoreFont.className} flex text-xl`}>
                          {padDigits(displayCurrent, 5)
                            .split("")
                            .map((d, i) => (
                              <span
                                key={i}
                                className="inline-block text-center"
                                style={{ width: "0.5em" }}
                              >
                                {d}
                              </span>
                            ))}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <InstructionsBtns onOpen={() => setHowToPlayOpen(true)} />
                    <PixelMuteButton muted={muted} onToggle={handleMuteToggle} size={44} />
                    <PixelFullscreenButton
                      active={fullscreenActive}
                      onToggle={toggleFullscreen}
                      size={44}
                    />
                  </div>
                  <ModeRow
                    statsEnabled={settings.stats}
                    onOpenSettings={() => setSettingsOpen(true)}
                    onOpenStats={() => setStatsOpen(true)}
                    onOpenDaily={() => setMode("daily")}
                    dailyDisabled={!canSwitchMode}
                  />
                  <MemoBar
                    activeFlags={memoFlags}
                    onToggle={toggleMemoFlag}
                    onClear={clearMemoFlags}
                    size={44}
                    showLabel={false}
                    fullWidth
                    spread
                    onUndo={settings.memoUndo ? undoMemo : undefined}
                    canUndo={canUndo && undoAllowed}
                  />
                </div>
              )}
              {game && (
                <>
                  <Gameboard
                    game={game}
                    updateGame={updateGame}
                    waitForClick
                    muted={muted}
                    onFirstInteraction={handleFirstInteraction}
                    memoFlags={memoFlags}
                    peek={peek}
                    runPostFanfare={runPostFanfare}
                    onFlipDownStart={triggerLevelTransition}
                    onMemoChange={handleMemoChange}
                    onLockChange={setBoardLocked}
                    odds={odds}
                    isAssisted={() => assistedRoundRef.current}
                  />
                  <Footer />
                </>
              )}
            </div>
          </div>
          {mode === "daily" && (
            <DailyGame
              muted={muted}
              memoUndoEnabled={settings.memoUndo}
              memoFlags={memoFlags}
              onToggleMemo={toggleMemoFlag}
              onClearMemo={clearMemoFlags}
              overlayOpen={overlayOpen}
              registerUndo={registerDailyUndo}
              onOutcome={handleDailyOutcome}
              onFirstInteraction={handleFirstInteraction}
              onExit={exitDaily}
              streak={(dayKey) => activeStreak(stats, dayKey)}
            />
          )}
        </div>
      </EffectsProvider>
    </>
  );
}
