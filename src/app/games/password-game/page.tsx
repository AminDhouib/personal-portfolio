import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft } from "lucide-react";

const PasswordGame = dynamic(
  () => import("@/components/game/password-game/password-game").then((m) => m.PasswordGame),
  {
    loading: () => (
      <div className="w-full h-[420px] rounded-xl border border-(--border) bg-(--card) flex items-center justify-center">
        <div className="text-(--muted) text-sm">Loading...</div>
      </div>
    ),
  }
);

export const metadata = {
  title: "Password Game 2 — Amin Dhouib",
  description: "A spiritual successor to Neal Fun's Password Game. Seeded chaos, every run unique.",
};

export default function PasswordGamePage() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Link
          href="/games"
          className="inline-flex items-center gap-2 text-sm text-(--muted) hover:text-(--foreground) transition-colors mb-8"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Games
        </Link>

        <h1 className="font-display text-4xl font-black tracking-tight mb-2">
          Password Game 2
        </h1>
        <p className="text-(--muted) mb-8">
          A spiritual successor with seeded runs and escalating chaos. Every seed is a different game.
        </p>

        <PasswordGame />
      </div>
    </div>
  );
}
