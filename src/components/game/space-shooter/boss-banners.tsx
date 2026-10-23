import { BOSS_DISPLAY_NAMES } from "./boss-behaviors";
import type { UiState } from "./ui-state";

export function BossBanners({ ui, firstBossSeen }: { ui: UiState; firstBossSeen: boolean }) {
  return (
    <>
      {ui.boss?.phase === "intro" && (
        <div className="pointer-events-none absolute inset-x-0 top-[18%] z-30 flex flex-col items-center">
          <div className="animate-pulse text-xs tracking-[0.4em] text-red-400">INCOMING</div>
          <div className="text-3xl font-black text-white drop-shadow-[0_0_12px_rgba(239,68,68,0.6)] sm:text-5xl">
            {BOSS_DISPLAY_NAMES[ui.boss.id]}
          </div>
          {!firstBossSeen && (
            <div className="mt-2 max-w-xs text-center text-xs text-slate-300">
              Bosses interrupt normal flight. Shoot them to progress. Dodge their attacks.
            </div>
          )}
        </div>
      )}
      {/* Boss HP bar */}
      {ui.boss?.phase === "fighting" && (
        <div className="pointer-events-none absolute top-4 left-1/2 z-30 flex -translate-x-1/2 flex-col items-center gap-1">
          <div className="text-[10px] tracking-[0.3em] text-red-300">
            {BOSS_DISPLAY_NAMES[ui.boss.id]}
          </div>
          <div className="h-2 w-48 overflow-hidden rounded-sm border border-red-500/50 bg-black/60 sm:w-64">
            <div
              className="h-full bg-linear-to-r from-red-600 to-red-400 transition-[width] duration-100"
              style={{ width: `${ui.boss.hpPct}%` }}
            />
          </div>
          {ui.boss.id === "swarm-mother" && ui.boss.hasDrone && (
            <div className="animate-pulse text-[10px] tracking-[0.3em] text-fuchsia-300">
              CLEAR DRONES
            </div>
          )}
        </div>
      )}
    </>
  );
}
