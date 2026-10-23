import { motion, AnimatePresence } from "framer-motion";
import { Trophy, RotateCcw, Send, ShoppingCart, Coins as CoinsIcon, Share2 } from "lucide-react";
import { CountUp } from "./count-up";
import { coinBreakdown } from "./post-run";
import { shareRun } from "./share";
import { comboColor } from "./difficulty";
import { ArcadeBoardTabs } from "@/components/game/arcade-board-tabs";
import type { BoardPeriod } from "@/lib/arcade/boards";
import type { ArcadeBoardEntry, ArcadeYou } from "@/hooks/use-arcade-board";
import type { buildConfetti } from "./confetti";
import type { PostRunGoals } from "./post-run";
import type { SpaceShooterPrefs } from "./prefs";
import type { UiState } from "./ui-state";

export type CelebrationKind = "first" | "personal" | "world" | null;

type Confetti = ReturnType<typeof buildConfetti>;

export function DeathOverlay({
  ui,
  panelOpen,
  celebration,
  PERSONAL_CONFETTI,
  WORLD_CONFETTI,
  goals,
  prefs,
  name,
  setName,
  submit,
  submitted,
  submitting,
  rejected,
  boardPeriod,
  setBoardPeriod,
  boardLoading,
  boardError,
  leaderboard,
  leaderboardYou,
  flyAgain,
  isReturningPlayer,
  setShopOpen,
  recordingBlob,
  captureShareImage,
}: {
  ui: UiState;
  panelOpen: boolean;
  celebration: CelebrationKind;
  PERSONAL_CONFETTI: Confetti;
  WORLD_CONFETTI: Confetti;
  goals: PostRunGoals;
  prefs: SpaceShooterPrefs;
  name: string;
  setName: (name: string) => void;
  submit: () => Promise<void>;
  submitted: boolean;
  submitting: boolean;
  rejected: boolean;
  boardPeriod: BoardPeriod;
  setBoardPeriod: (period: BoardPeriod) => void;
  boardLoading: boolean;
  boardError: string | null;
  leaderboard: ArcadeBoardEntry[];
  leaderboardYou: ArcadeYou | null;
  flyAgain: () => void;
  isReturningPlayer: boolean;
  setShopOpen: (open: boolean) => void;
  recordingBlob: Blob | null;
  captureShareImage: (stats: {
    score: number;
    distance: number;
    kills: number;
  }) => Promise<Blob | null>;
}) {
  return (
    <AnimatePresence>
      {ui.status === "dead" && (
        <motion.div
          inert={panelOpen}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/70 p-4 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 240, damping: 16 }}
            className="relative text-center"
          >
            {/* Confetti burst — bigger when world record */}
            {celebration && (
              <>
                {(celebration === "world" ? WORLD_CONFETTI : PERSONAL_CONFETTI).map((c) => (
                  <motion.div
                    key={c.id}
                    className="absolute top-1/2 left-1/2 h-2 w-2 rounded-sm"
                    initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                    animate={{ x: c.dx, y: c.dy, opacity: 0, rotate: c.rot }}
                    transition={{
                      duration: celebration === "world" ? 1.8 : 1.3,
                      ease: "easeOut",
                      delay: c.id * 0.012,
                    }}
                    style={{ background: c.color }}
                  />
                ))}
              </>
            )}
            <div className="text-xs font-bold tracking-[0.3em] text-red-400 uppercase">
              Ship destroyed
            </div>
            <div className="mt-1 font-display text-4xl font-black text-white tabular-nums sm:text-5xl">
              <CountUp target={ui.score} reducedMotion={prefs.reducedMotion} />
            </div>
            {celebration === "world" && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.2 }}
                className="mt-3 inline-flex items-center gap-2 rounded-full bg-linear-to-br from-accent-amber via-accent-pink to-accent-blue px-4 py-1.5 text-sm font-black tracking-widest text-black uppercase"
              >
                <Trophy className="h-4 w-4" />
                World Record
              </motion.div>
            )}
            {(celebration === "personal" || celebration === "first") && (
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
                className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-accent-amber/60 bg-accent-amber/20 px-3 py-1 text-xs font-bold tracking-widest text-accent-amber uppercase"
              >
                <Trophy className="h-3.5 w-3.5" />
                {celebration === "first" ? "First Flight" : "Personal Best"}
              </motion.div>
            )}
            {goals.bar && (
              <div className="mx-auto mt-3 w-full max-w-xs px-2">
                <div
                  className="h-2 overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-label="Score compared with your best"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(goals.bar.fraction * 100)}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${goals.bar.fraction * 100}%` }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    className={
                      goals.bar.beaten
                        ? "h-full rounded-full bg-accent-amber"
                        : "h-full rounded-full bg-accent-blue"
                    }
                  />
                </div>
                <div className="mt-1 text-xs text-white/70">{goals.bar.label}</div>
              </div>
            )}
            {goals.unlock && (
              <div className="mt-1 text-xs text-white/70">
                {goals.unlock.coinsNeeded > 0
                  ? `${goals.unlock.coinsNeeded} coins to ${goals.unlock.label}`
                  : `${goals.unlock.label} is ready in the Shop`}
              </div>
            )}
            {ui.coinsThisRun > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-2 flex items-center justify-center gap-1.5 font-mono text-sm text-accent-amber"
              >
                <CoinsIcon className="h-4 w-4" />+
                <CountUp target={ui.coinsThisRun} reducedMotion={prefs.reducedMotion} /> coins
              </motion.div>
            )}
            {ui.coinsThisRun > 0 && (
              <ul className="mt-1 text-xs text-white/60">
                {coinBreakdown({
                  total: ui.coinsThisRun,
                  boostBonus: ui.coinBoostBonus,
                  pickups: ui.coinPickups,
                }).map((row) => (
                  <li key={row.label}>
                    {row.label}: +{row.amount}
                  </li>
                ))}
              </ul>
            )}
            <div className="mx-auto mt-3 grid max-w-md grid-cols-2 gap-2 px-2 text-xs text-white/75 sm:grid-cols-4">
              <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                <div className="text-[10px] tracking-wider text-white/50 uppercase">Survived</div>
                <div className="font-mono text-white tabular-nums">{ui.seconds.toFixed(0)}s</div>
              </div>
              <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                <div className="text-[10px] tracking-wider text-white/50 uppercase">Distance</div>
                <div className="font-mono text-white tabular-nums">{ui.distance}m</div>
              </div>
              <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                <div className="text-[10px] tracking-wider text-white/50 uppercase">Kills</div>
                <div className="font-mono text-white tabular-nums">{ui.kills}</div>
              </div>
              <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                <div className="text-[10px] tracking-wider text-white/50 uppercase">Peak Combo</div>
                <div
                  className="font-mono text-white tabular-nums"
                  style={{ color: comboColor(ui.comboPeak) }}
                >
                  {"\u00d7"}
                  {ui.comboPeak}
                </div>
              </div>
            </div>
            {ui.bossesDefeatedThisRun > 0 && (
              <div className="mt-2 flex items-center justify-center gap-1.5 font-mono text-sm text-red-300">
                <span>Bosses Defeated:</span>
                <span className="font-bold text-white">{ui.bossesDefeatedThisRun}</span>
              </div>
            )}
          </motion.div>

          <div className="flex w-full max-w-md items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              placeholder="Pilot name"
              maxLength={12}
              className="min-h-11 flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-base text-white placeholder-white/40 focus:border-accent-blue focus:outline-none"
            />
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                void submit();
              }}
              disabled={submitted || submitting || rejected}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent-amber px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              {submitted
                ? "Submitted"
                : rejected
                  ? "Not accepted"
                  : submitting
                    ? "Submitting"
                    : "Submit"}
            </motion.button>
          </div>

          <div className="w-full max-w-md rounded-lg border border-white/15 bg-white/5 p-3 text-sm">
            <div className="mb-2 text-xs font-bold tracking-widest text-white/60 uppercase">
              Top pilots
            </div>
            <ArcadeBoardTabs
              label="Leaderboard period"
              period={boardPeriod}
              onChange={setBoardPeriod}
              className="mb-2"
              activeClassName="border-indigo-400/60 bg-indigo-500/20 text-indigo-300"
              inactiveClassName="border-white/15 bg-white/5 text-white/60 hover:text-white"
            />
            {leaderboard.length === 0 ? (
              <p className="py-2 text-center text-xs text-white/50">
                {boardLoading
                  ? "Loading"
                  : boardError
                    ? "Could not load the board"
                    : boardPeriod === "daily"
                      ? "No scores yet today"
                      : boardPeriod === "weekly"
                        ? "No scores yet this week"
                        : "No scores yet"}
              </p>
            ) : (
              <ol className="space-y-1">
                {leaderboard.slice(0, 8).map((e) => (
                  <li
                    key={`${e.rank}-${e.name}-${e.createdAt}`}
                    className={
                      e.isYou
                        ? "flex items-center gap-2 font-semibold text-indigo-300"
                        : "flex items-center gap-2 text-white/85"
                    }
                  >
                    <span className="w-6 text-white/40 tabular-nums">{e.rank}.</span>
                    <span className="flex-1 truncate">{e.name}</span>
                    {typeof e.seconds === "number" && (
                      <span className="text-xs text-white/45 tabular-nums">{e.seconds}s</span>
                    )}
                    <span className="font-mono tabular-nums">{e.score}</span>
                  </li>
                ))}
              </ol>
            )}
            {leaderboardYou && !leaderboard.slice(0, 8).some((e) => e.isYou) && (
              <div className="mt-2 text-xs text-white/60">
                Your best: #{leaderboardYou.rank} ({leaderboardYou.score})
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 px-2 sm:gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={flyAgain}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent-blue/50 bg-accent-blue/20 px-4 py-2 text-xs font-bold tracking-wider text-accent-blue uppercase sm:px-5 sm:py-2.5 sm:text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              Fly again
            </motion.button>
            {isReturningPlayer && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShopOpen(true)}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-accent-amber/50 bg-accent-amber/20 px-4 py-2 text-xs font-bold tracking-wider text-accent-amber uppercase sm:px-5 sm:py-2.5 sm:text-sm"
              >
                <ShoppingCart className="h-4 w-4" />
                Shop
              </motion.button>
            )}
            {recordingBlob && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  const url = URL.createObjectURL(recordingBlob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `orbital-dodge-run-${Date.now()}.webm`;
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-400/50 bg-blue-500/20 px-4 py-2 text-xs font-bold tracking-wider text-blue-300 uppercase sm:px-5 sm:py-2.5 sm:text-sm"
              >
                Download Replay
              </motion.button>
            )}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                void (async () => {
                  const blob = await captureShareImage({
                    score: ui.score,
                    distance: ui.distance,
                    kills: ui.kills,
                  });
                  if (!blob) return;
                  const file = new File([blob], `orbital-dodge-${Date.now()}.png`, {
                    type: "image/png",
                  });
                  await shareRun({
                    score: ui.score,
                    file,
                    nav: navigator,
                    download: () => {
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = file.name;
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                    },
                  });
                })();
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-4 py-2 text-xs font-bold tracking-wider text-emerald-300 uppercase sm:px-5 sm:py-2.5 sm:text-sm"
            >
              <Share2 className="h-4 w-4" />
              Share
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
