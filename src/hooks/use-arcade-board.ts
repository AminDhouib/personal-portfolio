"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Type-only imports are erased, so the server-side arcade modules (and zod) never reach the
// client bundle.
import type { z } from "zod";
import type { BoardPeriod } from "@/lib/arcade/boards";
import type { ARCADE_GAMES, ArcadeGameSlug } from "@/lib/arcade/games";
import { getIdentity, peekIdentity, resetIdentity } from "@/lib/arcade/identity";

/** One leaderboard row as the games render it. */
export interface ArcadeBoardEntry {
  rank: number;
  name: string;
  score: number;
  level?: number;
  seconds?: number;
  kills?: number;
  distance?: number;
  createdAt: string;
  /** Set only when the server said so; Hextris falls back to its old heuristic otherwise. */
  isYou?: boolean;
}

export interface ArcadeYou {
  rank: number;
  score: number;
}

export interface ArcadeBoardResult {
  period: BoardPeriod;
  board: string;
  rank: number;
  best: number;
  improved: boolean;
}

/** The detail keys one game submits, inferred from the server's strict detail schema. */
type ArcadeDetail<G extends ArcadeGameSlug> = z.infer<(typeof ARCADE_GAMES)[G]["detailSchema"]>;

/**
 * What a game submits: the name, the score and exactly the game's detail keys. The server
 * rejects a body with a missing or extra detail key (400), so the type makes that a compile
 * error instead.
 */
export type ArcadeSubmitPayload<G extends ArcadeGameSlug = ArcadeGameSlug> = {
  name: string;
  score: number;
} & ArcadeDetail<G>;

export interface ArcadeSubmitResult {
  ok: boolean;
  /** Rank on the all-time board after the submit. */
  rank?: number;
  boards?: ArcadeBoardResult[];
  /** The server judged the run implausible (422). Not worth retrying. */
  rejected?: boolean;
  /** The stored identity was refused and replaced; submitting again will work. */
  identityReset?: boolean;
}

export interface UseArcadeBoardOptions {
  /** Initial period. Default "all-time". */
  period?: BoardPeriod;
  /** Fetch on mount (and when `game` changes). Default true. */
  fetchOnMount?: boolean;
}

// The server's detail schema is strict per game, so only that game's keys may be sent. The
// mapped type ties each list to the schema's own keys, so a renamed key fails typecheck.
const DETAIL_KEYS: { [G in ArcadeGameSlug]: readonly (keyof ArcadeDetail<G> & string)[] } = {
  "space-shooter": ["seconds", "kills", "distance"],
  hextris: ["seconds", "kills", "level"],
};

// Mirrors ARCADE_SCORE_CAP in src/lib/arcade/games.ts. That module imports zod and the
// validators, which a client component must not pull in for one number; the hook test pins
// the two together (a score at the cap is sent, one above it is not).
const SCORE_CAP = 10_000_000;
// The server's body schema takes a handle up to 200 characters and sanitizes it to 12.
const HANDLE_MAX_SENT = 200;

const PERIODS: readonly BoardPeriod[] = ["daily", "weekly", "all-time"];
const REQUEST_TIMEOUT_MS = 8000;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null;
}

function finite(x: unknown): number | undefined {
  return typeof x === "number" && Number.isFinite(x) ? x : undefined;
}

function toEntry(x: unknown): ArcadeBoardEntry | null {
  if (!isRecord(x)) return null;
  const { rank, handle, score, achievedAt, isYou } = x;
  if (
    typeof rank !== "number" ||
    typeof handle !== "string" ||
    typeof score !== "number" ||
    typeof achievedAt !== "string"
  ) {
    return null;
  }
  const detail = isRecord(x.detail) ? x.detail : {};
  const level = finite(detail.level);
  const seconds = finite(detail.seconds);
  const kills = finite(detail.kills);
  const distance = finite(detail.distance);
  return {
    rank,
    name: handle,
    score,
    ...(level !== undefined && { level }),
    ...(seconds !== undefined && { seconds }),
    ...(kills !== undefined && { kills }),
    ...(distance !== undefined && { distance }),
    createdAt: achievedAt,
    ...(typeof isYou === "boolean" && { isYou }),
  };
}

function toYou(x: unknown): ArcadeYou | null {
  if (!isRecord(x) || typeof x.rank !== "number" || typeof x.score !== "number") return null;
  return { rank: x.rank, score: x.score };
}

function toBoards(x: unknown): ArcadeBoardResult[] {
  if (!Array.isArray(x)) return [];
  const boards: ArcadeBoardResult[] = [];
  for (const item of x) {
    if (!isRecord(item)) continue;
    const { period, board, rank, best, improved } = item;
    if (
      PERIODS.some((p) => p === period) &&
      typeof board === "string" &&
      typeof rank === "number" &&
      typeof best === "number" &&
      typeof improved === "boolean"
    ) {
      boards.push({ period: period as BoardPeriod, board, rank, best, improved });
    }
  }
  return boards;
}

function pickDetail(
  game: ArcadeGameSlug,
  payload: Readonly<Record<string, unknown>>,
): Record<string, number> {
  const detail: Record<string, number> = {};
  for (const key of DETAIL_KEYS[game]) {
    const value = finite(payload[key]);
    if (value !== undefined) detail[key] = Math.max(0, Math.floor(value));
  }
  return detail;
}

async function readJsonBody(res: Response): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await res.json();
    return isRecord(body) ? body : {};
  } catch {
    // silent-ok: an empty or non-JSON error body is fully described by its status code
    return {};
  }
}

/**
 * Reads one game's leaderboard (daily, weekly or all-time) from /api/arcade/scores and
 * submits scores with the browser's trust-on-first-use identity. Each game keeps its own
 * submit-UX state; this hook owns only fetch, parse, period and the request payload.
 */
export function useArcadeBoard<G extends ArcadeGameSlug>(
  game: G,
  options: UseArcadeBoardOptions = {},
) {
  const { period: initialPeriod = "all-time", fetchOnMount = true } = options;
  const [entries, setEntries] = useState<ArcadeBoardEntry[]>([]);
  const [you, setYou] = useState<ArcadeYou | null>(null);
  const [period, setPeriodState] = useState<BoardPeriod>(initialPeriod);
  const [loading, setLoading] = useState(false);
  // Set and cleared by reads only (refresh and period switches). A failed submit is reported
  // through submit()'s return value and the caller's own submit state, never through here, so
  // an empty board after a failed submit does not claim the board could not load.
  const [readError, setReadError] = useState<string | null>(null);
  const gameRef = useRef<ArcadeGameSlug>(game);
  gameRef.current = game;
  // Written synchronously by setPeriod so the refresh it triggers reads the new period.
  const periodRef = useRef(initialPeriod);
  // Only the latest request may write state; a slower earlier one is dropped.
  const requestId = useRef(0);

  const refresh = useCallback(async (): Promise<ArcadeBoardEntry[]> => {
    requestId.current += 1;
    const id = requestId.current;
    setLoading(true);
    try {
      const query = new URLSearchParams({ game: gameRef.current, board: periodRef.current });
      const player = peekIdentity();
      if (player) query.set("player", player.playerId);
      const res = await fetch(`/api/arcade/scores?${query.toString()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (id !== requestId.current) return [];
      if (!res.ok) {
        setReadError(`failed to load leaderboard (status ${res.status})`);
        return [];
      }
      const data = await readJsonBody(res);
      if (id !== requestId.current) return [];
      const parsed: ArcadeBoardEntry[] = [];
      if (Array.isArray(data.entries)) {
        for (const raw of data.entries) {
          const entry = toEntry(raw);
          if (entry) parsed.push(entry);
        }
      }
      setEntries(parsed);
      setYou(toYou(data.you));
      setReadError(null);
      return parsed;
    } catch (err) {
      reportError(err);
      if (id === requestId.current) setReadError("failed to load leaderboard");
      return [];
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchOnMount) void refresh();
  }, [refresh, game, fetchOnMount]);

  const setPeriod = useCallback(
    (next: BoardPeriod) => {
      if (next === periodRef.current) return;
      periodRef.current = next;
      setPeriodState(next);
      // The rows and the you row belong to the period just left. Drop them now so a slow or
      // failed read shows an empty board, not another period's scores under this tab.
      setEntries([]);
      setYou(null);
      setReadError(null);
      void refresh();
    },
    [refresh],
  );

  const submit = useCallback(
    async (payload: ArcadeSubmitPayload<G>): Promise<ArcadeSubmitResult> => {
      try {
        const slug = gameRef.current;
        const score = Math.max(0, Math.floor(payload.score));
        if (score > SCORE_CAP) {
          // The server would answer 400; this is the same "not accepted" outcome as a 422.
          return { ok: false, rejected: true };
        }
        // Inside the try: creating the identity touches crypto and storage, which can throw.
        const identity = getIdentity();
        const res = await fetch("/api/arcade/scores", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            game: slug,
            playerId: identity.playerId,
            token: identity.token,
            handle: payload.name.slice(0, HANDLE_MAX_SENT),
            score,
            detail: pickDetail(slug, payload),
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const data = await readJsonBody(res);
        if (res.status === 422) {
          return { ok: false, rejected: true };
        }
        if (res.status === 403 && data.error === "identity") {
          resetIdentity();
          return { ok: false, identityReset: true };
        }
        if (!res.ok) {
          return { ok: false };
        }
        if (data.ok !== true) {
          return { ok: false };
        }
        const boards = toBoards(data.boards);
        return { ok: true, rank: boards.find((b) => b.period === "all-time")?.rank, boards };
      } catch (err) {
        reportError(err);
        return { ok: false };
      }
    },
    [],
  );

  return { entries, you, period, setPeriod, loading, readError, refresh, submit };
}
