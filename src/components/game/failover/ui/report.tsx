"use client";

import type { HudState } from "../controller";
import type { FailoverStats } from "../stats";
import { T, fmt } from "../strings";
import { clock, money, percent } from "./format";
import { DailyPanel } from "./daily-panel";
import { badgeText } from "./messages";
import { TOUCH } from "./surface";

const OVER_TEXT: Record<NonNullable<HudState["over"]>, string> = {
  reputation: T.over_reputation,
  money: T.over_money,
  retired: T.over_retired,
};

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[#a1a1aa]">{label}</dt>
      <dd className={`font-mono ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}

/**
 * The end of a run: why it ended, how long it lasted and its score against the
 * device's best, then the post-mortem (on-time share, the top failure reasons,
 * the hottest nodes) and where the money went. Reads the HUD's run summary.
 */
export function Report({
  hud,
  best,
  onPlayAgain,
}: {
  hud: HudState;
  best: FailoverStats;
  onPlayAgain: () => void;
}) {
  const r = hud.report;
  if (!hud.over || !r) return null;
  const total = r.onTime + r.late + r.failures;
  const spent = Object.values(r.expenses).reduce((sum, n) => sum + n, 0);
  const lines: [string, number][] = [
    [T.hardware, r.expenses.services],
    [T.upkeep_toggle, r.expenses.upkeep],
    [T.repair, r.expenses.repairs + r.expenses.autoRepair],
    [T.mitigation, r.expenses.mitigation],
    [T.breaches, r.expenses.breach],
    [T.dlq_short, r.expenses.dlq],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="failover-report-title"
      className="absolute inset-0 overflow-y-auto overscroll-contain bg-[#050505]/80 p-3 text-[#ededed]"
    >
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-xl border border-[#27272a] bg-[#0b0b0d]/95 p-4">
        <header className="text-center">
          <h2 id="failover-report-title" className="font-display text-2xl font-black">
            {T.run_over}
          </h2>
          {hud.mode === "sandbox" && (
            <p className="font-mono text-xs tracking-wider text-[#f59e0b]">{T.sandbox_mode}</p>
          )}
          <p className="text-sm text-[#a1a1aa]">{OVER_TEXT[hud.over]}</p>
          <p className="mt-1 font-mono text-sm">{fmt(T.survived, { time: clock(hud.time) })}</p>
          {hud.mode === "survival" && (
            <p className="font-mono text-sm">
              {fmt(T.final_score, { score: hud.score.toLocaleString("en-US") })}
            </p>
          )}
          {hud.mode === "survival" && best.runs > 0 && (
            <p className="text-xs text-[#a1a1aa]">
              {fmt(T.best_line, {
                time: clock(best.bestSeconds),
                score: best.bestScore.toLocaleString("en-US"),
              })}
            </p>
          )}
        </header>

        {hud.daily?.result && <DailyPanel result={hud.daily.result} />}

        <section aria-labelledby="failover-report-what" className="text-xs">
          <h3 id="failover-report-what" className="mb-1 text-sm font-semibold">
            {T.report_title}
          </h3>
          <p>
            {fmt(T.report_served, {
              onTime: r.onTime,
              total,
              pct: total > 0 ? Math.round((r.onTime / total) * 100) : 0,
            })}
            {r.late > 0 && `, ${fmt(T.report_late, { n: r.late })}`}
          </p>
          <h4 className="mt-2 text-[#a1a1aa]">{T.report_top_failures}</h4>
          {r.topReasons.length === 0 ? (
            <p>{T.report_none}</p>
          ) : (
            <ul>
              {r.topReasons.map((reason) => (
                <li key={reason.key} className="flex justify-between font-mono">
                  <span>{badgeText(reason.key)}</span>
                  <span>{reason.count}</span>
                </li>
              ))}
            </ul>
          )}
          <h4 className="mt-2 text-[#a1a1aa]">{T.report_peak_load}</h4>
          {r.peaks.length === 0 ? (
            <p>{T.report_none}</p>
          ) : (
            <ul>
              {r.peaks.map((p) => (
                <li key={p.id} className="flex justify-between font-mono">
                  <span>{p.name}</span>
                  <span>
                    {percent(p.util)} @ {clock(p.atSec)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="failover-report-money" className="text-xs">
          <h3 id="failover-report-money" className="mb-1 text-sm font-semibold">
            {T.finances}
          </h3>
          <dl className="flex flex-col gap-0.5">
            <Row label={T.income} value={money(r.income)} />
            {lines
              .filter(([, amount]) => amount > 0)
              .map(([label, amount]) => (
                <Row key={label} label={label} value={money(-amount)} />
              ))}
            <Row
              label={T.net_profit}
              value={money(r.income - spent)}
              tone={r.income - spent < 0 ? "text-[#ef4444]" : "text-[#22c55e]"}
            />
          </dl>
        </section>

        <button
          type="button"
          onClick={onPlayAgain}
          className={`min-h-11 rounded-lg border border-[#06b6d4] px-5 font-semibold text-[#06b6d4] hover:bg-[#06b6d4]/10 ${TOUCH}`}
        >
          {T.play_again}
        </button>
      </div>
    </div>
  );
}
