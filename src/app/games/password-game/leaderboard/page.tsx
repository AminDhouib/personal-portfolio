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
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Game
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-2">
          Leaderboard
        </h1>
        <p className="text-(--muted) mb-8">
          Fastest completed runs. Filter by seed to race a friend.
        </p>

        <LeaderboardClient />
      </div>
    </div>
  );
}
