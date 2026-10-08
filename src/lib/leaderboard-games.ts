import type { GameSlug } from "@/app/games/games-meta";

/**
 * Single source of truth for valid `/api/leaderboard` game slugs (RC-1 /
 * DD1-001). Imported by both the route (server, zod enum) and
 * `useLeaderboard` (client, typed argument) so a slug typo becomes a
 * TypeScript error at the call site instead of a new silent bucket.
 *
 * Orbital Dodge (`space-shooter`) and Hextris moved to the arcade backend
 * (`/api/arcade/scores`, T1b-2) and are deliberately no longer accepted here:
 * their legacy rows were imported once and the table is read-only history for
 * them. Tower Stacker is the only remaining writer until T6 moves it too, at
 * which point this file, the route and the hook can go.
 *
 * The value is hand-authored, NOT derived from the games registry (the
 * password-game leaderboard is a separate endpoint/shape). It is
 * `satisfies`-checked against the canonical `GameSlug` union so a slug that is
 * not a real game fails to compile. The import is type-only (erased at build)
 * and `games-meta` is itself component-free, so this module stays safe to
 * import from a server route.
 */
export const LEADERBOARD_GAMES = ["tower-stacker"] as const satisfies readonly GameSlug[];
