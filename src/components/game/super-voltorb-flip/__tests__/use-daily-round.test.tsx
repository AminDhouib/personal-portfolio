import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDailyRound } from "../use-daily-round";
import { dailyBoard } from "../daily-board";

const DAY = "2026-10-07";
const board = dailyBoard(DAY); // nine 2s, ten Voltorbs, max 512
const index = (pred: (v: unknown) => boolean) => board.layout.findIndex(pred);
const tileOf = (i: number) => [Math.floor(i / 5), i % 5] as const;
const twos = board.layout
  .map((v, i) => [v, i] as const)
  .filter(([v]) => v === 2)
  .map(([, i]) => i);

const posts = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  // Nothing touches the network: reads get an empty board, writes are accepted.
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return new Response(
        JSON.stringify({
          ok: true,
          boards: [{ period: "daily", board: `daily:${DAY}`, rank: 1, best: 512, improved: true }],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ entries: [], you: null }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function play(result: { current: ReturnType<typeof useDailyRound> }, flips: number[]) {
  for (const i of flips) {
    const [row, col] = tileOf(i);
    act(() => {
      result.current.onFlipped(row, col);
      result.current.updateGame((g) => g.flipCell(row, col));
    });
  }
}

describe("useDailyRound", () => {
  it("deals today's board and starts a fresh attempt", () => {
    const { result } = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    expect(result.current.dayKey).toBe(DAY);
    expect(
      result.current.game.cells
        .flat()
        .map((c) => c.value)
        .join(""),
    ).toBe(board.layout.join(""));
    expect(result.current.restored).toBe(false);
    expect(result.current.outcome).toBeNull();
  });

  it("saves every flip, in order", () => {
    const { result } = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    const first = index((v) => v === 1);
    const second = index((v) => v === 2);
    play(result, [first, second]);
    expect(JSON.parse(window.localStorage.getItem("svf:daily") ?? "{}").flips).toEqual([
      first,
      second,
    ]);
  });

  it("a reload replays the attempt: same board, same flips, no reroll", () => {
    const first = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    const two = index((v) => v === 2);
    play(first.result, [two]);
    first.unmount();
    const again = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    expect(again.result.current.game.cells.flat()[two]?.isFlipped).toBe(true);
    expect(again.result.current.game.currentScore).toBe(2);
    expect(again.result.current.restored).toBe(false); // mid-round, so live again
  });

  it("records a win once, with the maximum, and reports it", () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => useDailyRound({ onOutcome }));
    play(result, twos);
    expect(result.current.outcome).toBe("won");
    expect(result.current.score).toBe(512);
    expect(onOutcome).toHaveBeenCalledTimes(1);
    expect(onOutcome).toHaveBeenCalledWith("won", DAY, 512);
    expect(JSON.parse(window.localStorage.getItem("svf:daily") ?? "{}").outcome).toBe("won");
  });

  it("a loss banks nothing", () => {
    const onOutcome = vi.fn();
    const { result } = renderHook(() => useDailyRound({ onOutcome }));
    play(result, [index((v) => v === 2), index((v) => v === "V")]);
    expect(result.current.outcome).toBe("lost");
    expect(result.current.score).toBe(0);
    expect(onOutcome).toHaveBeenCalledWith("lost", DAY, 0);
  });

  it("a finished board restored after a reload is not reported again and cannot be replayed", () => {
    const first = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    play(first.result, [index((v) => v === 2), index((v) => v === "V")]);
    first.unmount();
    const onOutcome = vi.fn();
    const again = renderHook(() => useDailyRound({ onOutcome }));
    expect(again.result.current.restored).toBe(true);
    expect(again.result.current.outcome).toBe("lost");
    expect(onOutcome).not.toHaveBeenCalled();
  });

  it("a restored quit keeps the coins it banked", () => {
    const first = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    play(first.result, [index((v) => v === 2)]);
    act(() => first.result.current.updateGame((g) => g.quit()));
    first.unmount();
    const again = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    expect(again.result.current.restored).toBe(true);
    expect(again.result.current.outcome).toBe("quit");
    expect(again.result.current.score).toBe(2);
  });

  it("yesterday's record is replaced by a fresh attempt, keeping the name", () => {
    window.localStorage.setItem(
      "svf:daily",
      '{"v":1,"handle":"Ada","day":"2026-10-06","flips":[3],"outcome":"lost","submitted":true}',
    );
    const { result } = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    expect(result.current.restored).toBe(false);
    expect(result.current.outcome).toBeNull();
    expect(result.current.handle).toBe("Ada");
    expect(result.current.submitted).toBe(false);
  });

  it("posts the score with the day and flip count, then remembers it", async () => {
    const { result } = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    play(result, twos);
    await act(async () => {
      await result.current.post("Ada");
    });
    const post = posts(fetchMock)[0];
    const body = JSON.parse(String(((post?.[1] ?? {}) as RequestInit).body));
    expect(body.game).toBe("super-voltorb-flip");
    expect(body.score).toBe(512);
    expect(body.detail).toEqual({ day: 20261007, flips: 9 });
    await waitFor(() => expect(result.current.submitState).toBe("sent"));
    expect(JSON.parse(window.localStorage.getItem("svf:daily") ?? "{}")).toMatchObject({
      handle: "Ada",
      submitted: true,
    });
  });

  it("will not post a loss", async () => {
    const { result } = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    play(result, [index((v) => v === 2), index((v) => v === "V")]);
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(posts(fetchMock)).toHaveLength(0);
  });

  it("will not post a second time", async () => {
    const { result } = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    play(result, twos);
    await act(async () => {
      await result.current.post("Ada");
    });
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(posts(fetchMock)).toHaveLength(1);
  });

  it("will not post after the UTC day rolled over", async () => {
    const { result } = renderHook(() => useDailyRound({ onOutcome: () => {} }));
    play(result, [index((v) => v === 2)]);
    act(() => result.current.updateGame((g) => g.quit()));
    vi.setSystemTime(new Date("2026-10-08T00:00:01Z"));
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(result.current.submitState).toBe("closed");
    expect(posts(fetchMock)).toHaveLength(0);
  });
});
