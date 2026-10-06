import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { GamesClient } from "./games-client";
import { hubTags } from "./hub/hub-tags";
import { GAMES } from "./games-meta";
import { breadcrumbNode, gameListNode, graph, serializeJsonLd } from "@/lib/structured-data";

const SITE_ORIGIN = "https://amindhou.com";

const DESCRIPTION =
  "Free browser games built for this site. No downloads, no sign-up: pick one and play.";

export const metadata = {
  title: "Games",
  description: DESCRIPTION,
  alternates: {
    canonical: `${SITE_ORIGIN}/games`,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
  // Without its own openGraph block this page inherited the site-wide card from
  // the root layout, so every hub shared one title when shared.
  openGraph: {
    type: "website",
    url: `${SITE_ORIGIN}/games`,
    title: "Games — playable mini-games by Amin Dhouib",
    description: DESCRIPTION,
    siteName: "Amin Dhouib",
    locale: "en_US",
    // Declaring openGraph here replaces the root layout's block wholesale, so
    // the site card has to be restated or the page ships with no og:image.
    images: [{ url: `${SITE_ORIGIN}/opengraph-image`, width: 1200, height: 630, alt: "Games" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Games — playable mini-games by Amin Dhouib",
    description: DESCRIPTION,
    images: [`${SITE_ORIGIN}/opengraph-image`],
  },
};

export default function GamesPage() {
  const jsonLd = graph(
    {
      "@type": "CollectionPage",
      "@id": `${SITE_ORIGIN}/games#page`,
      url: `${SITE_ORIGIN}/games`,
      name: "Free browser games by Amin Dhouib",
      description: DESCRIPTION,
      mainEntity: gameListNode(GAMES.filter((g) => !g.hidden)),
    },
    breadcrumbNode([
      { name: "Home", path: "/" },
      { name: "Games", path: "/games" },
    ]),
  );
  return (
    <div className="min-h-screen pt-24 pb-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <div data-testid="games-hub" className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <h1 className="mb-2 font-display text-4xl font-black tracking-tight">Games</h1>
        <p className="mb-8 text-(--muted)">
          Free browser games built for this site. No downloads, no sign-up: pick one and play. The
          daily leaderboards reset at midnight UTC, so there is always a fresh run to chase.
        </p>

        {/* No Suspense boundary. One was added when GamesClient read useSearchParams (it no
            longer does), and it let React stream the whole hub as a hidden segment that only
            an inline script reveals, so without JavaScript the page showed no games. */}
        <GamesClient tags={hubTags()} />
      </div>
    </div>
  );
}
