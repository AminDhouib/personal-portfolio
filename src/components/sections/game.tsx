"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Gamepad2, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";

const SpaceShooterGame = dynamic(
  () =>
    import("@/components/game/space-shooter").then(
      (m) => m.SpaceShooterGame
    ),
  { ssr: false }
);

export function Game() {
  return (
    <section id="game" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          number="08"
          title="The Game"
          color="var(--color-accent-pink)"
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-xl font-bold">
                Orbital Dodge
              </h3>
              <p className="text-sm text-(--muted) mt-1">
                Endless 3D dodge-em-up. Auto-fire cannons, grab power-ups, beat the leaderboard.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs text-(--muted)">
              <span className="flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-accent-amber" /> Personal best saved
              </span>
            </div>
          </div>

          <SpaceShooterGame />

          <div className="flex items-center justify-center mt-4">
            <Link
              href="/games"
              className="inline-flex items-center gap-2 text-sm font-medium text-(--muted) hover:text-(--foreground) transition-colors"
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
