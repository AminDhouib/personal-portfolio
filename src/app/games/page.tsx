import Link from "next/link";
import { Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import { GamesClient } from "./games-client";

export const metadata = {
  title: "Games — Amin Dhouib",
  description: "Mini-games built with the geometric design language of amindhou.com.",
};

export default function GamesPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-2">
          Games
        </h1>
        <p className="text-(--muted) mb-12">
          Mini-games using the same wireframe shapes from this site. Click / tap to play.
        </p>

        <Suspense fallback={null}>
          <GamesClient />
        </Suspense>
      </div>
    </div>
  );
}

