import { motion, AnimatePresence } from "framer-motion";
import { Trophy, ShoppingCart, Coins as CoinsIcon } from "lucide-react";
import { startRun } from "./run-init";
import type { RefObject } from "react";
import type { Profile } from "../profile";
import type { GameRefs } from "./types";
import type { UiState } from "./ui-state";

export function ArmedMenu({
  ui,
  gameRefs,
  profile,
  isReturningPlayer,
  isTouch,
  panelOpen,
  setShopOpen,
  setAchievementsOpen,
}: {
  ui: UiState;
  gameRefs: RefObject<GameRefs>;
  profile: Profile;
  isReturningPlayer: boolean;
  isTouch: boolean;
  panelOpen: boolean;
  setShopOpen: (open: boolean) => void;
  setAchievementsOpen: (open: boolean) => void;
}) {
  return (
    <AnimatePresence>
      {ui.status === "armed" && !isReturningPlayer && (
        <motion.div
          inert={panelOpen}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3"
        >
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              const g = gameRefs.current;
              if (g.status === "armed") startRun(g);
            }}
            className="rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-10 py-3 text-lg font-bold tracking-wider text-white uppercase shadow-lg shadow-accent-blue/30"
            type="button"
          >
            Play
          </motion.button>
          <div className="text-[10px] tracking-[0.25em] text-white/50 uppercase">
            Cannons fire automatically · {isTouch ? "drag to steer" : "mouse or WASD"}
          </div>
        </motion.div>
      )}
      {ui.status === "armed" && isReturningPlayer && (
        <motion.div
          // An open panel covers these buttons; inert keeps Tab off them.
          inert={panelOpen}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4 }}
          className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3"
        >
          <div className="flex items-center gap-1.5 rounded-md border border-accent-amber/40 bg-accent-amber/15 px-2.5 py-1 font-mono text-xs text-accent-amber">
            <CoinsIcon className="h-3.5 w-3.5" />
            {profile.walletCoins}
          </div>
          <div className="flex w-full flex-wrap items-center justify-center gap-2 px-3 sm:gap-3">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                const g = gameRefs.current;
                if (g.status === "armed") startRun(g);
              }}
              className="min-h-11 rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-5 py-3 text-base font-bold tracking-wider text-white uppercase shadow-lg shadow-accent-blue/30 sm:px-7"
            >
              Play
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShopOpen(true)}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-accent-amber/50 bg-accent-amber/20 px-4 py-3 text-sm font-bold tracking-wider text-accent-amber uppercase sm:px-5"
            >
              <ShoppingCart className="h-4 w-4" />
              Shop
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setAchievementsOpen(true)}
              className="flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm font-bold tracking-wider text-white/80 uppercase sm:px-5"
            >
              <Trophy className="h-4 w-4" />
              Trophies
            </motion.button>
          </div>
          <div className="text-[10px] tracking-[0.25em] text-white/50 uppercase">
            {isTouch
              ? "Drag to steer · cannons auto-fire"
              : "Mouse or WASD to steer · cannons auto-fire"}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
