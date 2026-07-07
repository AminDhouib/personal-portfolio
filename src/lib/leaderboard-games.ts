/**
 * Single source of truth for valid `/api/leaderboard` game slugs (RC-1 /
 * DD1-001). Imported by both the route (server, zod enum) and
 * `useLeaderboard` (client, typed argument) so a slug typo becomes a
 * TypeScript error at the call site instead of a new silent bucket.
 *
 * Deliberately NOT derived from the games registry: only these 3 games use
 * this endpoint (the password-game leaderboard is a separate endpoint/shape,
 * out of scope per audit/plans/P2.md section 1), and this module must stay
 * safe to import from a server route -- a shared client-facing registry
 * risks pulling client-only dependencies in.
 *
 * Adding a 4th leaderboard game means appending to this array; every
 * consumer (route validation, hook typing) picks it up automatically.
 */
export const LEADERBOARD_GAMES = ["space-shooter", "hextris", "tower-stacker"] as const;

export type LeaderboardGame = (typeof LEADERBOARD_GAMES)[number];
