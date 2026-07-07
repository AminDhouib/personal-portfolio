import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useLeaderboard } from "../use-leaderboard";

describe("useLeaderboard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let reportErrorMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    reportErrorMock = vi.fn();
    vi.stubGlobal("reportError", reportErrorMock);
  });

  function okResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200 });
  }

  it("GETs with the game injected into the query string on mount, and passes an AbortSignal", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ entries: [] }));
    renderHook(() => useLeaderboard("hextris"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/leaderboard?game=hextris");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("does not fetch on mount when fetchOnMount is false (tower-stacker: POST-only, never reads the board)", async () => {
    renderHook(() => useLeaderboard("tower-stacker", { fetchOnMount: false }));

    // Give any stray microtask a chance to run before asserting the negative.
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still supports an on-demand refresh() even when fetchOnMount is false", async () => {
    const { result } = renderHook(() => useLeaderboard("tower-stacker", { fetchOnMount: false }));
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(
      okResponse({ entries: [{ name: "Ada", score: 1, level: 1, createdAt: "t" }] }),
    );
    let refreshed: unknown;
    await act(async () => {
      refreshed = await result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refreshed).toHaveLength(1);
  });

  it("parses ok entries into state and clears loading/error", async () => {
    const seed = [{ name: "Ada", score: 10, level: 1, createdAt: "t" }];
    fetchMock.mockResolvedValueOnce(okResponse({ entries: seed }));
    const { result } = renderHook(() => useLeaderboard("space-shooter"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual(seed);
    expect(result.current.error).toBeNull();
  });

  it("guards a malformed { entries } shape down to an empty array instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ entries: "not-an-array" }));
    const { result } = renderHook(() => useLeaderboard("space-shooter"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toEqual([]);
  });

  it("drops entries that don't match the expected shape", async () => {
    fetchMock.mockResolvedValueOnce(
      okResponse({
        entries: [
          { name: "Ada", score: 10, level: 1, createdAt: "t" },
          { name: "Missing", score: "not-a-number", level: 1, createdAt: "t" },
        ],
      }),
    );
    const { result } = renderHook(() => useLeaderboard("space-shooter"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]?.name).toBe("Ada");
  });

  it("surfaces a non-ok GET response as an error without throwing", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    const { result } = renderHook(() => useLeaderboard("space-shooter"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.entries).toEqual([]);
  });

  it("reports and surfaces a GET rejection (e.g. timeout) as an error", async () => {
    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    const { result } = renderHook(() => useLeaderboard("space-shooter"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it("POSTs with the game injected into the body on submit, and passes an AbortSignal", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ entries: [] })); // initial mount GET
    const { result } = renderHook(() => useLeaderboard("tower-stacker"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(okResponse({ ok: true, rank: 3 }));
    let submitResult: { ok: boolean; rank?: number } | undefined;
    await act(async () => {
      submitResult = await result.current.submit({ name: "Ada", score: 500, level: 1 });
    });

    expect(submitResult).toEqual({ ok: true, rank: 3 });
    const postCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const [url, init] = postCall;
    expect(url).toBe("/api/leaderboard");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const sentBody = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(sentBody.game).toBe("tower-stacker");
    expect(sentBody.name).toBe("Ada");
  });

  it("returns { ok:false } and sets error on a non-ok submit response", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ entries: [] }));
    const { result } = renderHook(() => useLeaderboard("hextris"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockResolvedValueOnce(new Response(null, { status: 400 }));
    let submitResult: { ok: boolean; rank?: number } | undefined;
    await act(async () => {
      submitResult = await result.current.submit({ name: "Ada", score: 10, level: 1 });
    });

    expect(submitResult).toEqual({ ok: false });
    expect(result.current.error).toBeTruthy();
  });

  it("reports and returns { ok:false } when submit rejects (e.g. timeout)", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ entries: [] }));
    const { result } = renderHook(() => useLeaderboard("hextris"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchMock.mockRejectedValueOnce(new Error("timeout"));
    let submitResult: { ok: boolean; rank?: number } | undefined;
    await act(async () => {
      submitResult = await result.current.submit({ name: "Ada", score: 10, level: 1 });
    });

    expect(submitResult).toEqual({ ok: false });
    expect(reportErrorMock).toHaveBeenCalledTimes(1);
  });

  it("refresh() re-fetches on demand and returns the parsed entries", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ entries: [] }));
    const { result } = renderHook(() => useLeaderboard("hextris"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const fresh = [{ name: "Bea", score: 99, level: 1, createdAt: "t" }];
    fetchMock.mockResolvedValueOnce(okResponse({ entries: fresh }));
    let refreshed: unknown;
    await act(async () => {
      refreshed = await result.current.refresh();
    });

    expect(refreshed).toEqual(fresh);
    expect(result.current.entries).toEqual(fresh);
  });
});
