import type { SeriesPoint } from "./engine/series";
import { graphPath, niceMax } from "./graph-path";

const W = 600;

interface WpmGraphProps {
  points: SeriesPoint[];
  /** Live draws the net line only; full adds raw WPM and a mark per second with errors. */
  variant: "live" | "full";
}

/** A hand-drawn SVG chart of WPM per second; no chart library. */
export function WpmGraph({ points, variant }: WpmGraphProps) {
  if (points.length === 0) return null;
  const full = variant === "full";
  const h = full ? 160 : 40;
  const net = points.map((p) => p.wpm);
  const raw = points.map((p) => p.raw);
  const max = niceMax(full ? [...net, ...raw] : net);
  const first = Math.round(net[0] ?? 0);
  const last = Math.round(net.at(-1) ?? 0);
  const peak = Math.round(Math.max(...net));
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  return (
    <svg
      role="img"
      aria-label={`WPM over time: from ${first} to ${last}, peak ${peak}`}
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
}
