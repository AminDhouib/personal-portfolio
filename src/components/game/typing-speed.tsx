"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Trophy, Timer, Target, Flame, Zap, Percent } from "lucide-react";
import { safeLocalSet } from "@/lib/safe-storage";
import { passageAt } from "./typing-speed/engine/text";
import type { Op, TypingRun } from "./typing-speed/engine/types";
import { isNewBest, liveWpm, runMetrics, streaks, type RunMetrics } from "./typing-speed/metrics";
import { ResultsCard } from "./typing-speed/results-card";
import { TextView } from "./typing-speed/text-view";
import { useTypingRun } from "./typing-speed/use-typing-run";

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

function passageConfig(seed: number, n: number) {
  return { kind: "text", text: passageAt(seed, n).text } as const;
}

export function TypingSpeedGame() {
  const [seed] = useState(drawSeed);
  const [passageNo, setPassageNo] = useState(0);
  const [highScore, setHighScore] = useState(readHighScore);
  const [result, setResult] = useState<Result | null>(null);
  const [shake, setShake] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const burstIdRef = useRef(0);

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
      setResult({ metrics, maxStreak: streaks(run).best, newBest, bulk });
    },
    [highScore],
  );

  const typing = useTypingRun(passageConfig(seed, 0), { inputRef, onFinish, onKey });
  const { run, reset, press } = typing;

  const newRound = useCallback(
    (n: number) => {
      setPassageNo(n);
      setResult(null);
      setBursts([]);
      reset(passageConfig(seed, n));
      // Synchronous, inside the click gesture, so mobile Safari raises the keyboard.
      inputRef.current?.focus();
    },
    [seed, reset],
  );

  // Any printable key starts the run, Enter focuses it, Escape restarts it.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const inTextField = !!el?.closest("input, textarea, select, [contenteditable='true']");
      const inButton = !!el?.closest("button, a");
      if (e.key === "Escape") {
        if (run.status === "running") {
          e.preventDefault();
          newRound(passageNo);
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
  }, [run, passageNo, newRound, press]);

  const metrics = runMetrics(run, typing.now);
  const { current: streak } = streaks(run);
  const playing = run.status === "running";
  const done = run.status === "done";
  const liveNet = done ? metrics.netWpm : liveWpm(metrics.netChars, metrics.elapsedMs);
  const totalChars = run.words.reduce((n, w) => n + w.length, 0);
  const typedChars =
    run.typed.slice(0, run.cursor).reduce((n, t) => n + t.length, 0) +
    (done ? 0 : (run.typed[run.cursor]?.length ?? 0));
  const progress = done ? 100 : Math.min(100, (typedChars / Math.max(1, totalChars)) * 100);

  return (
    <div className="space-y-5">
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
            {(metrics.elapsedMs / 1000).toFixed(1)}s
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
          onNext={() => newRound(passageNo + 1)}
          onAgain={() => newRound(passageNo)}
        />
      )}

      {/* Skip button */}
      {playing && (
        <button
          type="button"
          onClick={() => newRound(passageNo + 1)}
          className="inline-flex min-h-11 items-center gap-1.5 font-sans text-xs text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <RotateCcw className="h-3 w-3" />
          Skip
        </button>
      )}
    </div>
  );
}
