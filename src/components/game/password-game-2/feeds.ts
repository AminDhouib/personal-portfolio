import { setTodayWord } from "@/data/password-game/wordle";
import { setExtendedCapitals, type CountryCapital } from "@/data/password-game/capitals";
import { setDailyChessPuzzle, type ChessPuzzle } from "@/data/password-game/chess";

/**
 * Live-feed injection for pg2's three feed-backed rules: rule 8 (today's Wordle
 * answer), rule 12 (a live country name), and rule 14 (the daily chess best move).
 * Each rule reads a module-level injected value at rule-create time and, when that
 * value is unset, degrades to a freebie — it never falls back to a static pool. This
 * module is what actually populates those values in production; the server-side
 * proxy routes (/api/password-game/{wordle,countries,chess-puzzle}) do the upstream
 * fetch and caching, we just pull their JSON here and hand it to the setters.
 *
 * ACCEPTED DEGRADATION: rules capture the injected feed state at rule-create time,
 * which is start-screen/page-load time. The shell fires loadLiveFeeds() on mount, so
 * a player who starts a run before these fetches land gets the freebie fallbacks for
 * whichever feed had not arrived. That race is intentional and tolerated — the game
 * stays fully solvable either way (the solvability CI test covers worst-case feeds).
 *
 * Every fetch is best-effort: a 5s timeout and a swallowed rejection leave the
 * corresponding rule a freebie rather than throwing into the render.
 */

const FEED_TIMEOUT_MS = 5000;

/** Fetch all three feeds in parallel and inject whatever arrives. Never throws. */
export async function loadLiveFeeds(): Promise<void> {
  await Promise.all([loadWordle(), loadCountries(), loadChess()]);
}

async function loadWordle(): Promise<void> {
  try {
    const res = await fetch("/api/password-game/wordle", {
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { word?: unknown };
    // The setter enforces /^[A-Z]{5}$/ and nulls anything else; uppercase first so a
    // lowercased answer still passes rather than being rejected as a non-match.
    if (typeof data.word === "string") setTodayWord(data.word.toUpperCase());
  } catch {
    // silent-ok: the wordle feed is best-effort; a network/timeout failure leaves rule 8 a freebie.
  }
}

async function loadCountries(): Promise<void> {
  try {
    const res = await fetch("/api/password-game/countries", {
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { capitals?: unknown };
    // The route returns an empty array on upstream failure; never inject an empty list
    // (the setter would null it anyway, but this keeps the intent explicit).
    if (Array.isArray(data.capitals) && data.capitals.length > 0) {
      setExtendedCapitals(data.capitals as CountryCapital[]);
    }
  } catch {
    // silent-ok: the countries feed is best-effort; a network/timeout failure leaves rule 12 a freebie.
  }
}

async function loadChess(): Promise<void> {
  try {
    const res = await fetch("/api/password-game/chess-puzzle", {
      signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { puzzle?: unknown };
    if (isChessPuzzle(data.puzzle)) setDailyChessPuzzle(data.puzzle);
  } catch {
    // silent-ok: the chess feed is best-effort; a network/timeout failure leaves rule 14 a freebie.
  }
}

/**
 * Shape guard for the whole ChessPuzzle contract. Rule 14 reads only
 * id/board/toMove/bestMove/hint, but the guard asserts `p is ChessPuzzle`, so it
 * must also verify `accept` — otherwise a future reader of puzzle.accept would
 * get undefined at runtime while TS believes it is string[].
 */
function isChessPuzzle(p: unknown): p is ChessPuzzle {
  if (p === null || typeof p !== "object") return false;
  const c = p as Record<string, unknown>;
  return (
    typeof c.id === "string" &&
    Array.isArray(c.board) &&
    (c.toMove === "white" || c.toMove === "black") &&
    typeof c.bestMove === "string" &&
    Array.isArray(c.accept) &&
    typeof c.hint === "string"
  );
}
