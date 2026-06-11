"use client"; // Error boundaries must be Client Components

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";

/**
 * Route-segment error boundary. Wraps every page below the root layout, so the
 * navbar + footer stay rendered around this fallback. Mirrors not-found.tsx.
 *
 * `unstable_retry` (Next 16.2+) re-fetches and re-renders the segment — better
 * than `reset()` for transient failures like a flaky data fetch.
 */
export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Surface the error for client console / server logs (matched via digest).
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      {/* Decorative wireframe shapes */}
      <svg
        className="pointer-events-none fixed inset-0 h-full w-full opacity-[0.04]"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <polygon
          points="200,80 320,240 80,240"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <polygon
          points="1100,120 1280,320 920,320"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        />
        <polygon
          points="680,400 820,600 540,600"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.8"
        />
      </svg>

      <div className="text-center relative z-10 max-w-md">
        <p className="text-sm text-(--muted) tracking-widest uppercase mb-4">
          Error — Something went wrong
        </p>
        <h1 className="font-display text-7xl font-black tracking-tighter leading-none text-(--foreground) mb-4">
          Well, that broke.
        </h1>
        <p className="text-lg text-(--muted) mb-8">
          An unexpected error interrupted this page. You can try again, or head
          back to the homepage.
        </p>
        {error.digest ? (
          <p className="text-xs font-mono text-(--muted) opacity-70 mb-8">
            Reference: {error.digest}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={() => unstable_retry()}
            className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-6 py-3 text-base font-semibold text-black transition-all hover:brightness-110"
          >
            <RotateCcw className="h-4 w-4" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-(--border) px-6 py-3 text-base font-semibold text-(--foreground) transition-all hover:bg-white/5"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Portfolio
          </Link>
        </div>
      </div>
    </main>
  );
}
