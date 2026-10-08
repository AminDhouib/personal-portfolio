import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GAMES, GAMES_BY_SLUG } from "../games-meta";
import { GAME_CONTENT } from "../content";
import { PASSWORD_GAME_CREDIT, PASSWORD_GAME_PAGE_INTRO } from "../content/password-game";
import { PG2_HINTS_PATH } from "./hints/hints-content";
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

// The on-screen keyboard resizes only the visual viewport, never the layout viewport, so the
// phone play sheet (which tracks visualViewport) is the one thing that reacts to it.
export const viewport: Viewport = { interactiveWidget: "resizes-visual" };

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
      {/* The play stage is a two-column layout (sticky stage card + rule column), so
          the container is max-w-6xl. The editorial blocks around it stay at max-w-5xl,
          centred, so they sit where they always did. */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/games"
            className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
          >
            <ArrowLeft className="h-4 w-4" />
            All Games
          </Link>
        </div>

        <div>
          {/* Server-rendered heading, intro and credit: the interactive shell is
              client-only (ssr: false), so without these the page ships no h1 and no
              visible copy in its SSR HTML. The shell renders its own wordmark below. */}
          <div className="mx-auto mb-6 max-w-5xl">
            <h1 className="font-display text-lg font-bold tracking-tight text-(--muted) sm:text-xl">
              {GAME.title}: the sign-up form that fights back
            </h1>
            <p
              data-testid="pg2-page-intro"
              className="mt-2 max-w-2xl text-sm leading-relaxed text-(--foreground)/85"
            >
              {PASSWORD_GAME_PAGE_INTRO}
            </p>
            <p data-testid="pg2-credit" className="mt-2 text-xs text-(--muted)">
              {PASSWORD_GAME_CREDIT.before}
              <a
                href={PASSWORD_GAME_CREDIT.href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-(--foreground)"
              >
                {PASSWORD_GAME_CREDIT.linkText}
              </a>
              {PASSWORD_GAME_CREDIT.after}
            </p>
            <p className="mt-2 text-xs">
              <Link
                href={PG2_HINTS_PATH}
                className="font-semibold underline underline-offset-2 hover:text-(--foreground)"
              >
                Stuck? Rules and hints (spoilers behind a click)
              </Link>
            </p>
          </div>
          <PasswordGame2Loader />
        </div>

        <div className="mx-auto max-w-5xl">
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
    </div>
  );
}
