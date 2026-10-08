import { useMemo } from "react";
import { motion } from "framer-motion";
import { RotateCcw, SkipForward, Trophy } from "lucide-react";
import type { RunMetrics } from "./metrics";

interface ResultsCardProps {
  metrics: RunMetrics;
  maxStreak: number;
  newBest: boolean;
  /** The run took phone suggestions or autocorrect, so it can never count. */
  bulk: boolean;
  onNext: () => void;
  onAgain: () => void;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

export function ResultsCard({
  metrics,
  maxStreak,
  newBest,
  bulk,
  onNext,
  onAgain,
}: ResultsCardProps) {
  const confetti = useMemo(() => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 220, damping: 22 }}
      className="relative overflow-hidden rounded-2xl border border-accent-green/40 bg-gradient-to-br from-accent-green/10 via-transparent to-accent-blue/10 p-6 text-center"
    >
      {!bulk &&
        confetti.map((c) => (
          <motion.div
            key={c.id}
            className="absolute top-1/2 left-1/2 h-2 w-2 rounded-sm"
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{ x: c.dx, y: c.dy, opacity: 0, rotate: c.rot }}
            transition={{ duration: 1.2, ease: "easeOut", delay: c.id * 0.02 }}
            style={{ background: c.color }}
          />
        ))}
      <motion.div
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.1 }}
        className="relative font-display text-5xl font-black text-accent-green"
      >
        <span data-testid="ts-net-wpm">{metrics.netWpm}</span>
        <span className="ml-1 text-xl font-semibold text-(--muted)">WPM</span>
      </motion.div>
      <div className="relative mt-2 text-sm text-(--muted)">
        <span data-testid="ts-raw-wpm">{metrics.rawWpm} raw WPM</span>
        {" | "}
        <span data-testid="ts-accuracy">{metrics.accuracy}% accuracy</span>
        {" | "}
        {(metrics.elapsedMs / 1000).toFixed(1)}s{" | "}best streak {maxStreak}
        {newBest && (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="ml-2 inline-flex items-center gap-1 font-semibold text-accent-amber"
          >
            <Trophy className="h-3.5 w-3.5" />
            New best!
          </motion.span>
        )}
      </div>
      <div data-testid="ts-mistakes" className="relative mt-1 text-sm text-(--muted)">
        {metrics.mistakesTyped} {plural(metrics.mistakesTyped, "mistake", "mistakes")} typed,{" "}
        {metrics.mistakesLeft} left
      </div>
      {bulk && (
        <p className="relative mt-2 text-xs text-accent-amber">
          Typed with keyboard suggestions, so this result is for you only and cannot set a best or
          be posted.
        </p>
      )}
      <div className="relative mt-4 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onNext}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-accent-green/40 bg-accent-green/15 px-5 py-2 font-sans text-sm font-semibold text-accent-green transition-colors hover:bg-accent-green/25"
        >
          <SkipForward className="h-3.5 w-3.5" />
          Next passage
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-(--border) px-5 py-2 font-sans text-sm font-semibold text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Again
        </button>
      </div>
    </motion.div>
  );
}
