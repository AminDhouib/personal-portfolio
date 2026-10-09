"use client";

import type { HudState } from "../controller";
import { T, fmt } from "../strings";
import { clock, money, percent } from "./format";
import { PANEL } from "./surface";

function Readout({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col leading-tight">
      <dt className="text-[9px] tracking-wider text-[#71717a] uppercase">{label}</dt>
      <dd className={`font-mono text-xs ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

/** The run at a glance: money and its burn, reputation, load, time, goodput, score, power. */
export function StatusBar({ hud }: { hud: HudState }) {
  const rep = Math.max(0, Math.round(hud.reputation));
  return (
    <dl
      className={`pointer-events-auto flex flex-wrap items-end gap-x-4 gap-y-1 px-3 py-1.5 ${PANEL}`}
    >
      <Readout
        label={T.budget}
        value={money(hud.money)}
        tone={hud.money < 0 ? "text-[#ef4444]" : undefined}
      />
      <Readout label={T.upkeep_label} value={`${money(hud.upkeepPerMin)}${T.per_minute}`} />
      <Readout
        label={T.reputation}
        value={`${rep}%`}
        tone={rep < 30 ? "text-[#ef4444]" : rep < 60 ? "text-[#f59e0b]" : undefined}
      />
      <Readout label={T.load_rps} value={hud.rps.toFixed(1)} />
      <Readout label={T.elapsed_time} value={clock(hud.time)} />
      <Readout label={T.goodput_label} value={hud.goodput === null ? "-" : percent(hud.goodput)} />
      {hud.mode === "survival" && (
        <Readout label={T.total_score} value={hud.score.toLocaleString("en-US")} />
      )}
      {hud.power && (
        <Readout
          label={T.power_label}
          value={fmt(T.power_hud, { used: hud.power.usedKw, cap: hud.power.capKw })}
          tone={hud.power.usedKw > hud.power.capKw ? "text-[#ef4444]" : undefined}
        />
      )}
    </dl>
  );
}
