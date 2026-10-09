"use client";

import { X } from "lucide-react";
import type { HudState } from "../controller";
import { T } from "../strings";
import { percent } from "./format";
import { BUTTON, BUTTON_IDLE, PANEL } from "./surface";

/**
 * Live per-node metrics (utilisation, queue, error rate, latency), the newest
 * sample of the sim's metrics ring. Locked until a Monitoring node is on the
 * board: you cannot fix what you cannot see.
 */
export function MetricsPanel({ hud, onClose }: { hud: HudState; onClose: () => void }) {
  return (
    <section
      aria-label={T.metrics}
      className={`pointer-events-auto flex max-h-[50vh] w-72 max-w-full flex-col gap-2 overflow-y-auto overscroll-contain p-3 text-xs ${PANEL}`}
    >
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[#ededed]">{T.metrics}</h3>
        <button
          type="button"
          aria-label={T.close}
          onClick={onClose}
          className={`${BUTTON} ${BUTTON_IDLE}`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </header>
      {!hud.monitoring ? (
        <div className="flex flex-col gap-1 text-[#a1a1aa]">
          <p>{T.metrics_locked}</p>
          <p className="italic">{T.metrics_locked_teach}</p>
        </div>
      ) : (
        <table className="w-full font-mono text-[11px]">
          <thead className="text-[#71717a]">
            <tr>
              <th scope="col" className="text-left font-normal">
                {T.service}
              </th>
              <th scope="col" className="text-right font-normal">
                {T.metrics_col_util}
              </th>
              <th scope="col" className="text-right font-normal">
                {T.metrics_col_queue}
              </th>
              <th scope="col" className="text-right font-normal">
                {T.metrics_col_err}
              </th>
              <th scope="col" className="text-right font-normal">
                {T.metrics_col_lat}
              </th>
            </tr>
          </thead>
          <tbody>
            {hud.metrics.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="truncate text-left font-normal">
                  {row.name}
                </th>
                <td
                  className={`text-right ${row.util >= 1 ? "text-[#ef4444]" : row.util >= 0.8 ? "text-[#f59e0b]" : ""}`}
                >
                  {percent(row.util)}
                </td>
                <td className="text-right">{row.queue}</td>
                <td className={`text-right ${row.err > 0.2 ? "text-[#ef4444]" : ""}`}>
                  {percent(row.err)}
                </td>
                <td className="text-right">{Math.round(row.lat)}ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
