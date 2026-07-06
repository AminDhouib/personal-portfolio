import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata = {
  title: "Password Game 2 — Leaderboard",
  description: "Top times across all seeds of Password Game 2.",
};

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/games/password-game"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Game
        </Link>

        <h1 className="mb-2 font-display text-4xl font-black tracking-tight">Leaderboard</h1>
        <p className="mb-8 text-(--muted)">
          Fastest completed runs. Filter by seed to race a friend.
        </p>

        <LeaderboardClient />
      </div>
    </div>
  );
}
