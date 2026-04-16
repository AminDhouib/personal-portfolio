import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";
import { GAMES } from "../games-meta";
import { GameCard } from "@/components/game/game-card";

const PasswordGame = dynamic(
  () => import("@/components/game/password-game/password-game").then((m) => m.PasswordGame),
  {
    loading: () => (
      <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
        <div className="text-(--muted) text-sm">Loading...</div>
      </div>
    ),
  }
);

export const metadata = {
  title: "Password Game 2 — Amin Dhouib",
  description: "A spiritual successor to Neal Fun's Password Game. Seeded chaos, every run unique.",
};

export default function PasswordGamePage() {
  const others = GAMES.filter((g) => g.slug !== "password-game");
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/games"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          All Games
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-2">
          Password Game 2
        </h1>
        <p className="text-(--muted) mb-8">
          A spiritual successor with seeded runs and escalating chaos. Every seed is a different game.
        </p>

        <div className="max-w-3xl">
          <PasswordGame />
        </div>

        <section className="mt-16">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-(--muted) mb-4">
            Other games you can play
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {others.map((g) => (
              <GameCard key={g.slug} game={g} size="sm" />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
