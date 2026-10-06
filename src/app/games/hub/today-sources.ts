import type { GameSlug } from "@/app/games/games-meta";

/**
 * One Today tile: which game, and which public daily-board read backs it.
 * `arcade` is GET /api/arcade/scores?game=<slug>&board=daily; `pg2` is
 * GET /api/password-game-2/leaderboard?daily=1. A type-only import keeps the
 * zod-bearing arcade registry (src/lib/arcade/games.ts) out of the client
 * bundle; today-sources.test.ts pins every arcade slug against it.
 */
export interface TodaySource {
  slug: GameSlug;
  kind: "pg2" | "arcade";
}

export const TODAY_SOURCES: readonly TodaySource[] = [
  { slug: "password-game", kind: "pg2" },
  { slug: "space-shooter", kind: "arcade" },
  { slug: "hextris", kind: "arcade" },
];
