"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GameBanner } from "./registry";
import type { GameMeta } from "@/app/games/games-meta";

export function GameCard({
  game,
  size = "lg",
  featured = false,
  headingLevel = "h2",
  tags,
  cta,
}: {
  game: GameMeta;
  size?: "lg" | "sm";
  featured?: boolean;
  /** h2 by default: the cards usually sit directly under a page h1. The /games hub nests
   *  most of them under its own "More games" h2 and passes h3. */
  headingLevel?: "h2" | "h3";
  /** Short chips under the tagline (genre, play mode). */
  tags?: readonly string[];
  /** Label for a call-to-action pill. It is plain text inside the card's one anchor, never
   *  a second link. */
  cta?: string;
}) {
  const href = `/games/${game.slug}`;
  const Heading = headingLevel;
  // With tags or a cta the title band grows, so the card is content-sized and the art keeps
  // its own aspect box. Without them the card is the original fixed-aspect layout.
  const rich = tags !== undefined || cta !== undefined;
  // The title sits in its own band below the art, so the card is taller than
  // the old full-bleed 5:3 to leave the art room.
  const aspect = featured ? "aspect-[4/3] sm:aspect-[21/9]" : "aspect-[4/3]";
  const titleSize = size === "lg" ? "text-xl sm:text-2xl" : "text-base sm:text-lg";
  const taglineSize = size === "lg" ? "text-sm" : "text-xs";
  const frameClass = rich
    ? "relative flex w-full flex-col"
    : `relative flex ${aspect} w-full flex-col`;
  const artClass = rich
    ? `relative ${aspect} w-full overflow-hidden`
    : "relative min-h-0 flex-1 overflow-hidden";
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
    >
      <Link
        href={href}
        data-game-card={game.slug}
        className="group relative block overflow-hidden rounded-2xl border border-(--border) shadow-lg shadow-black/30 transition-colors hover:border-white/20"
      >
        <div className={frameClass}>
          {/* The banner art keeps its own region above the title band, so the
              title never sits on top of it. */}
          <div className={artClass}>
            <GameBanner slug={game.slug} />
          </div>
          {/* Title band: a dark scrim under the text. */}
          <div className="relative shrink-0 bg-gradient-to-t from-black/90 to-black/70 p-4 sm:p-5">
            <Heading className={`font-display font-black tracking-tight ${titleSize} text-white`}>
              {game.title}
            </Heading>
            <p className={`mt-1 ${taglineSize} line-clamp-2 text-white/80`}>{game.tagline}</p>
            {tags !== undefined && tags.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <li
                    key={tag}
                    className="rounded-full border border-white/25 px-2.5 py-0.5 text-xs text-white/85"
                  >
                    {tag}
                  </li>
                ))}
              </ul>
            )}
            {cta !== undefined && (
              <span
                aria-hidden="true"
                className="mt-4 inline-flex min-h-11 items-center rounded-full bg-white px-6 text-sm font-semibold text-black"
              >
                {cta}
              </span>
            )}
          </div>
          {/* Accent glow ring on hover — rounded to match the card's
              rounded-2xl so the inset outline follows the corners instead
              of drawing a hard rectangle that bleeds past them. */}
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity group-hover:opacity-100"
            style={{ boxShadow: `inset 0 0 0 2px ${game.accent}` }}
          />
        </div>
      </Link>
    </motion.div>
  );
}
