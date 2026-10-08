import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const board = vi.hoisted(() => ({
  refresh: vi.fn(async () => []),
  submit: vi.fn(),
  setPeriod: vi.fn(),
  calls: [] as unknown[][],
}));

vi.mock("@/hooks/use-arcade-board", () => ({
  useArcadeBoard: (...args: unknown[]) => {
    board.calls.push(args);
    return {
      entries: [],
      you: null,
      period: "daily",
      setPeriod: board.setPeriod,
      loading: false,
      readError: null,
      refresh: board.refresh,
      submit: board.submit,
    };
  },
}));

import { useDailyText } from "../use-daily-text";

const DAY = "2026-10-08";
const BEST = { wpm: 60, ms: 60_000, chars: 300, acc: 97 };

function mount(over: Partial<Parameters<typeof useDailyText>[0]> = {}) {
  const onPosted = vi.fn();
  const hook = renderHook((props: Parameters<typeof useDailyText>[0]) => useDailyText(props), {
    initialProps: { day: DAY, best: BEST, posted: null, onPosted, ...over },
  });
  return { ...hook, onPosted };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
  board.calls.length = 0;
  board.refresh.mockClear();
  board.submit.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("useDailyText", () => {
  it("reads the daily board on mount and nowhere else, without fetching by itself", async () => {
    const { result } = mount();
    expect(board.calls[0]).toEqual(["typing-speed", { fetchOnMount: false, period: "daily" }]);
    await waitFor(() => expect(result.current.requested).toBe(true));
    expect(board.refresh).toHaveBeenCalledTimes(1);
  });

  it("posts the best attempt with the day, ms, chars and acc, then marks it sent", async () => {
    board.submit.mockResolvedValue({
      ok: true,
      rank: 4,
      boards: [{ period: "daily", board: "2026-10-08", rank: 2, best: 60, improved: true }],
    });
    const { result, onPosted } = mount();
    await act(async () => {
      await result.current.post("  Ada  ");
    });
    expect(board.submit).toHaveBeenCalledWith({
      name: "Ada",
      score: 60,
      day: 20261008,
      ms: 60_000,
      chars: 300,
      acc: 97,
    });
    expect(result.current.status).toBe("sent");
    expect(result.current.rank).toBe(2);
    expect(result.current.notice).toBe("Posted. Rank 2 today.");
    expect(onPosted).toHaveBeenCalledWith(60, "Ada");
  });

  it("falls back to a default name and caps the name at 12 characters", async () => {
    board.submit.mockResolvedValue({ ok: true });
    const { result } = mount();
    await act(async () => {
      await result.current.post("   ");
    });
    expect(board.submit.mock.calls[0]?.[0].name).toBe("Typist");
    const second = mount({ best: { ...BEST, wpm: 61 } });
    await act(async () => {
      await second.result.current.post("abcdefghijklmnop");
    });
    expect(board.submit.mock.calls[1]?.[0].name).toBe("abcdefghijkl");
  });

  it("does nothing without a best, and does not post twice", async () => {
    const none = mount({ best: null });
    await act(async () => {
      await none.result.current.post("Ada");
    });
    expect(board.submit).not.toHaveBeenCalled();

    board.submit.mockResolvedValue({ ok: true });
    const { result } = mount();
    await act(async () => {
      await result.current.post("Ada");
    });
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(board.submit).toHaveBeenCalledTimes(1);
  });

  it("shows sent from a stored posted WPM, until a better attempt arrives", () => {
    const { result, rerender, onPosted } = mount({ posted: 60 });
    expect(result.current.status).toBe("sent");
    rerender({ day: DAY, best: { ...BEST, wpm: 65 }, posted: 60, onPosted });
    expect(result.current.status).toBe("idle");
  });

  it("is closed, with no request, when the UTC day has turned over at Post", async () => {
    const { result } = mount();
    vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(board.submit).not.toHaveBeenCalled();
    expect(result.current.status).toBe("closed");
    expect(result.current.notice).toBe("Today's text has closed.");
  });

  it("stays closed for good once closed", async () => {
    const { result } = mount();
    vi.setSystemTime(new Date("2026-10-09T00:00:00Z"));
    await act(async () => {
      await result.current.post("Ada");
    });
    vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(board.submit).not.toHaveBeenCalled();
    expect(result.current.status).toBe("closed");
  });

  it("a 422 is rejected, but closed when the day turned over during the request", async () => {
    board.submit.mockResolvedValue({ ok: false, rejected: true });
    const a = mount();
    await act(async () => {
      await a.result.current.post("Ada");
    });
    expect(a.result.current.status).toBe("rejected");
    expect(a.onPosted).not.toHaveBeenCalled();

    board.submit.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-10-09T00:00:01Z"));
      return { ok: false, rejected: true };
    });
    const b = mount({ best: { ...BEST, wpm: 62 } });
    await act(async () => {
      await b.result.current.post("Ada");
    });
    expect(b.result.current.status).toBe("closed");
  });

  it("a network failure or a reset identity is failed and can be retried", async () => {
    board.submit.mockResolvedValueOnce({ ok: false });
    const { result } = mount();
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.notice).toBe("Board unreachable, try again.");

    board.submit.mockResolvedValueOnce({ ok: false, identityReset: true });
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(result.current.status).toBe("failed");
    expect(result.current.notice).toBe("Player id reset, post again.");

    board.submit.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      await result.current.post("Ada");
    });
    expect(result.current.status).toBe("sent");
  });
});
