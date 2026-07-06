import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { GAMES, getGameMeta } from "../games-meta";
import { GameLoader } from "@/components/game/game-loader";
import { GameCard } from "@/components/game/game-card";

export function generateStaticParams() {
  // password-game has its own top-level route; Next resolves it statically.
  return GAMES.filter((g) => !g.external).map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameMeta(slug);
  if (!game) return {};
  return {
    title: game.title,
    description: game.tagline,
  };
}

export default async function GameDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameMeta(slug);
  if (!game || game.external) notFound();

  const others = GAMES.filter((g) => g.slug !== game.slug && !g.hidden);

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

        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl font-black tracking-tight">{game.title}</h1>
            <p className="mt-2 text-base text-(--muted)">{game.tagline}</p>
          </div>
          {game.controls && (
            <p className="max-w-xs text-xs text-(--muted) sm:text-right">{game.controls}</p>
          )}
        </div>

        <p className="mb-6 max-w-2xl text-sm leading-relaxed text-(--foreground)/80">
          {game.description}
        </p>

        <Suspense
          fallback={
            <div className="h-[420px] w-full rounded-xl border border-(--border) bg-(--card)" />
          }
        >
          <GameLoader key={game.slug} slug={game.slug} />
        </Suspense>

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
