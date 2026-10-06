"use client";

import { MotionConfig } from "framer-motion";
import { useSearchParams } from "next/navigation";
import type { GameSlug } from "@/app/games/games-meta";
import { GAME_CLIENT, type GameClientEntry } from "./registry";

export function GameLoader({ slug }: { slug: GameSlug }) {
  const searchParams = useSearchParams();
  const towerSeed = searchParams?.get("tower-seed") ?? undefined;

  // Indexed loosely so an out-of-contract slug (a cast, a stale link) throws
  // instead of rendering a blank page.
  const entry = (GAME_CLIENT as Partial<Record<string, GameClientEntry>>)[slug];
  if (!entry) throw new Error(`game-loader: no renderer registered for slug "${slug}"`);
  // password-game has a dedicated page and is not rendered through GameLoader.
  if (!entry.render) return null;

  // Games are exempt from reduced-motion by ruling; "never" pins full motion
  // regardless of the OS preference honored by the root MotionConfig (providers.tsx).
  return <MotionConfig reducedMotion="never">{entry.render({ towerSeed })}</MotionConfig>;
}
