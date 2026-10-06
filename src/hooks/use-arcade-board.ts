"use client";

import { useCallback, useEffect, useRef, useState } from "react";
// Type-only imports are erased, so the server-side arcade modules never reach the client bundle.
import type { BoardPeriod } from "@/lib/arcade/boards";
import type { ArcadeGameSlug } from "@/lib/arcade/games";
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

/** Fields a game may submit; only the keys of the game in question are sent. */
export interface ArcadeSubmitPayload {
  name: string;
  score: number;
  seconds?: number;
  kills?: number;
  distance?: number;
  level?: number;
}

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

type DetailKey = "seconds" | "kills" | "distance" | "level";

// The server's detail schema is strict per game, so only that game's keys may be sent.
const DETAIL_KEYS: Record<ArcadeGameSlug, readonly DetailKey[]> = {
  "space-shooter": ["seconds", "kills", "distance"],
  hextris: ["seconds", "kills", "level"],
};

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

function pickDetail(game: ArcadeGameSlug, payload: ArcadeSubmitPayload): Record<string, number> {
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
export function useArcadeBoard(game: ArcadeGameSlug, options: UseArcadeBoardOptions = {}) {
  const { period: initialPeriod = "all-time", fetchOnMount = true } = options;
  const [entries, setEntries] = useState<ArcadeBoardEntry[]>([]);
  const [you, setYou] = useState<ArcadeYou | null>(null);
  const [period, setPeriodState] = useState<BoardPeriod>(initialPeriod);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gameRef = useRef(game);
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
        setError(`failed to load leaderboard (status ${res.status})`);
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
      setError(null);
      return parsed;
    } catch (err) {
      reportError(err);
      if (id === requestId.current) setError("failed to load leaderboard");
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
      void refresh();
    },
    [refresh],
  );

  const submit = useCallback(async (payload: ArcadeSubmitPayload): Promise<ArcadeSubmitResult> => {
    const identity = getIdentity();
    const slug = gameRef.current;
    try {
      const res = await fetch("/api/arcade/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          game: slug,
          playerId: identity.playerId,
          token: identity.token,
          handle: payload.name,
          score: Math.max(0, Math.floor(payload.score)),
          detail: pickDetail(slug, payload),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const data = await readJsonBody(res);
      if (res.status === 422) {
        setError("score not accepted");
        return { ok: false, rejected: true };
      }
      if (res.status === 403 && data.error === "identity") {
        resetIdentity();
        setError("identity was reset, please submit again");
        return { ok: false, identityReset: true };
      }
      if (!res.ok) {
        setError(`failed to submit score (status ${res.status})`);
        return { ok: false };
      }
      if (data.ok !== true) {
        setError("failed to submit score");
        return { ok: false };
      }
      const boards = toBoards(data.boards);
      setError(null);
      return { ok: true, rank: boards.find((b) => b.period === "all-time")?.rank, boards };
    } catch (err) {
      reportError(err);
      setError("failed to submit score");
      return { ok: false };
    }
  }, []);

  return { entries, you, period, setPeriod, loading, error, refresh, submit };
}
