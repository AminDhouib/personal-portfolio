"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LeaderboardGame } from "@/lib/leaderboard-games";

/** Mirrors the persisted Entry shape returned by GET /api/leaderboard. */
export interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
  seconds?: number;
  kills?: number;
  distance?: number;
  region?: string;
  game?: string;
  createdAt: string;
}

/**
 * Fields a game may submit. `name`/`score`/`level` are the only ones every
 * game sends; the rest are per-game extras the route accepts and stores
 * verbatim when present. `game` is injected by the hook, not passed here.
 */
export interface LeaderboardSubmitPayload {
  name: string;
  score: number;
  level: number;
  seconds?: number;
  kills?: number;
  distance?: number;
  region?: string;
}

export interface LeaderboardSubmitResult {
  ok: boolean;
  rank?: number;
}

interface LeaderboardGetResponse {
  entries?: unknown;
}

interface LeaderboardPostResponse {
  ok?: unknown;
  rank?: unknown;
}

const SUBMIT_TIMEOUT_MS = 8000;

function isLeaderboardEntry(x: unknown): x is LeaderboardEntry {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.name === "string" &&
    typeof o.score === "number" &&
    typeof o.level === "number" &&
    typeof o.createdAt === "string"
  );
}

export interface UseLeaderboardOptions {
  /**
   * Fetch the board once on mount (and whenever `game` changes). Default
   * true, matching space-shooter's pre-existing mount-time fetch. hextris
   * only reads the board on game-over (not on mount) and tower-stacker never
   * reads it at all (POST-only) -- both pass `false` here and drive `refresh`
   * themselves, so migrating them to this hook does not add a network call
   * that did not exist before.
   */
  fetchOnMount?: boolean;
}

/**
 * Owns the read path (`entries`/`loading`/`error`/`refresh`) and provides an
 * imperative `submit` for one leaderboard game. Each game keeps its own
 * submit-UX state machine (hextris's 4-state machine, space-shooter's
 * celebration/personal-best, tower-stacker's submitting/submitted bools) --
 * this hook centralizes only the fetch/timeout/parse/error mechanics that
 * were hand-duplicated across the three call sites (RC-8, CT-006).
 */
export function useLeaderboard(game: LeaderboardGame, options: UseLeaderboardOptions = {}) {
  const { fetchOnMount = true } = options;
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gameRef = useRef(game);
  gameRef.current = game;

  const refresh = useCallback(async (): Promise<LeaderboardEntry[]> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leaderboard?game=${gameRef.current}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      });
      if (!res.ok) {
        setError(`failed to load leaderboard (status ${res.status})`);
        return [];
      }
      const data = (await res.json()) as LeaderboardGetResponse;
      const parsed = Array.isArray(data.entries) ? data.entries.filter(isLeaderboardEntry) : [];
      setEntries(parsed);
      setError(null);
      return parsed;
    } catch (err) {
      reportError(err);
      setError("failed to load leaderboard");
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (fetchOnMount) void refresh();
  }, [refresh, game, fetchOnMount]);

  const submit = useCallback(
    async (payload: LeaderboardSubmitPayload): Promise<LeaderboardSubmitResult> => {
      try {
        const res = await fetch("/api/leaderboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, game: gameRef.current }),
          signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
        });
        if (!res.ok) {
          setError(`failed to submit score (status ${res.status})`);
          return { ok: false };
        }
        const data = (await res.json()) as LeaderboardPostResponse;
        const rank = typeof data.rank === "number" ? data.rank : undefined;
        if (data.ok !== true) {
          setError("failed to submit score");
          return { ok: false };
        }
        setError(null);
        return { ok: true, rank };
      } catch (err) {
        reportError(err);
        setError("failed to submit score");
        return { ok: false };
      }
    },
    [],
  );

  return { entries, loading, error, refresh, submit };
}
