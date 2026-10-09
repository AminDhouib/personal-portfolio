import type { SeriesPoint } from "./engine/series";
import { graphPath, niceMax } from "./graph-path";

const W = 600;

const LEGEND = [
  ["Net WPM", "h-0.5 w-4 rounded bg-accent-green"],
  ["Raw WPM", "h-0.5 w-4 rounded bg-(--muted)"],
  ["Errors", "h-3 w-0.5 rounded bg-red-400"],
] as const;

interface WpmGraphProps {
  points: SeriesPoint[];
  /** Live draws the net line only; full adds raw WPM and a mark per second with errors. */
  variant: "live" | "full";
  /** The ghost cumulative WPM per second (full only): a dashed line to beat. */
  ghost?: number[] | null;
}

/** A hand-drawn SVG chart of WPM per second; no chart library. */
export function WpmGraph({ points, variant, ghost = null }: WpmGraphProps) {
  if (points.length === 0) return null;
  const full = variant === "full";
  const h = full ? 160 : 40;
  const net = points.map((p) => p.wpm);
  const raw = points.map((p) => p.raw);
  const ghostLine = full && ghost && ghost.length > 0 ? ghost : null;
  const max = niceMax(full ? [...net, ...raw, ...(ghostLine ?? [])] : net);
  const first = Math.round(net[0] ?? 0);
  const last = Math.round(net.at(-1) ?? 0);
  const peak = Math.round(Math.max(...net));
  const errorCount = points.reduce((n, p) => n + p.errors, 0);
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const chart = (
    <svg
      role="img"
      aria-label={`WPM over time: from ${first} to ${last}, peak ${peak}${full ? `, ${errorCount} ${errorCount === 1 ? "error" : "errors"}` : ""}`}
      viewBox={`0 0 ${W} ${h}`}
      preserveAspectRatio="none"
      className={full ? "h-40 w-full" : "h-10 w-full"}
    >
      <line x1="0" y1={h} x2={W} y2={h} className="stroke-(--border)" strokeWidth="1" />
      {full && (
        <path
          data-line="raw"
          d={graphPath(raw, { w: W, h, max })}
          fill="none"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          className="stroke-(--muted)"
        />
      )}
      {ghostLine && (
        <path
          data-line="ghost"
          d={graphPath(ghostLine, { w: W, h, max })}
          fill="none"
          strokeWidth="2"
          strokeDasharray="6 4"
          vectorEffect="non-scaling-stroke"
          className="stroke-accent-blue"
        />
      )}
      <path
        data-line="net"
        d={graphPath(net, { w: W, h, max })}
        fill="none"
        strokeWidth="2.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        className="stroke-accent-green"
      />
      {full &&
        points.map((p, i) =>
          p.errors > 0 ? (
            <line
              key={i}
              data-testid="ts-err"
              x1={points.length > 1 ? i * step : 0}
              x2={points.length > 1 ? i * step : 0}
              y1={h - 10}
              y2={h}
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
              className="stroke-red-400"
            />
          ) : null,
        )}
    </svg>
  );
  if (!full) return chart;
  return (
    <div>
      {chart}
      <ul
        data-testid="ts-graph-legend"
        className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-(--muted)"
      >
        {LEGEND.map(([label, swatch]) => (
          <li key={label} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={swatch} />
            {label}
          </li>
        ))}
        {ghostLine && (
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-4 border-t-2 border-dashed border-accent-blue" />
            Your best
          </li>
        )}
      </ul>
    </div>
  );
}
