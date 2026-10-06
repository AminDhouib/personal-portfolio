import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GAMES, GAMES_BY_SLUG } from "../games-meta";
import { GAME_CONTENT } from "../content";
import { GameCard } from "@/components/game/game-card";
import { GameAbout } from "@/components/game/game-about";
import { PasswordGame2Loader } from "@/components/game/password-game-2";
import {
  breadcrumbNode,
  faqPageNode,
  graph,
  serializeJsonLd,
  videoGameNode,
} from "@/lib/structured-data";

const SITE_ORIGIN = "https://amindhou.com";
const PATH = "/games/password-game";
const GAME = GAMES_BY_SLUG["password-game"];
const CONTENT = GAME_CONTENT["password-game"];
const SOCIAL_TITLE = "The Password Game 2 — Terms and Conditions Apply";

// No images key at all: Next applies this segment's opengraph-image.tsx only
// while openGraph and twitter leave the key unset (even `images: undefined`
// blocks it), and Twitter then inherits the Open Graph image.
export const metadata = {
  title: CONTENT.seoTitle,
  description: CONTENT.seoDescription,
  alternates: {
    canonical: `${SITE_ORIGIN}${PATH}`,
  },
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}${PATH}`,
    title: SOCIAL_TITLE,
    description: CONTENT.seoDescription,
    siteName: "Amin Dhouib",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: SOCIAL_TITLE,
    description: CONTENT.seoDescription,
  },
} satisfies Metadata;

const jsonLd = graph(
  videoGameNode({
    name: GAME.title,
    description: CONTENT.seoDescription,
    path: PATH,
    genre: CONTENT.genre,
    playMode: CONTENT.playMode,
  }),
  faqPageNode(CONTENT.faq, `${SITE_ORIGIN}${PATH}#faq`),
  breadcrumbNode([
    { name: "Home", path: "/" },
    { name: "Games", path: "/games" },
    { name: GAME.title, path: PATH },
  ]),
);

export default function PasswordGamePage() {
  const others = GAMES.filter((g) => g.slug !== "password-game" && !g.hidden);
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

        <div className="max-w-3xl">
          {/* Server-rendered heading: the interactive shell is client-only
              (ssr: false), so without this the page ships no h1 in its SSR HTML.
              sr-only because the shell renders its own visible wordmark. */}
          <h1 className="sr-only">{GAME.title}</h1>
          <PasswordGame2Loader />
        </div>

        <GameAbout title={GAME.title} content={CONTENT} />

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
