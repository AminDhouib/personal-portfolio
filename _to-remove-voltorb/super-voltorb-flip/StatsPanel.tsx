"use client";

import type { Stats } from "./types";

export function StatsPanel({ stats }: { stats: Stats }) {
  const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0;
  return (
    <details className="border border-(--border) rounded-lg p-3 bg-(--card) mt-3">
      <summary className="cursor-pointer font-medium text-sm">Stats</summary>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <dt className="opacity-70">Games Played</dt>
        <dd>{stats.gamesPlayed}</dd>
        <dt className="opacity-70">Wins / Losses</dt>
        <dd>
          {stats.wins} / {stats.losses}
        </dd>
        <dt className="opacity-70">Win Rate</dt>
        <dd>{winRate}%</dd>
        <dt className="opacity-70">Current Streak</dt>
        <dd>{stats.currentStreak}</dd>
        <dt className="opacity-70">Best Streak</dt>
        <dd>{stats.bestStreak}</dd>
        <dt className="opacity-70">Best Round</dt>
        <dd>{stats.highestSingleRoundCoins} coins</dd>
        <dt className="opacity-70">Highest Level</dt>
        <dd>{stats.highestLevelCleared}</dd>
        <dt className="opacity-70">Lifetime Coins</dt>
        <dd>{stats.lifetimeCoins}</dd>
      </dl>
    </details>
  );
}
