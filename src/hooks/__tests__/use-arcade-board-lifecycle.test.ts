import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ArcadeGameSlug } from "@/lib/arcade/games";

vi.mock("@/lib/arcade/identity", () => ({
  peekIdentity: () => null,
  getIdentity: () => ({ playerId: "11111111-1111-4111-8111-111111111111", token: "A".repeat(43) }),
  resetIdentity: () => ({
    playerId: "22222222-2222-4222-8222-222222222222",
    token: "B".repeat(43),
  }),
}));

import { useArcadeBoard } from "../use-arcade-board";

// What the hook does on mount and when the game it is given changes: the read it starts, the
// loading flag around it, and which game a later refresh() reads. Mocked fetch only.
function emptyBoard(): Response {
  return new Response(JSON.stringify({ entries: [], you: null }), { status: 200 });
}

function urls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map((call) => (call as [string])[0]);
}

describe("useArcadeBoard lifecycle", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("reportError", vi.fn());
  });

  it("starts the mount read and reports loading until it lands", async () => {
    let answer: (res: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { result } = renderHook(() => useArcadeBoard("hextris"));
    await waitFor(() => expect(result.current.loading).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      answer(emptyBoard());
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("never reports loading, nor reads, on mount when fetchOnMount is false", async () => {
    const { result } = renderHook(() => useArcadeBoard("hextris", { fetchOnMount: false }));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.loading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads the new game's board when the game changes, and only then", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(emptyBoard()));
    const { result, rerender } = renderHook(
      ({ game }: { game: ArcadeGameSlug }) => useArcadeBoard(game),
      { initialProps: { game: "hextris" as ArcadeGameSlug } },
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    rerender({ game: "hextris" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ game: "space-shooter" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(urls(fetchMock)).toEqual([
      "/api/arcade/scores?game=hextris&board=all-time",
      "/api/arcade/scores?game=space-shooter&board=all-time",
    ]);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("reads the latest game on a refresh() after the game changed, without a mount read", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(emptyBoard()));
    const { result, rerender } = renderHook(
      ({ game }: { game: ArcadeGameSlug }) => useArcadeBoard(game, { fetchOnMount: false }),
      { initialProps: { game: "hextris" as ArcadeGameSlug } },
    );
    rerender({ game: "space-shooter" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.refresh();
    });
    expect(urls(fetchMock)).toEqual(["/api/arcade/scores?game=space-shooter&board=all-time"]);
  });

  it("keeps refresh and submit stable across re-renders of the same game", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(emptyBoard()));
    const { result, rerender } = renderHook(() =>
      useArcadeBoard("hextris", { fetchOnMount: false }),
    );
    const { refresh, submit, setPeriod } = result.current;
    rerender();
    expect(result.current.refresh).toBe(refresh);
    expect(result.current.submit).toBe(submit);
    expect(result.current.setPeriod).toBe(setPeriod);
  });
});
