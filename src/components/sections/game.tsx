"use client";

import dynamic from "next/dynamic";
import { useRef } from "react";
import { MotionConfig, useInView } from "framer-motion";
import { Reveal } from "@/components/ui/reveal";
import { Gamepad2, Trophy, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SectionHeading } from "@/components/ui/section-heading";
import { GameCard } from "@/components/game/game-card";
import { GAMES_BY_SLUG } from "@/app/games/games-meta";
import { NeedsWebGL } from "@/components/game/space-shooter/needs-webgl";
import { canvasLayout, SHOOTER_CAPTION } from "@/components/game/space-shooter/canvas-layout";
import { WebGLOnly } from "@/components/three/webgl-only";

/**
 * Holds the game's place: the canvas box at the canvas's own size plus the caption the game
 * renders under it, so nothing below moves when the game swaps in.
 */
function ShooterPlaceholder() {
  const layout = canvasLayout("embed", false);
  return (
    <div>
      <div
        data-testid="shooter-placeholder"
        className={`mx-auto rounded-xl border border-(--border) ${layout.sizeClass}`}
        style={{ maxWidth: "min(100%, calc(100vh * 21 / 9))", maxHeight: layout.maxHeight }}
      />
      <p className="text-xs text-(--muted)">{SHOOTER_CAPTION}</p>
    </div>
  );
}

// The placeholder also covers the chunk download, so the section never collapses in between.
const SpaceShooterGame = dynamic(
  () => import("@/components/game/space-shooter").then((m) => m.SpaceShooterGame),
  { ssr: false, loading: () => <ShooterPlaceholder /> },
);

// How far ahead of the viewport the embed mounts: about a phone screen and a half, so the chunk
// has loaded and the scene is drawing by the time a visitor scrolls to it.
const SHOOTER_MOUNT_MARGIN = "1200px 0px";

/**
 * Mounts Orbital Dodge only once the section nears the viewport. Mounted at page load, the game
 * (its chunk, a second WebGL context with post-processing, an AudioContext) was most of the home
 * page's main-thread work on a phone, for a section eight screens down. Until then
 * ShooterPlaceholder holds its place, so the page below does not jump when the game arrives.
 */
function ShooterWhenNear() {
  const ref = useRef<HTMLDivElement>(null);
  const near = useInView(ref, { once: true, margin: SHOOTER_MOUNT_MARGIN });
  return <div ref={ref}>{near ? <SpaceShooterGame /> : <ShooterPlaceholder />}</div>;
}

// Script Knight and Failover are here for crawl discovery: on 2026-10-15 Search Console had never
// fetched either URL, and the home page (position 4, the site's strongest) is the best place to
// link them from. Every card is one plain anchor to /games/<slug>.
const FEATURED_BELOW_SHOOTER = [
  "super-voltorb-flip",
  "hextris",
  "script-knight",
  "failover",
] as const;

export function Game() {
  return (
    <section id="game" className="py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading number="09" title="The Game" color="var(--color-accent-pink)" />

        <Reveal y={20}>
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

          {/* This embed is the real playable game, not a teaser; exempt from
              reduced-motion by ruling like the /games/space-shooter route. */}
          <div data-motion-exempt className="contents">
            <MotionConfig reducedMotion="never">
              <WebGLOnly fallback={<NeedsWebGL />}>
                <ShooterWhenNear />
              </WebGLOnly>
            </MotionConfig>
          </div>

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
        </Reveal>
      </div>
    </section>
  );
}
