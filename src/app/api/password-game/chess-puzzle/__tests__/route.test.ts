import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("@/lib/log", () => ({ captureException: vi.fn(), logWarn: vi.fn() }));

import { GET } from "../route";
import { logWarn } from "@/lib/log";
import { mockFetchJsonResponse } from "@/test/api-route-helpers";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(logWarn).mockClear();
});

describe("GET /api/password-game/chess-puzzle", () => {
  it("loads the puzzle position from the payload's fen (primary path)", async () => {
    // Standard starting position; solution e2e4 (SAN "e4"), white to move.
    const payload = {
      game: {},
      puzzle: {
        id: "fen-primary",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        solution: ["e2e4"],
        themes: ["opening"],
      },
    };
    vi.stubGlobal("fetch", mockFetchJsonResponse({ ok: true, body: payload }));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("lichess");
    expect(body.puzzle.id).toBe("lichess-fen-primary");
    expect(body.puzzle.toMove).toBe("white");
    expect(body.puzzle.bestMove).toBe("e4");
    expect(body.puzzle.accept).toContain("e4");
    // The served fen is the puzzle position itself (before the solution move), so
    // it still has white to move — not the post-e4 position.
    expect(body.puzzle.fen).toBe("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    expect(res.headers.get("cache-control")).toBe(
      "public, s-maxage=43200, stale-while-revalidate=86400",
    );
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("replays the PGN through initialPly INCLUSIVE when fen is absent (off-by-one regression pin)", async () => {
    // Ruy Lopez, five plies (indices 0..4). initialPly is the index of the last
    // played ply (Bb5 = 4), so the puzzle position is reached by replaying
    // 0..4 inclusive: after Bb5, black to move, solution a7a6 (SAN "a6").
    // The old `i < initialPly` replay stopped after Nc6 (white to move), where
    // a7a6 is illegal — the route would have returned the unavailable fallback.
    const payload = {
      game: { pgn: "1. e4 e5 2. Nf3 Nc6 3. Bb5" },
      puzzle: {
        id: "replay-inclusive",
        initialPly: 4,
        solution: ["a7a6"],
        themes: ["opening"],
      },
    };
    vi.stubGlobal("fetch", mockFetchJsonResponse({ ok: true, body: payload }));
    const res = await GET();
    const body = await res.json();
    expect(body.source).toBe("lichess");
    expect(body.puzzle.toMove).toBe("black");
    expect(body.puzzle.bestMove).toBe("a6");
    expect(body.puzzle.accept).toContain("a6");
    expect(logWarn).not.toHaveBeenCalled();
  });

  it("returns the unavailable fallback and logs a warning on a non-OK upstream response", async () => {
    vi.stubGlobal("fetch", mockFetchJsonResponse({ ok: false }));
    const res = await GET();
    const body = await res.json();
    expect(body.puzzle).toBeNull();
    expect(body.source).toBe("unavailable");
    expect(res.headers.get("cache-control")).toBe("public, s-maxage=300");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });

  it("returns the unavailable fallback and logs a warning when the upstream payload is missing puzzle fields", async () => {
    vi.stubGlobal("fetch", mockFetchJsonResponse({ ok: true, body: {} }));
    const res = await GET();
    const body = await res.json();
    expect(body.puzzle).toBeNull();
    expect(body.source).toBe("unavailable");
    expect(logWarn).toHaveBeenCalledTimes(1);
  });
});
