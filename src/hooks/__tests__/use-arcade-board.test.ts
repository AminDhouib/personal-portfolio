import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

const identity = vi.hoisted(() => ({ peek: vi.fn(), get: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/arcade/identity", () => ({
  peekIdentity: identity.peek,
  getIdentity: identity.get,
  resetIdentity: identity.reset,
}));

import { ARCADE_SCORE_CAP } from "@/lib/arcade/games";
import { useArcadeBoard } from "../use-arcade-board";

const ID = { playerId: "11111111-1111-4111-8111-111111111111", token: "A".repeat(43) };
const ID2 = { playerId: "22222222-2222-4222-8222-222222222222", token: "B".repeat(43) };

function okResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function serverEntry(over: Record<string, unknown> = {}) {
  return {
    rank: 1,
    handle: "Ada",
    score: 10,
    detail: { seconds: 60, kills: 40, distance: 1500 },
    achievedAt: "2026-10-06T10:00:00.000Z",
    ...over,
  };
}

function board(entries: unknown[], you: unknown = null) {
  return { game: "space-shooter", board: "all-time", entries, you };
}

describe("useArcadeBoard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let reportErrorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    reportErrorMock = vi.fn();
    vi.stubGlobal("reportError", reportErrorMock);
    identity.peek.mockReset().mockReturnValue(null);
    identity.get.mockReset().mockReturnValue(ID);
    identity.reset.mockReset().mockReturnValue(ID2);
  });

  describe("reading the board", () => {
    it("GETs the all-time board with the game in the query string on mount, no player param, and passes an AbortSignal", async () => {
      fetchMock.mockResolvedValueOnce(okResponse(board([])));
      renderHook(() => useArcadeBoard("hextris"));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe("/api/arcade/scores?game=hextris&board=all-time");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(init.cache).toBe("no-store");
    });

    it("adds the player id when an identity already exists", async () => {
      identity.peek.mockReturnValue(ID);
      fetchMock.mockResolvedValueOnce(okResponse(board([])));
      renderHook(() => useArcadeBoard("space-shooter"));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
        `/api/arcade/scores?game=space-shooter&board=all-time&player=${ID.playerId}`,
      );
      expect(identity.get).not.toHaveBeenCalled(); // a read never creates an identity
    });

    it("starts on the requested period", async () => {
      fetchMock.mockResolvedValueOnce(okResponse(board([])));
      const { result } = renderHook(() => useArcadeBoard("space-shooter", { period: "weekly" }));

      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
        "/api/arcade/scores?game=space-shooter&board=weekly",
      );
      expect(result.current.period).toBe("weekly");
    });

    it("does not fetch on mount when fetchOnMount is false, but refresh() works on demand", async () => {
      const { result } = renderHook(() => useArcadeBoard("hextris", { fetchOnMount: false }));
      await act(async () => {
        await Promise.resolve();
      });
      expect(fetchMock).not.toHaveBeenCalled();

      fetchMock.mockResolvedValueOnce(
        okResponse(board([serverEntry({ handle: "Bea", score: 99 })])),
      );
      let refreshed: { name: string }[] = [];
      await act(async () => {
        refreshed = await result.current.refresh();
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(refreshed.map((e) => e.name)).toEqual(["Bea"]);
      expect(result.current.entries.map((e) => e.name)).toEqual(["Bea"]);
    });

    it("setPeriod switches the period and refetches that board; the same period is a no-op", async () => {
      fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry({ handle: "Allie" })])));
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.loading).toBe(false));

      fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry({ handle: "Dee" })])));
      act(() => {
        result.current.setPeriod("daily");
      });
      expect(result.current.period).toBe("daily");
      await waitFor(() => expect(result.current.entries.map((e) => e.name)).toEqual(["Dee"]));
      expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
        "/api/arcade/scores?game=space-shooter&board=daily",
      );

      act(() => {
        result.current.setPeriod("daily");
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("maps server entries: handle to name, achievedAt to createdAt, detail fields flattened, isYou kept", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(
          board([
            serverEntry({ rank: 1, handle: "Ada", score: 500, isYou: true }),
            serverEntry({
              rank: 2,
              handle: "Bob",
              score: 400,
              detail: { seconds: 90, kills: 300, level: 17 },
              isYou: false,
            }),
          ]),
        ),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.entries).toEqual([
        {
          rank: 1,
          name: "Ada",
          score: 500,
          seconds: 60,
          kills: 40,
          distance: 1500,
          createdAt: "2026-10-06T10:00:00.000Z",
          isYou: true,
        },
        {
          rank: 2,
          name: "Bob",
          score: 400,
          level: 17,
          seconds: 90,
          kills: 300,
          createdAt: "2026-10-06T10:00:00.000Z",
          isYou: false,
        },
      ]);
      expect(result.current.readError).toBeNull();
    });

    it("tolerates a null or missing detail, and an absent isYou stays absent", async () => {
      // serverEntry sets no isYou unless asked, so entry 2 models a server that omits it.
      fetchMock.mockResolvedValueOnce(
        okResponse(
          board([
            serverEntry({ rank: 1, detail: undefined }),
            serverEntry({ rank: 2, handle: "Cy", detail: null }),
          ]),
        ),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.entries).toHaveLength(2);
      expect(result.current.entries[1]).toEqual({
        rank: 2,
        name: "Cy",
        score: 10,
        createdAt: "2026-10-06T10:00:00.000Z",
      });
      expect("isYou" in (result.current.entries[1] ?? {})).toBe(false);
    });

    it("maps you, and treats a missing or malformed you as null", async () => {
      fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry()], { rank: 4, score: 99 })));
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.you).toEqual({ rank: 4, score: 99 });

      fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry()], { rank: "x" })));
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.you).toBeNull();
    });

    it("guards a malformed { entries } shape down to an empty array instead of throwing", async () => {
      fetchMock.mockResolvedValueOnce(okResponse({ entries: "not-an-array" }));
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.entries).toEqual([]);
    });

    it("drops entries that do not match the expected shape", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(
          board([
            serverEntry({ handle: "Ada" }),
            serverEntry({ handle: "Missing", score: "not-a-number" }),
            serverEntry({ handle: "NoRank", rank: undefined }),
            null,
          ]),
        ),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.entries.map((e) => e.name)).toEqual(["Ada"]);
    });

    it("surfaces a non-ok GET response as an error without throwing", async () => {
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.readError).toBeTruthy();
      expect(result.current.entries).toEqual([]);
    });

    it("keeps the last board on a 429 read, sets an error, and does not retry on its own", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry({ handle: "Kept" })])));
        const { result } = renderHook(() => useArcadeBoard("space-shooter"));
        await waitFor(() => expect(result.current.entries.map((e) => e.name)).toEqual(["Kept"]));

        fetchMock.mockResolvedValueOnce(
          new Response(JSON.stringify({ error: "too many requests" }), {
            status: 429,
            headers: { "Retry-After": "30" },
          }),
        );
        await act(async () => {
          await result.current.refresh();
        });
        expect(result.current.readError).toContain("429");
        expect(result.current.entries.map((e) => e.name)).toEqual(["Kept"]);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(5 * 60_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2); // mount GET + the explicit refresh, no polling
      } finally {
        vi.useRealTimers();
      }
    });

    it("ignores boolean detail values (the legacy flag) and still maps the row", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(board([serverEntry({ detail: { legacy: true, seconds: 70 }, handle: "Old" })])),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.entries).toEqual([
        {
          rank: 1,
          name: "Old",
          score: 10,
          seconds: 70,
          createdAt: "2026-10-06T10:00:00.000Z",
        },
      ]);
    });

    it("shows the board without a you row, and no error, when the player was cut from a capped board", async () => {
      identity.peek.mockReturnValue(ID);
      fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry({ handle: "Top" })], null)));
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.loading).toBe(false));

      expect(result.current.you).toBeNull();
      expect(result.current.readError).toBeNull();
      expect(result.current.entries.map((e) => e.name)).toEqual(["Top"]);
    });

    it("reports and surfaces a GET rejection (for example a timeout) as an error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("timeout"));
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));

      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.readError).toBeTruthy();
      expect(reportErrorMock).toHaveBeenCalledTimes(1);
    });

    it("clears the rows and the you row the moment the period changes, before the new board lands", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(board([serverEntry({ handle: "Today" })], { rank: 1, score: 10 })),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.entries).toHaveLength(1));
      expect(result.current.you).toEqual({ rank: 1, score: 10 });

      let resolveWeek: (r: Response) => void = () => {};
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveWeek = resolve;
          }),
      );
      act(() => {
        result.current.setPeriod("weekly");
      });
      expect(result.current.entries).toEqual([]);
      expect(result.current.you).toBeNull();
      expect(result.current.loading).toBe(true);

      await act(async () => {
        resolveWeek(okResponse(board([serverEntry({ handle: "Week" })], { rank: 2, score: 8 })));
      });
      await waitFor(() => expect(result.current.entries.map((e) => e.name)).toEqual(["Week"]));
      expect(result.current.you).toEqual({ rank: 2, score: 8 });
    });

    it("leaves an empty board and an error, not the old period's rows, when the read after a switch fails", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(board([serverEntry({ handle: "Today" })], { rank: 1, score: 10 })),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.entries).toHaveLength(1));

      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "too many requests" }), { status: 429 }),
      );
      act(() => {
        result.current.setPeriod("weekly");
      });
      await waitFor(() => expect(result.current.readError).toContain("429"));
      expect(result.current.entries).toEqual([]);
      expect(result.current.you).toBeNull();
    });

    it("keeps the last board when a same-period refresh fails", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(board([serverEntry({ handle: "Kept" })], { rank: 1, score: 10 })),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.entries).toHaveLength(1));

      fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
      await act(async () => {
        await result.current.refresh();
      });
      expect(result.current.entries.map((e) => e.name)).toEqual(["Kept"]);
      expect(result.current.you).toEqual({ rank: 1, score: 10 });
    });

    // The games render the board panel and its tabs unconditionally and branch only the body
    // on these values, so the all-time states below must each be distinguishable.
    it("switching back to all-time empties the rows and reports loading until the read lands", async () => {
      fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry({ handle: "Allie" })])));
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(result.current.entries).toHaveLength(1));

      fetchMock.mockResolvedValueOnce(okResponse(board([])));
      act(() => {
        result.current.setPeriod("weekly");
      });
      await waitFor(() => expect(result.current.loading).toBe(false));

      let resolveAll: (r: Response) => void = () => {};
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveAll = resolve;
          }),
      );
      act(() => {
        result.current.setPeriod("all-time");
      });
      expect(result.current.period).toBe("all-time");
      expect(result.current.entries).toEqual([]);
      expect(result.current.loading).toBe(true);
      expect(result.current.readError).toBeNull();

      await act(async () => {
        resolveAll(okResponse(board([])));
      });
      await waitFor(() => expect(result.current.loading).toBe(false));
      // An empty all-time board: no rows, not loading, no error ("No scores yet").
      expect(result.current.entries).toEqual([]);
      expect(result.current.readError).toBeNull();
    });

    describe("readError", () => {
      const SUBMIT = { name: "Ada", score: 5, seconds: 1, kills: 1, distance: 1 };

      it("is null on a fresh hook and set by a failed read", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
        const { result } = renderHook(() => useArcadeBoard("space-shooter"));
        await waitFor(() => expect(result.current.readError).toContain("500"));
        expect(result.current).not.toHaveProperty("error");
      });

      it("is cleared by a later successful read", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
        const { result } = renderHook(() => useArcadeBoard("space-shooter"));
        await waitFor(() => expect(result.current.readError).toBeTruthy());

        fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry()])));
        await act(async () => {
          await result.current.refresh();
        });
        expect(result.current.readError).toBeNull();
        expect(result.current.entries).toHaveLength(1);
      });

      it("is cleared the moment the period changes, before the new board lands", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
        const { result } = renderHook(() => useArcadeBoard("space-shooter"));
        await waitFor(() => expect(result.current.readError).toBeTruthy());

        fetchMock.mockImplementationOnce(() => new Promise<Response>(() => {}));
        act(() => {
          result.current.setPeriod("weekly");
        });
        expect(result.current.readError).toBeNull();
        expect(result.current.loading).toBe(true);
      });

      it("is not set by a failed submit on an empty, successfully read board", async () => {
        fetchMock.mockResolvedValueOnce(okResponse(board([])));
        const { result } = renderHook(() => useArcadeBoard("space-shooter"));
        await waitFor(() => expect(result.current.loading).toBe(false));

        fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
        let outcome: unknown;
        await act(async () => {
          outcome = await result.current.submit(SUBMIT);
        });
        expect(outcome).toEqual({ ok: false });
        expect(result.current.readError).toBeNull();
      });

      it("is not set by a submit that throws, and is not cleared by a successful submit", async () => {
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
        const { result } = renderHook(() => useArcadeBoard("space-shooter"));
        await waitFor(() => expect(result.current.readError).toContain("503"));

        fetchMock.mockRejectedValueOnce(new Error("timeout"));
        await act(async () => {
          await result.current.submit(SUBMIT);
        });
        expect(result.current.readError).toContain("503");

        fetchMock.mockResolvedValueOnce(
          okResponse({
            ok: true,
            boards: [{ period: "all-time", board: "all-time", rank: 1, best: 5, improved: true }],
          }),
        );
        await act(async () => {
          await result.current.submit(SUBMIT);
        });
        expect(result.current.readError).toContain("503");
      });
    });

    it("ignores a slow response for a period the player has already left", async () => {
      let resolveFirst: (r: Response) => void = () => {};
      fetchMock.mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          }),
      );
      const { result } = renderHook(() => useArcadeBoard("space-shooter"));
      await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

      fetchMock.mockResolvedValueOnce(okResponse(board([serverEntry({ handle: "Today" })])));
      act(() => {
        result.current.setPeriod("daily");
      });
      await waitFor(() => expect(result.current.entries.map((e) => e.name)).toEqual(["Today"]));

      await act(async () => {
        resolveFirst(okResponse(board([serverEntry({ handle: "Stale" })])));
        await new Promise((r) => setTimeout(r, 0));
      });
      expect(result.current.entries.map((e) => e.name)).toEqual(["Today"]);
      expect(result.current.loading).toBe(false);
    });
  });

  describe("submitting a score", () => {
    async function mounted(
      game:
        | "space-shooter"
        | "hextris"
        | "super-voltorb-flip"
        | "tower-stacker"
        | "typing-speed" = "space-shooter",
    ) {
      fetchMock.mockResolvedValueOnce(okResponse(board([]))); // the mount GET
      const hook = renderHook(() => useArcadeBoard(game));
      await waitFor(() => expect(hook.result.current.loading).toBe(false));
      return hook;
    }

    const BOARDS = [
      // Deliberately not all-time first: the rank must be picked by period.
      { period: "daily", board: "2026-10-06", rank: 1, best: 500, improved: true },
      { period: "all-time", board: "all-time", rank: 3, best: 500, improved: true },
    ];

    it("POSTs identity, handle, score and the game's detail, passes an AbortSignal, and returns the all-time rank", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 500,
          seconds: 60,
          kills: 40,
          distance: 1500,
        });
      });

      expect(submitResult).toEqual({ ok: true, rank: 3, boards: BOARDS });
      const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
      expect(url).toBe("/api/arcade/scores");
      expect(init.method).toBe("POST");
      expect(init.signal).toBeInstanceOf(AbortSignal);
      expect(JSON.parse(init.body as string)).toEqual({
        game: "space-shooter",
        playerId: ID.playerId,
        token: ID.token,
        handle: "Ada",
        score: 500,
        detail: { seconds: 60, kills: 40, distance: 1500 },
      });
      expect(identity.get).toHaveBeenCalledTimes(1); // the identity is created at submit time
    });

    it("floors every number, clamps negatives to 0, drops non-finite values", async () => {
      const { result } = await mounted("hextris");
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      await act(async () => {
        await result.current.submit({
          name: "Ada",
          score: 1234.7,
          seconds: 61.9,
          kills: -3,
          level: Number.NaN,
        });
      });
      const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(body.score).toBe(1234);
      expect(body.detail).toEqual({ seconds: 61, kills: 0 });
    });

    it("sends only the keys of the game: hextris drops distance, space-shooter drops level", async () => {
      const hextris = await mounted("hextris");
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      // Not a fresh literal on purpose: the type forbids the extra key, the runtime must too.
      const hextrisPayload = {
        name: "Ada",
        score: 9,
        seconds: 5,
        kills: 6,
        level: 2.9,
        distance: 99,
      };
      await act(async () => {
        await hextris.result.current.submit(hextrisPayload);
      });
      const hx = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(hx.detail).toEqual({ seconds: 5, kills: 6, level: 2 });

      fetchMock.mockClear();
      const shooter = await mounted("space-shooter");
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      const shooterPayload = {
        name: "Ada",
        score: 9,
        seconds: 5,
        kills: 6,
        distance: 7,
        level: 4,
      };
      await act(async () => {
        await shooter.result.current.submit(shooterPayload);
      });
      const ss = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(ss.detail).toEqual({ seconds: 5, kills: 6, distance: 7 });
    });

    it("sends Super Voltorb Flip's day and flips as its whole detail", async () => {
      const { result } = await mounted("super-voltorb-flip");
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      await act(async () => {
        await result.current.submit({ name: "Ada", score: 64, day: 20261007, flips: 6 });
      });
      const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(body.game).toBe("super-voltorb-flip");
      expect(body.score).toBe(64);
      expect(body.detail).toEqual({ day: 20261007, flips: 6 });
    });

    it("reads day and flips off a Super Voltorb Flip row", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(board([serverEntry({ detail: { day: 20261007, flips: 9 } })])),
      );
      const { result } = renderHook(() => useArcadeBoard("super-voltorb-flip"));
      await waitFor(() => expect(result.current.entries).toHaveLength(1));
      expect(result.current.entries[0]).toMatchObject({ day: 20261007, flips: 9 });
    });

    it("sends Tower Stacker's day, floors, perfects, streak and seconds as its whole detail", async () => {
      const { result } = await mounted("tower-stacker");
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      await act(async () => {
        await result.current.submit({
          name: "Ada",
          score: 220,
          day: 20261015,
          blocks: 7,
          perfects: 5,
          streak: 5,
          seconds: 7,
        });
      });
      const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(body.game).toBe("tower-stacker");
      expect(body.score).toBe(220);
      expect(body.detail).toEqual({ day: 20261015, blocks: 7, perfects: 5, streak: 5, seconds: 7 });
    });

    it("reads the landings off a Tower Stacker row", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(
          board([
            serverEntry({
              detail: { day: 20261015, blocks: 7, perfects: 5, streak: 5, seconds: 7 },
            }),
          ]),
        ),
      );
      const { result } = renderHook(() => useArcadeBoard("tower-stacker"));
      await waitFor(() => expect(result.current.entries).toHaveLength(1));
      expect(result.current.entries[0]).toMatchObject({
        day: 20261015,
        blocks: 7,
        perfects: 5,
        streak: 5,
        seconds: 7,
      });
    });

    it("sends Typing Speed's day, ms, chars and acc as its whole detail", async () => {
      const { result } = await mounted("typing-speed");
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      await act(async () => {
        await result.current.submit({
          name: "Ada",
          score: 60,
          day: 20261008,
          ms: 60_000,
          chars: 300,
          acc: 97,
        });
      });
      const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(body.game).toBe("typing-speed");
      expect(body.score).toBe(60);
      expect(body.detail).toEqual({ day: 20261008, ms: 60_000, chars: 300, acc: 97 });
    });

    it("reads the run off a Typing Speed row", async () => {
      fetchMock.mockResolvedValueOnce(
        okResponse(
          board([serverEntry({ detail: { day: 20261008, ms: 60_000, chars: 300, acc: 97 } })]),
        ),
      );
      const { result } = renderHook(() => useArcadeBoard("typing-speed"));
      await waitFor(() => expect(result.current.entries).toHaveLength(1));
      expect(result.current.entries[0]).toMatchObject({
        day: 20261008,
        ms: 60_000,
        chars: 300,
        acc: 97,
      });
    });

    it("a 422 is a rejection, not a retryable failure", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(okResponse({ error: "implausible", reason: "kills" }, 422));
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false, rejected: true });
      expect(result.current.readError).toBeNull(); // a submit failure is the caller's, not a read error
    });

    it("a 403 identity error resets the identity once and does not retry on its own", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(okResponse({ error: "identity" }, 403));
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false, identityReset: true });
      expect(identity.reset).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2); // mount GET + the one POST
    });

    it("any other 403 is a plain failure and keeps the identity", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(okResponse({ error: "forbidden" }, 403));
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false });
      expect(identity.reset).not.toHaveBeenCalled();
    });

    it("returns { ok:false } on a non-ok submit response with no body", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false });
      expect(result.current.readError).toBeNull(); // a submit failure is the caller's, not a read error
    });

    it("returns { ok:false } when a 200 body does not say ok:true", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(okResponse({ ok: false }));
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false });
    });

    it("reports and returns { ok:false } when submit rejects (for example a timeout)", async () => {
      const { result } = await mounted();
      fetchMock.mockRejectedValueOnce(new Error("timeout"));
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false });
      expect(reportErrorMock).toHaveBeenCalledTimes(1);
    });

    it("clips an over-long handle to 200 characters before sending", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      await act(async () => {
        await result.current.submit({
          name: "x".repeat(500),
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(body.handle).toBe("x".repeat(200));
    });

    it("does not POST a score above the cap: it returns a rejection", async () => {
      const { result } = await mounted();
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: ARCADE_SCORE_CAP + 1,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false, rejected: true });
      expect(fetchMock).toHaveBeenCalledTimes(1); // the mount GET only
      expect(result.current.readError).toBeNull(); // a submit failure is the caller's, not a read error
    });

    it("compares the cap after flooring, so a score exactly at the cap is still POSTed", async () => {
      const { result } = await mounted();
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      await act(async () => {
        await result.current.submit({
          name: "Ada",
          score: ARCADE_SCORE_CAP + 0.9,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
      expect(body.score).toBe(ARCADE_SCORE_CAP);
    });

    it("returns { ok:false } instead of rejecting when the identity cannot be created", async () => {
      const { result } = await mounted();
      identity.get.mockImplementation(() => {
        throw new Error("crypto unavailable");
      });
      let submitResult: unknown;
      await act(async () => {
        submitResult = await result.current.submit({
          name: "Ada",
          score: 5,
          seconds: 1,
          kills: 1,
          distance: 1,
        });
      });
      expect(submitResult).toEqual({ ok: false });
      expect(fetchMock).toHaveBeenCalledTimes(1); // no POST without an identity
      expect(reportErrorMock).toHaveBeenCalledTimes(1);
      expect(result.current.readError).toBeNull(); // a submit failure is the caller's, not a read error
    });

    it("requires every detail key of the game at compile time", async () => {
      const { result } = await mounted("hextris");
      fetchMock.mockResolvedValueOnce(okResponse({ ok: true, boards: BOARDS }));
      await act(async () => {
        // @ts-expect-error hextris requires level, which is missing here
        await result.current.submit({ name: "Ada", score: 5, seconds: 1, kills: 1 });
      });
    });
  });
});
