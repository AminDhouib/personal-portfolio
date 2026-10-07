"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { VoltorbFlip } from "./engine";
import { buildSolverInput } from "./odds-input";
import { createSolveClient, type SolveClient } from "./solve-client";
import type { TileOdds } from "./solver";

export type Odds = { tiles: readonly TileOdds[]; best: number | null };

/**
 * Odds for the live board, or null while the assist is off, the round is over,
 * the board is not 5x5, the solver cannot answer, or the answer is on its way.
 * The effect is keyed on the solver input as text, not on the game object (the
 * game is cloned on every move), so an unchanged board never re-solves. One
 * client (one worker) serves every solve while the assist is on: a worker per
 * flip would pay the solver's cold start each time. It is built on the first
 * solve and disposed when the assist goes off or the hook unmounts.
 * `makeClient` is a seam for tests.
 */
export function useOdds(
  game: VoltorbFlip | null,
  enabled: boolean,
  makeClient: () => SolveClient = createSolveClient,
): Odds | null {
  const live = !!game && (game.gameStatus === "playing" || game.gameStatus === "memo");
  const input = useMemo(
    () => (enabled && live && game ? buildSolverInput(game) : null),
    [enabled, live, game],
  );
  const key = input ? JSON.stringify(input) : null;
  const [answer, setAnswer] = useState<{ key: string; odds: Odds | null } | null>(null);
  const clientRef = useRef<SolveClient | null>(null);

  useEffect(() => {
    if (!input || key === null) return;
    const client = (clientRef.current ??= makeClient());
    let cancelled = false;
    void client.solve(input).then((result) => {
      if (cancelled) return;
      if (result && result.status === "solved") {
        setAnswer({ key, odds: { tiles: result.tiles, best: result.best } });
      } else if (result) {
        setAnswer({ key, odds: null });
      }
    });
    return () => {
      cancelled = true;
    };
    // `input` is derived from `key`, and `makeClient` is a stable seam: the key is the real dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Off, or gone: the worker is released, and the next enable builds a fresh one.
  useEffect(() => {
    if (enabled) return;
    clientRef.current?.dispose();
    clientRef.current = null;
  }, [enabled]);
  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  // Only an answer for the CURRENT board is shown: after a flip the old odds
  // are wrong, so they disappear until the new ones land (a frame or two).
  return answer && answer.key === key ? answer.odds : null;
}
