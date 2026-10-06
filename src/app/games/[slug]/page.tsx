import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";
import { GAMES, getGameMeta } from "../games-meta";
import { GAME_CONTENT } from "../content";
import { GameLoader } from "@/components/game/game-loader";
import { GameCard } from "@/components/game/game-card";
import { GameAbout } from "@/components/game/game-about";
import {
  breadcrumbNode,
  faqPageNode,
  graph,
  serializeJsonLd,
  videoGameNode,
} from "@/lib/structured-data";

const SITE_ORIGIN = "https://amindhou.com";

export function generateStaticParams() {
  // password-game has its own top-level route; Next resolves it statically.
  return GAMES.filter((g) => !g.external).map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const game = getGameMeta(slug);
  if (!game) return {};
  const content = GAME_CONTENT[game.slug];
  const canonical = `${SITE_ORIGIN}/games/${slug}`;
  const socialTitle = `${game.title}, a free browser game by Amin Dhouib`;
  // No images here: the segment's opengraph-image.tsx outranks config images,
  // and Twitter inherits it while twitter.images stays unset.
  return {
    title: content.seoTitle,
    description: content.seoDescription,
    alternates: {
      canonical,
      types: {
        "application/rss+xml": "/feed.xml",
      },
    },
    openGraph: {
      type: "website",
      url: canonical,
      title: socialTitle,
      description: content.seoDescription,
      siteName: "Amin Dhouib",
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: content.seoDescription,
    },
    // A hidden game still serves, but must not be indexed.
    ...(game.hidden ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function GameDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const game = getGameMeta(slug);
  if (!game || game.external) notFound();

  const content = GAME_CONTENT[game.slug];
  const path = `/games/${game.slug}`;
  const others = GAMES.filter((g) => g.slug !== game.slug && !g.hidden);
  const jsonLd = graph(
    videoGameNode({
      name: game.title,
      description: content.seoDescription,
      path,
      genre: content.genre,
      playMode: content.playMode,
    }),
    faqPageNode(content.faq, `${SITE_ORIGIN}${path}#faq`),
    breadcrumbNode([
      { name: "Home", path: "/" },
      { name: "Games", path: "/games" },
      { name: game.title, path },
    ]),
  );

  return (
    <div className="min-h-screen pt-24 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
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

        <GameAbout title={game.title} content={content} />

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
