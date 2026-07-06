"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Gamepad2, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";
import { GameCard } from "@/components/game/game-card";
import { GAMES_BY_SLUG } from "@/app/games/games-meta";

const SpaceShooterGame = dynamic(
  () => import("@/components/game/space-shooter").then((m) => m.SpaceShooterGame),
  { ssr: false },
);

const FEATURED_BELOW_SHOOTER = ["super-voltorb-flip", "hextris"] as const;

export function Game() {
  return (
    <section id="game" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="09" title="The Game" color="var(--color-accent-pink)" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-display text-xl font-bold">Orbital Dodge</h3>
              <p className="mt-1 text-sm text-(--muted)">
                Endless 3D dodge-em-up. Auto-fire cannons, grab power-ups, beat the leaderboard.
              </p>
            </div>
            <div className="hidden items-center gap-4 text-xs text-(--muted) sm:flex">
              <span className="flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-accent-amber" /> Personal best saved
              </span>
            </div>
          </div>

          <SpaceShooterGame />

          <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2">
            {FEATURED_BELOW_SHOOTER.map((slug) => (
              <GameCard key={slug} game={GAMES_BY_SLUG[slug]} size="lg" />
            ))}
          </div>

          <div className="mt-6 flex items-center justify-center">
            <Link
              href="/games"
              className="inline-flex items-center gap-2 text-sm font-medium text-(--muted) transition-colors hover:text-(--foreground)"
            >
              <Gamepad2 className="h-4 w-4 text-accent-pink" />
              Try the other games
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
