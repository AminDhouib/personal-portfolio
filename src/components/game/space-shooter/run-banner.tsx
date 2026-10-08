import { motion } from "framer-motion";

export const BANNER_MS = 2500;
const FADE_MS = 400;

/** The "WAVE 1" opener: top centre for the first BANNER_MS of a run, never blocks input. */
export function RunBanner({ startedAt, now }: { startedAt: number; now: number }) {
  const elapsed = now - startedAt;
  if (elapsed < 0 || elapsed >= BANNER_MS) return null;
  const opacity = Math.min(1, (BANNER_MS - elapsed) / FADE_MS);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
      <motion.span
        initial={{ opacity: 0, y: -10, scale: 0.9 }}
        animate={{ opacity, y: 0, scale: 1 }}
        transition={{ duration: 0.25 }}
        className="rounded-lg border border-white/15 bg-black/40 px-4 py-1.5 font-mono text-sm font-bold tracking-[0.3em] text-accent-blue backdrop-blur-sm sm:text-lg"
      >
        WAVE 1
      </motion.span>
    </div>
  );
}
