"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GameBanner } from "./banners";
import type { GameMeta } from "@/app/games/games-meta";

export function GameCard({
  game,
  size = "lg",
}: {
  game: GameMeta;
  size?: "lg" | "sm";
}) {
  const href = game.external ? `/games/${game.slug}` : `/games/${game.slug}`;
  const aspect = size === "lg" ? "aspect-[5/3]" : "aspect-[4/3]";
  const titleSize = size === "lg" ? "text-xl sm:text-2xl" : "text-base sm:text-lg";
  const taglineSize = size === "lg" ? "text-sm" : "text-xs";
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Link
        href={href}
        className="group relative block overflow-hidden rounded-2xl border border-(--border) hover:border-white/20 transition-colors shadow-lg shadow-black/30"
      >
        <div className={`relative ${aspect} w-full`}>
          <GameBanner slug={game.slug} />
          {/* Dark overlay for legibility */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
          {/* Accent glow ring on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ boxShadow: `inset 0 0 0 2px ${game.accent}` }}
          />
          {/* Title block */}
          <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
            <h3
              className={`font-display font-black tracking-tight ${titleSize} text-white`}
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.8)" }}
            >
              {game.title}
            </h3>
            <p className={`mt-1 ${taglineSize} text-white/80 line-clamp-2`}>
              {game.tagline}
            </p>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
