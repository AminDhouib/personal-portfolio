import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GAMES } from "../games-meta";
import { GameCard } from "@/components/game/game-card";
import { PasswordGameLoader } from "@/components/game/password-game/password-game-loader";

export const metadata = {
  title: "Password Game 2",
  description: "A spiritual successor to Neal Fun's Password Game. Seeded chaos, every run unique.",
};

export default function PasswordGamePage() {
  const others = GAMES.filter((g) => g.slug !== "password-game");
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/games"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          All Games
        </Link>

        <h1 className="mb-2 font-display text-4xl font-black tracking-tight">Password Game 2</h1>
        <p className="mb-8 text-(--muted)">
          A spiritual successor with seeded runs and escalating chaos. Every seed is a different
          game.
        </p>

        <div className="max-w-3xl">
          <PasswordGameLoader />
        </div>

        <section className="mt-16">
          <h2 className="mb-4 font-display text-sm font-bold tracking-wider text-(--muted) uppercase">
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
