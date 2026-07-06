"use client";

import { useEffect, useState } from "react";
import { Trophy, RefreshCw } from "lucide-react";
import { formatTime } from "@/components/game/password-game/result-card-util";
import { dailySeed, todayDateString } from "@/components/game/password-game/daily";

interface Entry {
  name: string;
  seed: number;
  time: number;
  rules: number;
  createdAt: string;
}

export function LeaderboardClient() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [seedFilter, setSeedFilter] = useState("");
  const [tab, setTab] = useState<"all" | "daily">("all");
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = async (seed: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = seed.trim()
        ? `/api/password-game/leaderboard?seed=${encodeURIComponent(seed.trim())}`
        : `/api/password-game/leaderboard`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { entries: Entry[] };
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries("");
  }, []);

  useEffect(() => {
    if (tab === "daily") {
      fetchEntries(String(dailySeed(todayDateString())));
    } else {
      fetchEntries("");
    }
  }, [tab]);

  return (
    <div className="w-full rounded-xl border border-(--border) bg-(--card) p-5 sm:p-6">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTab("all")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "all"
              ? "border-accent-pink/50 bg-accent-pink/10 text-accent-pink"
              : "border-(--border) text-(--muted) hover:text-(--foreground)"
          }`}
        >
          All time
        </button>
        <button
          type="button"
          onClick={() => setTab("daily")}
          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === "daily"
              ? "border-accent-amber/50 bg-accent-amber/10 text-accent-amber"
              : "border-(--border) text-(--muted) hover:text-(--foreground)"
          }`}
        >
          Today&apos;s Daily
        </button>
      </div>
      {tab === "all" && (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            placeholder="Filter by seed (optional)"
            value={seedFilter}
            onChange={(e) => setSeedFilter(e.target.value)}
            className="flex-1 rounded-md border border-(--border) bg-(--background) px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => fetchEntries(seedFilter)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-accent-pink/50 bg-accent-pink/10 px-4 py-2 text-sm font-medium text-accent-pink hover:bg-accent-pink/20"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      {entries.length === 0 && !loading ? (
        <div className="py-12 text-center text-sm text-(--muted)">
          <Trophy className="mx-auto mb-2 h-8 w-8 opacity-50" />
          {seedFilter ? `No entries for seed ${seedFilter}.` : "No entries yet. Be the first."}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-(--muted) uppercase">
                <th className="py-2 text-left">#</th>
                <th className="py-2 text-left">Name</th>
                <th className="py-2 text-left">Time</th>
                <th className="py-2 text-left">Seed</th>
                <th className="py-2 text-left">Rules</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => (
                <tr key={`${e.seed}-${e.createdAt}-${i}`} className="border-t border-(--border)">
                  <td className="py-2 font-mono text-(--muted)">{i + 1}</td>
                  <td className="py-2 font-medium">{e.name}</td>
                  <td className="py-2 font-mono">{formatTime(e.time)}</td>
                  <td className="py-2 font-mono text-xs text-(--muted)">
                    <a
                      href={`/games/password-game?seed=${e.seed}`}
                      className="hover:text-accent-pink"
                    >
                      {e.seed}
                    </a>
                  </td>
                  <td className="py-2 font-mono">{e.rules}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
