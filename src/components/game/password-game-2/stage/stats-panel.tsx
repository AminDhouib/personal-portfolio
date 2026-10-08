import { streakAsOf, type Pg2Stats } from "../stats/stats";

/** Whole minutes and seconds, "mm:ss". */
export function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Personal bests and the daily streak, from the device's own `pg2:stats`. */
export function StatsPanel({ stats, today }: { stats: Pg2Stats; today: string }) {
  if (stats.runs === 0) {
    return (
      <p className="mt-6 text-xs text-[color:var(--pg2-muted)]" data-testid="pg2-stats">
        No runs yet. Your best time and daily streak will show here.
      </p>
    );
  }
  const streak = streakAsOf(stats, today);
  const rows: Array<[string, string]> = [
    ["Best time", stats.bestMs === null ? "--:--" : formatClock(stats.bestMs)],
    ["Daily best", stats.dailyBestMs === null ? "--:--" : formatClock(stats.dailyBestMs)],
    ["Runs", String(stats.runs)],
    ["Streak", `${streak}-day streak`],
    ["Best streak", `${stats.bestStreak}-day streak`],
  ];
  return (
    <dl
      className="mt-6 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3"
      data-testid="pg2-stats"
    >
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-[color:var(--pg2-muted)]">{k}</dt>
          <dd className="font-mono font-semibold text-[color:var(--pg2-ink)]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
