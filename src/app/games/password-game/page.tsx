import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GAMES } from "../games-meta";
import { GameCard } from "@/components/game/game-card";
import { PasswordGame2Loader } from "@/components/game/password-game-2";

const SITE_ORIGIN = "https://amindhou.com";

const DESCRIPTION =
  "Terms and Conditions Apply. A five-act sign-up form from hell — seeded chaos, every run unique.";

export const metadata = {
  title: "The Password Game 2",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_ORIGIN}/games/password-game`,
  },
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}/games/password-game`,
    title: "The Password Game 2 — Terms and Conditions Apply",
    description: DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
    // Declaring openGraph here replaces the root layout's block wholesale, so
    // the site card has to be restated or the page ships with no og:image.
    images: [
      {
        url: `${SITE_ORIGIN}/opengraph-image`,
        width: 1200,
        height: 630,
        alt: "The Password Game 2",
      },
    ],
  },
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

        <div className="max-w-3xl">
          {/* Server-rendered heading: the interactive shell is client-only
              (ssr: false), so without this the page ships no h1 in its SSR HTML.
              sr-only because the shell renders its own visible wordmark. */}
          <h1 className="sr-only">The Password Game 2</h1>
          <PasswordGame2Loader />
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
