import { motion } from "framer-motion";
import { Rocket, Shield, Crosshair, Zap, Target, Magnet } from "lucide-react";
import { comboColor } from "./difficulty";
import { POWERUP_DEFS, POWERUP_DURATION_MS } from "./types";
import type { UiState } from "./ui-state";

export function RunHud({ ui }: { ui: UiState }) {
  return (
    <div className="pointer-events-none absolute top-3 right-3 left-3 flex flex-col gap-1.5 text-[10px] sm:right-auto sm:text-sm">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/50 px-2.5 py-1.5 backdrop-blur-sm sm:gap-4 sm:px-3">
        <span className="flex items-center gap-1.5 font-mono font-bold text-accent-blue tabular-nums">
          <Rocket className="h-3.5 w-3.5" />
          {ui.score}
        </span>
        <span className="font-mono text-white/80 tabular-nums">{ui.distance}m</span>
        <span className="font-mono text-white/80 tabular-nums">{ui.kills} kills</span>
        {ui.combo > 1 && (
          <motion.span
            key={ui.combo}
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: ui.comboFlash ? 1.5 : 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
            className="font-mono font-bold tabular-nums"
            style={{
              color: comboColor(ui.combo),
              textShadow: ui.comboFlash ? `0 0 10px ${comboColor(ui.combo)}` : "none",
            }}
          >
            {"\u00d7"}
            {ui.combo}
          </motion.span>
        )}
        <span className="font-mono text-white/50 tabular-nums">{ui.seconds.toFixed(0)}s</span>
      </div>
      {/* Active power-ups */}
      {ui.active.length > 0 && (
        <div className="flex items-center gap-2">
          {ui.active.map((a) => {
            const def = POWERUP_DEFS[a.type];
            const Icon =
              a.type === "shield"
                ? Shield
                : a.type === "triple"
                  ? Crosshair
                  : a.type === "rapid"
                    ? Zap
                    : a.type === "warp"
                      ? Rocket
                      : a.type === "magnet"
                        ? Magnet
                        : Target;
            const pct = Math.min(100, (a.remainingMs / POWERUP_DURATION_MS) * 100);
            return (
              <div
                key={a.type}
                className="flex items-center gap-1 rounded-md border border-white/10 bg-black/50 px-2 py-1 backdrop-blur-sm"
                style={{ borderColor: `${def.color}55` }}
              >
                <Icon className="h-3 w-3" style={{ color: def.color }} />
                <div className="h-1 w-10 overflow-hidden rounded-full bg-white/15">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${pct}%`, background: def.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
