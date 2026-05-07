import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
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

      <div className="text-center relative z-10">
        <p className="text-sm text-(--muted) tracking-widest uppercase mb-4">
          Error — 404
        </p>
        <h1 className="font-display text-[12rem] font-black tracking-tighter leading-none text-(--foreground) mb-2">
          404
        </h1>
        <p className="text-lg text-(--muted) mb-10 max-w-sm mx-auto">
          This page doesn&apos;t exist. It might have moved, or you followed a
          broken link.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg bg-accent-green px-6 py-3 text-base font-semibold text-black transition-all hover:brightness-110"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Portfolio
        </Link>
      </div>
    </main>
  );
}
