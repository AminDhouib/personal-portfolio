"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Trophy, Timer, Target, Flame, Zap, Percent } from "lucide-react";
import { safeLocalSet } from "@/lib/safe-storage";
import { keyStats, wpmSeries, type KeyStats, type SeriesPoint } from "./typing-speed/engine/series";
import { configFor, modeLabel, parseMode, type ModeId } from "./typing-speed/engine/modes";
import type { Op, TypingRun } from "./typing-speed/engine/types";
import {
  charCounts,
  isNewBest,
  liveWpm,
  runMetrics,
  streaks,
  type CharCounts,
  type RunMetrics,
} from "./typing-speed/metrics";
import { ModeBar } from "./typing-speed/mode-bar";
import { ResultsCard } from "./typing-speed/results-card";
import { loadStats, recordRun, saveStats } from "./typing-speed/stats";
import { TextView } from "./typing-speed/text-view";
import { useTypingRun } from "./typing-speed/use-typing-run";
import { WpmGraph } from "./typing-speed/wpm-graph";

const HIGH_SCORE_KEY = "typing-high-score";

interface Burst {
  id: number;
  x: number;
  y: number;
}

interface Result {
  metrics: RunMetrics;
  maxStreak: number;
  newBest: boolean;
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
      const metrics = runMetrics(run);
      const bulk = run.bulk > 0;
      const newBest = !bulk && isNewBest(metrics.netWpm, highScore > 0 ? highScore : null);
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
        newBest,
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
  }, [begin, mode, seed, passageNo, timed]);

  const nextPassage = useCallback(() => {
    begin({ mode, seed, passageNo: passageNo + 1 });
    inputRef.current?.focus();
  }, [begin, mode, seed, passageNo]);

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
      const inTextField = !!el?.closest("input, textarea, select, [contenteditable='true']");
      const inButton = !!el?.closest("button, a");
      if (e.key === "Tab" && !e.shiftKey && inTextField && run.status !== "done") {
        e.preventDefault();
        restartRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
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
  }, [run, restart, press]);

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

  return (
    <div className="space-y-5">
      <ModeBar mode={mode} onChange={changeMode} />

      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
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

      {playing && liveSeries.length > 0 && <WpmGraph points={liveSeries} variant="live" />}

      {/* Passage */}
      <motion.div
        ref={containerRef}
        key={shake}
        animate={shake > 0 ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
        className="relative cursor-text overflow-hidden rounded-2xl border border-(--border) bg-(--card) p-6 font-serif text-lg leading-relaxed sm:p-8 sm:text-2xl"
        onClick={() => !done && inputRef.current?.focus()}
        style={{
          background: "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(34,197,94,0.04))",
        }}
      >
        <TextView run={run} caret />

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

      {/* Hidden input: always SENTINEL + the current word, see engine/input.ts */}
      <input
        ref={inputRef}
        type="text"
        data-ts-hidden
        aria-label="Typing area"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue=" "
        className="sr-only"
      />

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          ref={restartRef}
          onClick={restart}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 font-sans text-xs text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <RotateCcw className="h-3 w-3" />
          Restart
        </button>
        {playing && !timed && (
          <button
            type="button"
            onClick={nextPassage}
            className="inline-flex min-h-11 items-center gap-1.5 font-sans text-xs text-(--muted) transition-colors hover:text-(--foreground)"
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
            onClick={() => inputRef.current?.focus()}
            className="min-h-11 rounded-xl bg-gradient-to-br from-accent-blue to-accent-green px-7 py-3 font-sans text-sm font-bold tracking-wider text-white uppercase shadow-lg shadow-accent-blue/20"
          >
            Start typing
          </button>
          <p className="text-sm text-(--muted)">Click the text or press any key to start.</p>
        </div>
      )}

      {done && result && (
        <ResultsCard
          metrics={result.metrics}
          maxStreak={result.maxStreak}
          newBest={result.newBest}
          bulk={result.bulk}
          counts={result.counts}
          series={result.series}
          runKeys={result.runKeys}
          allKeys={result.allKeys}
          modeBest={result.modeBest}
          onNext={timed ? null : nextPassage}
          onAgain={restart}
        />
      )}
    </div>
  );
}
