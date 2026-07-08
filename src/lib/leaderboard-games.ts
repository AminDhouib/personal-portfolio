import type { GameSlug } from "@/app/games/games-meta";

/**
 * Single source of truth for valid `/api/leaderboard` game slugs (RC-1 /
 * DD1-001). Imported by both the route (server, zod enum) and
 * `useLeaderboard` (client, typed argument) so a slug typo becomes a
 * TypeScript error at the call site instead of a new silent bucket.
 *
 * The values are hand-authored here, NOT derived from the games registry:
 * only these 3 games use this endpoint (the password-game leaderboard is a
 * separate endpoint/shape, out of scope per audit/plans/P2.md section 1).
 * They are `satisfies`-checked against the canonical `GameSlug` union so a
 * slug that is not a real game fails to compile. The import is type-only
 * (erased at build) and `games-meta` is itself component-free, so this
 * module stays safe to import from a server route.
 *
 * Adding a 4th leaderboard game means appending to this array; every
 * consumer (route validation, hook typing) picks it up automatically.
 */
export const LEADERBOARD_GAMES = [
  "space-shooter",
  "hextris",
  "tower-stacker",
] as const satisfies readonly GameSlug[];

export type LeaderboardGame = (typeof LEADERBOARD_GAMES)[number];
