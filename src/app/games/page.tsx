import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { GamesClient } from "./games-client";

const SITE_ORIGIN = "https://amindhou.com";

export const metadata = {
  title: "Games",
  description: "Mini-games built with the geometric design language of amindhou.com.",
  alternates: {
    canonical: `${SITE_ORIGIN}/games`,
    types: {
      "application/rss+xml": "/feed.xml",
    },
  },
};

export default function GamesPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-(--muted) transition-colors hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <h1 className="mb-2 font-display text-4xl font-black tracking-tight">Games</h1>
        <p className="mb-12 text-(--muted)">
          Mini-games using the same wireframe shapes from this site. Click / tap to play.
        </p>

        <Suspense fallback={null}>
          <GamesClient />
        </Suspense>
      </div>
    </div>
  );
}
