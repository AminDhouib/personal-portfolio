/**
 * Per-game crash reporting for the client-rendered game loops (RC-4 residue:
 * DD4-003 unguarded RAF loop -> silent freeze).
 *
 * `gameCrashToReport` centralizes two things a `catch` at the top of a game's
 * RAF loop needs: (a) wrapping the original error as the `cause` of a new
 * Error whose message names the game (so Sentry groups crashes per game and
 * keeps the original stack via `cause`), and (b) a once-per-session,
 * per-game flood guard -- a game that free-spins into the same throw every
 * frame must report it once, not on every tick.
 *
 * This module does NOT call a reporter itself: callers write
 * `const c = gameCrashToReport(game, err); if (c) reportError(c);` so
 * `no-silent-catch` sees a literal reporter call in every wrapped catch.
 */

const reportedGames = new Set<string>();

export function gameCrashToReport(game: string, error: unknown): Error | null {
  if (reportedGames.has(game)) return null;
  reportedGames.add(game);
  const cause = error instanceof Error ? error : new Error(String(error));
  return new Error(`[${game}] game loop crashed`, { cause });
}
