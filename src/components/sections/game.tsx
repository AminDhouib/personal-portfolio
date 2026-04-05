"use client";

import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import { Gamepad2, Trophy, RotateCcw } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";

const GeometricFlowGame = dynamic(
  () =>
    import("@/components/game/geometric-flow").then(
      (m) => m.GeometricFlowGame
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
                Geometric Flow
              </h3>
              <p className="text-sm text-(--muted) mt-1">
                The shapes decorating this page just became obstacles. Navigate through. Click / tap to switch lanes.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-4 text-xs text-(--muted)">
              <span className="flex items-center gap-1">
                <Trophy className="h-3.5 w-3.5 text-accent-amber" /> High score saved
              </span>
              <span className="flex items-center gap-1">
                <RotateCcw className="h-3.5 w-3.5" /> Tap to restart
              </span>
            </div>
          </div>

          <GeometricFlowGame />

          <div className="flex items-center justify-center mt-4">
            <Link
              href="/games"
              className="inline-flex items-center gap-2 text-sm font-medium text-(--muted) hover:text-(--foreground) transition-colors"
            >
              <Gamepad2 className="h-4 w-4 text-accent-pink" />
              More games →
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

