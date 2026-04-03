"use client";

import { motion } from "framer-motion";
import { Gamepad2 } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";

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
          className="rounded-xl border border-(--border) bg-(--card) p-12 text-center"
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <Gamepad2 className="h-12 w-12 mx-auto mb-4 text-accent-pink opacity-50" />
          <h3 className="font-display text-2xl font-bold mb-2">
            Geometric Flow
          </h3>
          <p className="text-(--muted) text-sm mb-6 max-w-md mx-auto">
            The wireframe shapes decorating this page will come alive as a
            playable game. Navigate through the geometric field. Coming soon.
          </p>
          <Link
            href="/games"
            className="inline-flex items-center gap-2 text-sm font-semibold text-accent-pink hover:brightness-110 transition-all"
          >
            <Gamepad2 className="h-4 w-4" />
            View Games
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
