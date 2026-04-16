"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Trophy, Timer, Target, Flame, Zap } from "lucide-react";

const SENTENCES = [
  "The quick brown fox jumps over the lazy dog near the riverbank.",
  "Pack my box with five dozen liquor jugs before the sunrise.",
  "How vexingly quick daft zebras jump across the open plains!",
  "Sphinx of black quartz, judge my vow on this quiet morning.",
  "Curiosity is the wick in the candle of a truly creative mind.",
  "Stars can't shine without darkness, and ideas need silence to grow.",
  "The only way to do great work is to love what you build every day.",
  "Simplicity is the ultimate sophistication in design and in life.",
  "A smooth sea never made a skilled sailor worth writing about.",
  "Coffee tastes better when you earned it after shipping something real.",
  "Typing fast is a dance between your fingers and your attention span.",
  "Wild waves crash softly against the warm golden shore at dusk.",
  "Every expert was once a complete beginner who refused to quit.",
  "The mountains are calling and I really must go find my boots.",
  "Small daily improvements are the key to staggering long-term results.",
  "Dream big, start small, but most of all, just start today.",
  "The best time to plant a tree was twenty years ago, the second best is now.",
  "Good code is like a good joke: it needs no explanation.",
  "She sells seashells by the seashore and sings ancient sailor songs.",
  "Bright neon signs hummed quietly above the rainy midnight street.",
  "A friendly robot waved from the moon and asked about the weather.",
  "Pixels are just tiny lights pretending to tell you a big story.",
  "Keyboards clack, ideas flow, and somehow the universe keeps spinning.",
  "Focus is the rare art of politely declining every other thing.",
  "The fog rolled in slowly like a cat deciding whether to stay.",
];

type GameState = "idle" | "playing" | "done";

function calcWPM(typedChars: number, elapsedMs: number): number {
  if (elapsedMs === 0) return 0;
  return Math.round((typedChars / 5) * (60000 / elapsedMs));
}

function calcAccuracy(correct: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((correct / total) * 100);
}

function pickSentence(exclude?: string): string {
  let s = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
  let tries = 0;
  while (s === exclude && tries < 5) {
    s = SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
    tries++;
  }
  return s;
}

interface Burst {
  id: number;
  x: number;
  y: number;
}

export function TypingSpeedGame() {
  const [target, setTarget] = useState<string>(() => pickSentence());
  const [state, setState] = useState<GameState>("idle");
  const [typed, setTyped] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem("typing-high-score");
    return saved ? parseInt(saved, 10) : 0;
  });
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [errors, setErrors] = useState(0);
  const [shake, setShake] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);

  const CONFETTI = useMemo(() => {
    const colors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ec4899"];
    const count = 22;
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + (i % 3) * 0.4;
      const dist = 140 + (i % 5) * 40;
      return {
        id: i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 60,
        rot: (i * 47) % 360,
        color: colors[i % colors.length],
      };
    });
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const charRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const burstIdRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startGame = useCallback(() => {
    setState("playing");
    setTyped("");
    setStreak(0);
    setMaxStreak(0);
    setErrors(0);
    setBursts([]);
    const now = Date.now();
    startTimeRef.current = now;
    setElapsed(0);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setElapsed(Date.now() - now);
    }, 80);
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const resetGame = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    setState("idle");
    setTyped("");
    setElapsed(0);
    setStreak(0);
    setErrors(0);
    setBursts([]);
    setTarget((prev) => pickSentence(prev));
  }, []);

  const spawnBurst = useCallback((charIndex: number) => {
    const el = charRefs.current[charIndex];
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

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (state !== "playing") return;
      const val = e.target.value;
      if (val.length > target.length) return;

      const prevLen = typed.length;
      const newLen = val.length;

      if (newLen > prevLen) {
        const newChar = val[newLen - 1];
        const expected = target[newLen - 1];
        if (newChar === expected) {
          setStreak((s) => {
            const next = s + 1;
            setMaxStreak((m) => Math.max(m, next));
            if (next > 0 && next % 10 === 0) {
              spawnBurst(newLen - 1);
            }
            return next;
          });
        } else {
          setStreak(0);
          setErrors((e) => e + 1);
          setShake((s) => s + 1);
        }
      }

      setTyped(val);

      if (val === target) {
        if (timerRef.current) clearInterval(timerRef.current);
        const finalElapsed = Date.now() - startTimeRef.current;
        setElapsed(finalElapsed);
        setState("done");
        const wpm = calcWPM(target.length, finalElapsed);
        if (wpm > highScore) {
          setHighScore(wpm);
          localStorage.setItem("typing-high-score", String(wpm));
        }
      }
    },
    [state, target, typed.length, highScore, spawnBurst]
  );

  const correctChars = useMemo(
    () => typed.split("").filter((c, i) => c === target[i]).length,
    [typed, target]
  );
  const totalTyped = typed.length;
  const currentWPM =
    state === "playing"
      ? calcWPM(totalTyped, elapsed)
      : state === "done"
      ? calcWPM(target.length, elapsed)
      : 0;
  const accuracy = calcAccuracy(correctChars, totalTyped);
  const progress = (totalTyped / target.length) * 100;

  const renderChar = (char: string, i: number) => {
    const isTyped = i < typed.length;
    const isCorrect = isTyped && typed[i] === char;
    const isWrong = isTyped && typed[i] !== char;
    const isCursor = i === typed.length && state === "playing";

    let cls = "transition-colors duration-100";
    if (isCorrect) cls += " text-accent-green";
    else if (isWrong) cls += " text-red-400 bg-red-500/15 rounded";
    else cls += " text-(--muted)/50";
    if (isCursor) cls += " border-b-2 border-accent-blue animate-pulse shadow-[0_2px_8px_rgba(96,165,250,0.6)]";

    return (
      <span
        key={i}
        ref={(el) => {
          charRefs.current[i] = el;
        }}
        className={cls}
      >
        {char}
      </span>
    );
  };

  const renderTarget = () => {
    // Walk the sentence and group runs of non-space chars into word spans
    // (display: inline-block so each word stays unbroken, but the browser
    // can break between words at the spaces).
    const nodes: React.ReactNode[] = [];
    let i = 0;
    let wordKey = 0;
    while (i < target.length) {
      if (target[i] === " ") {
        // render the space char (with cursor support) as its own inline node
        nodes.push(renderChar(" ", i));
        i++;
        continue;
      }
      const wordStart = i;
      while (i < target.length && target[i] !== " ") i++;
      const wordEnd = i;
      const chars: React.ReactNode[] = [];
      for (let k = wordStart; k < wordEnd; k++) chars.push(renderChar(target[k], k));
      nodes.push(
        <span key={`w${wordKey++}`} className="inline-block">
          {chars}
        </span>
      );
    }
    return nodes;
  };

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <motion.div
          animate={{ scale: state === "playing" ? [1, 1.05, 1] : 1 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-1.5 text-(--muted)"
        >
          <Timer className="h-3.5 w-3.5" />
          <span
            className={
              state === "playing"
                ? "text-accent-blue font-mono font-semibold tabular-nums"
                : "font-mono tabular-nums"
            }
          >
            {(elapsed / 1000).toFixed(1)}s
          </span>
        </motion.div>
        <div className="flex items-center gap-1.5 text-(--muted)">
          <Target className="h-3.5 w-3.5" />
          <motion.span
            key={currentWPM}
            initial={{ scale: 1.2, color: "#22c55e" }}
            animate={{ scale: 1 }}
            className={
              state === "playing" || state === "done"
                ? "text-accent-green font-mono font-semibold tabular-nums"
                : "font-mono tabular-nums"
            }
          >
            {currentWPM} WPM
          </motion.span>
        </div>
        <div className="flex items-center gap-1.5 text-(--muted) font-mono tabular-nums">
          {accuracy}% acc
        </div>
        <AnimatePresence>
          {streak >= 5 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.7 }}
              className="flex items-center gap-1.5 text-accent-amber font-mono font-semibold"
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
          <div className="flex items-center gap-1.5 text-(--muted) ml-auto">
            <Trophy className="h-3.5 w-3.5 text-accent-amber" />
            <span className="font-mono text-accent-amber tabular-nums">
              {highScore} best
            </span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-(--border)/40 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent-blue via-accent-green to-accent-amber"
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        />
      </div>

      {/* Sentence display */}
      <motion.div
        ref={containerRef}
        key={shake}
        animate={shake > 0 ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.3 }}
        className="relative rounded-2xl border border-(--border) bg-(--card) p-6 sm:p-8 text-lg sm:text-2xl leading-relaxed font-serif cursor-text overflow-hidden"
        onClick={() => state === "playing" && inputRef.current?.focus()}
        style={{
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.04), rgba(34,197,94,0.04))",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={target}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.35 }}
            className="relative tracking-wide"
          >
            {renderTarget()}
          </motion.div>
        </AnimatePresence>

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

        {/* Idle overlay */}
        <AnimatePresence>
          {state === "idle" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-(--bg)/85 backdrop-blur-sm"
            >
              <motion.button
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                onClick={startGame}
                className="rounded-xl bg-gradient-to-br from-accent-blue to-accent-green px-7 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-lg shadow-accent-blue/20"
              >
                Start typing
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Hidden textarea */}
      <textarea
        ref={inputRef}
        value={typed}
        onChange={handleInput}
        className="sr-only"
        aria-label="Type the sentence"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={-1}
      />

      {/* Done overlay */}
      <AnimatePresence>
        {state === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16 }}
            transition={{ type: "spring", stiffness: 220, damping: 22 }}
            className="relative overflow-hidden rounded-2xl border border-accent-green/40 bg-gradient-to-br from-accent-green/10 via-transparent to-accent-blue/10 p-6 text-center"
          >
            {/* Confetti pieces */}
            {CONFETTI.map((c) => (
              <motion.div
                key={c.id}
                className="absolute top-1/2 left-1/2 h-2 w-2 rounded-sm"
                initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                animate={{
                  x: c.dx,
                  y: c.dy,
                  opacity: 0,
                  rotate: c.rot,
                }}
                transition={{ duration: 1.2, ease: "easeOut", delay: c.id * 0.02 }}
                style={{ background: c.color }}
              />
            ))}
            <motion.div
              initial={{ scale: 0.5 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
              className="relative text-5xl font-black font-display text-accent-green"
            >
              {currentWPM}
              <span className="ml-1 text-xl text-(--muted) font-semibold">WPM</span>
            </motion.div>
            <div className="relative mt-2 text-sm text-(--muted)">
              {accuracy}% accuracy · {(elapsed / 1000).toFixed(1)}s · best streak {maxStreak} · {errors} error{errors === 1 ? "" : "s"}
              {currentWPM >= highScore && currentWPM > 0 && (
                <motion.span
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="ml-2 inline-flex items-center gap-1 text-accent-amber font-semibold"
                >
                  <Trophy className="h-3.5 w-3.5" />
                  New best!
                </motion.span>
              )}
            </div>
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              onClick={resetGame}
              className="relative mt-4 inline-flex items-center gap-2 rounded-lg bg-accent-green/15 border border-accent-green/40 px-5 py-2 text-sm font-semibold text-accent-green hover:bg-accent-green/25 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Next sentence
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip button */}
      {state === "playing" && (
        <button
          onClick={resetGame}
          className="inline-flex items-center gap-1.5 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
        >
          <RotateCcw className="h-3 w-3" />
          Skip
        </button>
      )}
    </div>
  );
}
