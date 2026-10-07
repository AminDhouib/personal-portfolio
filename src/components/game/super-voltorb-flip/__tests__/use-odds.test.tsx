import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { VoltorbFlip, cloneGame } from "../engine";
import { useOdds } from "../use-odds";
import { solve, type SolverInput, type SolverResult } from "../solver";
import type { SolveClient } from "../solve-client";

function fakeClient() {
  const calls: SolverInput[] = [];
  const client: SolveClient = {
    solve: vi.fn(async (input: SolverInput): Promise<SolverResult | null> => {
      calls.push(input);
      return solve(input);
    }),
    dispose: vi.fn(),
  };
  return { client, calls };
}

describe("useOdds", () => {
  it("returns null and never solves while the assist is off", () => {
    const { client } = fakeClient();
    const makeClient = vi.fn(() => client);
    const { result } = renderHook(() => useOdds(new VoltorbFlip(5), false, makeClient));
    expect(result.current).toBeNull();
    expect(client.solve).not.toHaveBeenCalled();
    expect(makeClient).not.toHaveBeenCalled();
  });

  it("solves a live board once and returns 25 tiles with a best flip", async () => {
    const { client } = fakeClient();
    const game = new VoltorbFlip(5);
    const { result } = renderHook(() => useOdds(game, true, () => client));
    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.tiles).toHaveLength(25);
    expect(client.solve).toHaveBeenCalledTimes(1);
  });

  it("does not solve again for an equal board (a cloned game object)", async () => {
    const { client } = fakeClient();
    const game = new VoltorbFlip(5);
    const { result, rerender } = renderHook(({ g }) => useOdds(g, true, () => client), {
      initialProps: { g: game },
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ g: game });
    expect(client.solve).toHaveBeenCalledTimes(1);
  });

  it("keeps one client across flips and solves the new board", async () => {
    const { client, calls } = fakeClient();
    const makeClient = vi.fn(() => client);
    const game = new VoltorbFlip(5);
    const { result, rerender } = renderHook(({ g }) => useOdds(g, true, makeClient), {
      initialProps: { g: game },
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    const index = game.cells.flat().findIndex((c) => c.value !== "V");
    const next = cloneGame(game);
    next.flipCell(Math.floor(index / 5), index % 5);
    // A coin tile is now revealed: the solver input differs, so it solves again.
    rerender({ g: next });
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[1]?.revealed.filter((v) => v !== null)).toHaveLength(1);
    expect(makeClient).toHaveBeenCalledTimes(1);
    expect(client.dispose).not.toHaveBeenCalled();
  });

  it("hides the old odds after a flip until the new ones land", async () => {
    let release: (() => void) | null = null;
    let call = 0;
    const client: SolveClient = {
      solve: vi.fn(async (input: SolverInput): Promise<SolverResult | null> => {
        call += 1;
        if (call === 2) await new Promise<void>((resolve) => (release = resolve));
        return solve(input);
      }),
      dispose: vi.fn(),
    };
    const game = new VoltorbFlip(5);
    const { result, rerender } = renderHook(({ g }) => useOdds(g, true, () => client), {
      initialProps: { g: game },
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    const index = game.cells.flat().findIndex((c) => c.value !== "V");
    const next = cloneGame(game);
    next.flipCell(Math.floor(index / 5), index % 5);
    rerender({ g: next });
    // The first board's answer is wrong for the new board: nothing is shown.
    expect(result.current).toBeNull();
    await waitFor(() => expect(release).not.toBeNull());
    release!();
    await waitFor(() => expect(result.current).not.toBeNull());
  });

  it("is null once the round is over", async () => {
    const { client } = fakeClient();
    const game = new VoltorbFlip(5);
    game.quit();
    const { result } = renderHook(() => useOdds(game, true, () => client));
    expect(result.current).toBeNull();
    expect(client.solve).not.toHaveBeenCalled();
  });

  it("is null when the solver cannot answer", async () => {
    const client: SolveClient = {
      solve: vi.fn(async () => ({ status: "too-many" as const })),
      dispose: vi.fn(),
    };
    const { result } = renderHook(() => useOdds(new VoltorbFlip(5), true, () => client));
    await waitFor(() => expect(client.solve).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it("drops the answer and disposes the client when the assist is switched off", async () => {
    const { client } = fakeClient();
    const game = new VoltorbFlip(5);
    const { result, rerender } = renderHook(({ on }) => useOdds(game, on, () => client), {
      initialProps: { on: true },
    });
    await waitFor(() => expect(result.current).not.toBeNull());
    rerender({ on: false });
    expect(result.current).toBeNull();
    expect(client.dispose).toHaveBeenCalled();
  });

  it("disposes its client on unmount", async () => {
    const { client } = fakeClient();
    const { unmount } = renderHook(() => useOdds(new VoltorbFlip(5), true, () => client));
    await waitFor(() => expect(client.solve).toHaveBeenCalled());
    unmount();
    expect(client.dispose).toHaveBeenCalled();
  });
});
