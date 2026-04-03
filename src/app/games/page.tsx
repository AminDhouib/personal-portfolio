import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Gamepad2 } from "lucide-react";

export const metadata = {
  title: "Games — Amin Dhouib",
  description: "Mini-games built with the geometric design language of amindhou.com.",
};

export default function GamesPage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back Home
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-4">
          Games
        </h1>
        <p className="text-(--muted) mb-12">
          Mini-games built with the same geometric wireframe shapes from this
          site. Coming soon.
        </p>

        <div className="rounded-xl border border-(--border) bg-(--card) p-12 text-center">
          <Gamepad2 className="h-16 w-16 mx-auto mb-4 text-accent-pink opacity-40" />
          <h2 className="font-display text-2xl font-bold mb-2">
            Geometric Flow
          </h2>
          <p className="text-sm text-(--muted) max-w-md mx-auto">
            Navigate through a field of wireframe shapes. Tap to steer. The same
            circles, triangles, and diamonds from the page become your obstacles.
          </p>
          <p className="text-xs text-(--muted)/60 mt-4">
            Under development
          </p>
        </div>
      </div>
    </div>
  );
}
