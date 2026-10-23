import { motion, AnimatePresence } from "framer-motion";
import { Trophy } from "lucide-react";
import { ACHIEVEMENTS } from "../achievements";
import { PanelClose } from "./panel-close";
import type { Profile } from "../profile";

export function TrophiesPanel({
  achievementsOpen,
  setAchievementsOpen,
  profile,
}: {
  achievementsOpen: boolean;
  setAchievementsOpen: (open: boolean) => void;
  profile: Profile;
}) {
  return (
    <AnimatePresence>
      {achievementsOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-10 flex flex-col bg-black/80 backdrop-blur-md"
        >
          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-white/10 bg-black/85 px-4 pt-4 pb-3 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <Trophy className="h-5 w-5 text-accent-amber" />
              <h3 className="text-lg font-bold text-white">Trophies</h3>
              <div className="text-[10px] font-bold tracking-[0.25em] text-white/50 uppercase">
                {profile.unlockedAchievements.length} / {ACHIEVEMENTS.length}
              </div>
            </div>
            <PanelClose label="Close trophies" onClose={() => setAchievementsOpen(false)} />
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4">
            <div className="mx-auto grid w-full max-w-3xl grid-cols-1 gap-2 sm:grid-cols-2">
              {ACHIEVEMENTS.map((a) => {
                const owned = profile.unlockedAchievements.includes(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                      owned
                        ? "border-amber-500/50 bg-amber-900/20"
                        : "border-white/10 bg-white/5 opacity-70"
                    }`}
                  >
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded text-xs font-black ${
                        owned ? "bg-amber-400 text-amber-900" : "bg-slate-700 text-slate-500"
                      }`}
                    >
                      {a.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-sm font-bold ${owned ? "text-white" : "text-slate-400"}`}
                      >
                        {a.name}
                      </div>
                      <div className="text-xs text-slate-400">{a.description}</div>
                      {a.unlocksCosmeticId && owned && (
                        <div className="mt-1 text-[10px] text-emerald-400">
                          Unlocked cosmetic: {a.unlocksCosmeticId}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
