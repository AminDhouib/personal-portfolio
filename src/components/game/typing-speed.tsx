"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Trophy, Timer, Target, Flame, Zap, Percent } from "lucide-react";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { safeLocalSet } from "@/lib/safe-storage";
import { keyStats, wpmSeries, type KeyStats, type SeriesPoint } from "./typing-speed/engine/series";
import { configFor, modeLabel, parseMode, type ModeId } from "./typing-speed/engine/modes";
import type { Op, TypingRun } from "./typing-speed/engine/types";
import {
  charCounts,
  liveWpm,
  runMetrics,
  streaks,
  type CharCounts,
  type RunMetrics,
} from "./typing-speed/metrics";
import { isTextEntryTarget } from "./text-entry";
import { ModeBar } from "./typing-speed/mode-bar";
import { PlaySheet, SheetHud } from "./typing-speed/play-sheet";
import { ResultsCard } from "./typing-speed/results-card";
import { sheetLayout } from "./typing-speed/sheet-layout";
import { loadStats, recordRun, saveStats } from "./typing-speed/stats";
import { TextView } from "./typing-speed/text-view";
import { useTypingRun } from "./typing-speed/use-typing-run";
import { WpmGraph } from "./typing-speed/wpm-graph";
import "./typing-speed/typing.css";

const HIGH_SCORE_KEY = "typing-high-score";
/** Below this width a run plays in the phone sheet (the Password Game 2 breakpoint). */
const PHONE_QUERY = "(max-width: 1023px)";

interface Burst {
  id: number;
  x: number;
  y: number;
}

interface Result {
  metrics: RunMetrics;
  maxStreak: number;
  bulk: boolean;
  counts: CharCounts;
  series: SeriesPoint[];
  runKeys: KeyStats;
  allKeys: KeyStats;
  /** Set when this run beat a stored best for its mode, e.g. "15s words". */
  modeBest: string | null;
}

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function drawSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] ?? 1;
}

function readHighScore(): number {
  const saved = window.localStorage.getItem(HIGH_SCORE_KEY);
  const n = saved ? parseInt(saved, 10) : 0;
  return Number.isFinite(n) ? n : 0;
}

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => window.matchMedia?.(PHONE_QUERY).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(PHONE_QUERY);
    if (!mq) return;
    const update = () => setPhone(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return phone;
}

export function TypingSpeedGame() {
  const [initialStats] = useState(loadStats);
  const [mode, setMode] = useState<ModeId>(initialStats.lastMode);
  const [seed, setSeed] = useState(drawSeed);
  const [passageNo, setPassageNo] = useState(0);
  const [highScore, setHighScore] = useState(readHighScore);
  const [result, setResult] = useState<Result | null>(null);
  const [shake, setShake] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const burstIdRef = useRef(0);
  const restartRef = useRef<HTMLButtonElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const phone = usePhone();
  // The sheet opens on a tap that starts typing and closes on Exit and on finish.
  const [sheetOn, setSheetOn] = useState(false);
  // Leaving the phone width closes it for good, so coming back never reopens it on a stale run.
  const [wasPhone, setWasPhone] = useState(phone);
  if (phone !== wasPhone) {
    setWasPhone(phone);
    if (!phone) setSheetOn(false);
  }
  const sheet = phone && sheetOn;
  const sheetRef = useRef(false);
  const scrollToResults = useRef(false);
  const [focused, setFocused] = useState(false);
  const viewport = useVisualViewport(sheet);

  useEffect(() => {
    sheetRef.current = sheet;
  }, [sheet]);

  // The sheet owns the screen: lock the page scroll while it is up, whatever closes it
  // (Exit, finish, a switch to desktop, or the game unmounting).
  useEffect(() => {
    if (!sheet) return;
    const root = document.documentElement;
    root.classList.add("typing-lock");
    return () => root.classList.remove("typing-lock");
  }, [sheet]);

  const spawnBurst = useCallback(() => {
    const el = containerRef.current?.querySelector("[data-ts-caret]");
    const container = containerRef.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const id = burstIdRef.current++;
    const burst: Burst = {
      id,
      x: elRect.left - cRect.left + elRect.width / 2,
      y: elRect.top - cRect.top + elRect.height / 2,
    };
    setBursts((prev) => [...prev, burst]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 700);
  }, []);

  const onKey = useCallback(
    (run: TypingRun) => {
      const last = run.log.at(-1);
      if (!last) return;
      if (last.correct === false) {
        setShake((s) => s + 1);
      } else if (last.correct === true) {
        const { current } = streaks(run);
        if (current > 0 && current % 10 === 0) spawnBurst();
      }
    },
    [spawnBurst],
  );

  const onFinish = useCallback(
    (run: TypingRun) => {
      if (sheetRef.current) {
        // Close the keyboard with the sheet and bring the results into view.
        setSheetOn(false);
        inputRef.current?.blur();
        scrollToResults.current = true;
      }
      const metrics = runMetrics(run);
      const bulk = run.bulk > 0;
      if (!bulk && metrics.netWpm > highScore) {
        setHighScore(metrics.netWpm);
        safeLocalSet(HIGH_SCORE_KEY, String(metrics.netWpm));
      }
      const runKeys = keyStats(run);
      const before = loadStats();
      const prior = before.bests[mode];
      const after = recordRun(before, {
        mode,
        netWpm: metrics.netWpm,
        rawWpm: metrics.rawWpm,
        accuracy: metrics.accuracy,
        day: utcDay(),
        keys: runKeys,
        bulk: run.bulk,
      });
      saveStats(after);
      setResult({
        metrics,
        maxStreak: streaks(run).best,
        bulk,
        counts: charCounts(run),
        series: wpmSeries(run),
        runKeys,
        allKeys: after.keys,
        modeBest: !bulk && prior && metrics.netWpm > prior.wpm ? modeLabel(mode) : null,
      });
    },
    [highScore, mode],
  );

  const typing = useTypingRun(configFor(mode, seed, passageNo), { inputRef, onFinish, onKey });
  const { run, reset, press } = typing;

  const timed = parseMode(mode) !== null;

  const begin = useCallback(
    (next: { mode: ModeId; seed: number; passageNo: number }) => {
      setMode(next.mode);
      setSeed(next.seed);
      setPassageNo(next.passageNo);
      setResult(null);
      setBursts([]);
      reset(configFor(next.mode, next.seed, next.passageNo));
    },
    [reset],
  );

  // A timed run draws fresh words each time; a quote run replays the same passage.
  const restart = useCallback(() => {
    begin({ mode, seed: timed ? drawSeed() : seed, passageNo });
    // Synchronous, inside the click gesture, so mobile Safari raises the keyboard.
    inputRef.current?.focus();
    if (phone) setSheetOn(true);
  }, [begin, mode, seed, passageNo, timed, phone]);

  const nextPassage = useCallback(() => {
    begin({ mode, seed, passageNo: passageNo + 1 });
    inputRef.current?.focus();
    if (phone) setSheetOn(true);
  }, [begin, mode, seed, passageNo, phone]);

  // Focus first, inside the tap, so the keyboard comes up; the sheet follows it.
  const startTyping = useCallback(() => {
    inputRef.current?.focus();
    if (phone) setSheetOn(true);
  }, [phone]);

  // Exit abandons the run: the keyboard closes and the page is back as it was.
  const exitSheet = useCallback(() => {
    setSheetOn(false);
    inputRef.current?.blur();
    begin({ mode, seed: timed ? drawSeed() : seed, passageNo });
  }, [begin, mode, seed, passageNo, timed]);

  const changeMode = useCallback(
    (next: ModeId) => {
      if (next === mode) return;
      saveStats({ ...loadStats(), lastMode: next });
      begin({ mode: next, seed: drawSeed(), passageNo: 0 });
    },
    [begin, mode],
  );

  // Any printable key starts the run, Enter focuses it, Escape restarts it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const inTextField = isTextEntryTarget(e);
      // Tab and Escape belong to the game only from its own input or from outside any field.
      const ownInput = !!el && el === inputRef.current;
      const inButton = !!el?.closest("button, a");
      if (e.key === "Tab" && !e.shiftKey && ownInput && run.status !== "done" && !sheet) {
        e.preventDefault();
        restartRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        if (inTextField && !ownInput) return;
        if (run.status !== "ready") {
          e.preventDefault();
          restart();
        }
        return;
      }
      if (run.status === "done") return;
      if (e.key === "Enter") {
        if (inTextField || inButton || run.status !== "ready") return;
        e.preventDefault();
        inputRef.current?.focus();
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey || inTextField) return;
      // Space on a fresh round keeps scrolling the page.
      if (e.key === " " && (run.status === "ready" || inButton)) return;
      e.preventDefault();
      inputRef.current?.focus();
      const op: Op = e.key === " " ? { kind: "space" } : { kind: "char", ch: e.key };
      press([op]);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [run, restart, press, sheet]);

  const metrics = runMetrics(run, typing.now);
  const { current: streak } = streaks(run);
  const playing = run.status === "running";
  const done = run.status === "done";
  const liveNet = done ? metrics.netWpm : liveWpm(metrics.netChars, metrics.elapsedMs);
  const totalChars = run.words.reduce((n, w) => n + w.length, 0);
  const typedChars =
    run.typed.slice(0, run.cursor).reduce((n, t) => n + t.length, 0) +
    (done ? 0 : (run.typed[run.cursor]?.length ?? 0));
  const limit = run.config.kind === "time" ? run.config.seconds : null;
  const timerText =
    limit === null
      ? (metrics.elapsedMs / 1000).toFixed(1)
      : String(Math.max(0, Math.ceil(limit - metrics.elapsedMs / 1000)));
  // The run mutates in place; the sparkline refreshes once per whole second, not per tick.
  const wholeSeconds = Math.floor(metrics.elapsedMs / 1000);
  const liveSeries = useMemo(
    () => (playing ? wpmSeries(run).slice(0, wholeSeconds + 1) : []),
    [run, playing, wholeSeconds],
  );
  const progress = done
    ? 100
    : limit === null
      ? Math.min(100, (typedChars / Math.max(1, totalChars)) * 100)
      : Math.min(100, (metrics.elapsedMs / (limit * 1000)) * 100);

  // A run that ended in the sheet leaves the results below the fold: bring them up.
  useEffect(() => {
    if (!done || !result || !scrollToResults.current) return;
    scrollToResults.current = false;
    resultsRef.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  }, [done, result]);

  const layout = sheetLayout({ vvHeight: viewport.height, keyboardOpen: viewport.keyboardOpen });

  return (
    <div className="space-y-5">
      <div inert={sheet} className="space-y-5">
        <ModeBar mode={mode} onChange={changeMode} />

        {/* Stats bar */}
        <div
          data-testid="ts-stats"
          className="flex min-h-12 flex-wrap content-start items-center gap-x-5 gap-y-2 text-sm sm:min-h-0"
        >
          <motion.div
            animate={{ scale: playing ? [1, 1.05, 1] : 1 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-1.5 text-(--muted)"
          >
            <Timer className="h-3.5 w-3.5" />
            <span
              className={
                playing
                  ? "font-mono font-semibold text-accent-blue tabular-nums"
                  : "font-mono tabular-nums"
              }
            >
              <span data-testid="ts-timer">{timerText}</span>s
            </span>
          </motion.div>
          <div className="flex items-center gap-1.5 text-(--muted)">
            <Target className="h-3.5 w-3.5" />
            <motion.span
              key={liveNet}
              initial={{ scale: 1.2, color: "#22c55e" }}
              animate={{ scale: 1 }}
              className={
                playing || done
                  ? "font-mono font-semibold text-accent-green tabular-nums"
                  : "font-mono tabular-nums"
              }
            >
              {liveNet} WPM
            </motion.span>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-(--muted) tabular-nums">
            <Percent className="h-3.5 w-3.5" />
            {metrics.accuracy}% acc
          </div>
          <AnimatePresence>
            {streak >= 5 && (
              <motion.div
                initial={{ opacity: 0, scale: 0.7, y: -6 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7 }}
                className="flex items-center gap-1.5 font-mono font-semibold text-accent-amber"
              >
                <motion.span
                  animate={{ rotate: [0, -12, 12, 0] }}
                  transition={{ duration: 0.4, repeat: Infinity, repeatDelay: 0.6 }}
                >
                  <Flame className="h-3.5 w-3.5" />
                </motion.span>
                {streak}x
              </motion.div>
            )}
          </AnimatePresence>
          {highScore > 0 && (
            <div className="ml-auto flex items-center gap-1.5 text-(--muted)">
              <Trophy className="h-3.5 w-3.5 text-accent-amber" />
              <span className="font-mono text-accent-amber tabular-nums">{highScore} best</span>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full overflow-hidden rounded-full bg-(--border)/40">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-green to-accent-amber"
            animate={{ width: `${progress}%` }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
          />
        </div>
      </div>

      <PlaySheet
        active={sheet}
        compact={layout.compact}
        viewport={viewport}
        hud={<SheetHud time={timerText} wpm={liveNet} onRestart={restart} onExit={exitSheet} />}
      >
        {/* The sparkline's slot is always there so it appearing does not shift the page. */}
        {(!sheet || layout.showGraph) && (
          <div className="h-10" data-testid="ts-live-slot">
            {playing && liveSeries.length > 0 && <WpmGraph points={liveSeries} variant="live" />}
          </div>
        )}

        {/* Passage */}
        <motion.div
          ref={containerRef}
          key={shake}
          animate={shake > 0 ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.3 }}
          className={
            sheet
              ? layout.compact
                ? "relative cursor-text overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-1.5 font-serif leading-relaxed"
                : "relative cursor-text overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-3 font-serif leading-relaxed"
              : "relative cursor-text overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-6 font-serif text-lg leading-relaxed sm:p-8 sm:text-2xl"
          }
          onClick={() => !done && startTyping()}
          style={{
            background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(34,197,94,0.04))",
            ...(sheet ? { fontSize: layout.fontPx } : {}),
          }}
        >
          <TextView run={run} caret />

          {sheet && !focused && (
            <div
              data-testid="ts-refocus"
              className="pointer-events-none absolute inset-0 flex items-center justify-center bg-(--card)/80 font-sans text-sm font-semibold text-accent-amber"
            >
              Tap the text to keep typing
            </div>
          )}

          {/* Combo bursts */}
          <AnimatePresence>
            {bursts.map((b) => (
              <motion.div
                key={b.id}
                initial={{ opacity: 1, scale: 0.4 }}
                animate={{ opacity: 0, scale: 2 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7, ease: "easeOut" }}
                className="pointer-events-none absolute flex items-center justify-center"
                style={{ left: b.x - 24, top: b.y - 24, width: 48, height: 48 }}
              >
                <div className="h-12 w-12 rounded-full bg-accent-amber/40 blur-md" />
                <Zap className="absolute h-6 w-6 text-accent-amber" />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </PlaySheet>

      {/* Hidden input: always SENTINEL + the current word, see engine/input.ts */}
      <input
        ref={inputRef}
        type="text"
        data-ts-hidden
        aria-label="Typing area"
        inputMode="text"
        enterKeyHint="next"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue=" "
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Fixed at the top of the visible area so focusing it never scrolls the page; 16 px so
        // iOS does not zoom in; invisible and untouchable, the text is what the player taps.
        className="pointer-events-none fixed left-0 h-px w-px text-base opacity-0"
        style={{ top: viewport.top }}
      />

      <div inert={sheet} className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            ref={restartRef}
            onClick={restart}
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center gap-1.5 rounded-lg px-2 font-sans text-xs text-(--muted) transition-colors hover:text-(--foreground)"
          >
            <RotateCcw className="h-3 w-3" />
            Restart
          </button>
          {playing && !timed && (
            <button
              type="button"
              onClick={nextPassage}
              className="inline-flex min-h-11 min-w-11 touch-manipulation items-center gap-1.5 px-2 font-sans text-xs text-(--muted) transition-colors hover:text-(--foreground)"
            >
              <RotateCcw className="h-3 w-3" />
              Skip
            </button>
          )}
        </div>

        {run.status === "ready" && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={startTyping}
              className="min-h-11 min-w-11 touch-manipulation rounded-xl bg-gradient-to-br from-accent-blue to-accent-green px-7 py-3 font-sans text-sm font-bold tracking-wider text-white uppercase shadow-lg shadow-accent-blue/20"
            >
              Start typing
            </button>
            <p className="text-sm text-(--muted)">
              {phone ? "Tap the text to start." : "Click the text or press any key to start."}
            </p>
          </div>
        )}

        {done && result && (
          <div ref={resultsRef} className="scroll-mt-20">
            <ResultsCard
              metrics={result.metrics}
              maxStreak={result.maxStreak}
              bulk={result.bulk}
              counts={result.counts}
              series={result.series}
              runKeys={result.runKeys}
              allKeys={result.allKeys}
              modeBest={result.modeBest}
              onNext={timed ? null : nextPassage}
              onAgain={restart}
            />
          </div>
        )}
      </div>
    </div>
  );
}
