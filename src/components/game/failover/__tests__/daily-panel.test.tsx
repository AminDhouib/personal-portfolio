import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ peek: vi.fn(), get: vi.fn(), reset: vi.fn() }));
vi.mock("@/lib/arcade/identity", () => ({
  peekIdentity: identity.peek,
  getIdentity: identity.get,
  resetIdentity: identity.reset,
}));

import { utcDayKey } from "@/lib/arcade/boards";
import { dayNumber } from "../daily/daily";
import type { DailyResult } from "../daily/result";
import { HANDLE_KEY } from "../handle";
import { DailyPanel } from "../ui/daily-panel";

const ID = { playerId: "11111111-1111-4111-8111-111111111111", token: "A".repeat(43) };

function result(over: Partial<DailyResult> = {}): DailyResult {
  return {
    day: utcDayKey(new Date()),
    score: 8420,
    seconds: 342,
    ticks: 6840,
    actions: 12,
    proof: "0,8",
    ...over,
  };
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

const BOARD = {
  game: "failover",
  board: "daily",
  entries: [
    {
      rank: 1,
      handle: "Ada",
      score: 9100,
      detail: { day: 20261015, seconds: 400, ticks: 8000, actions: 20 },
      achievedAt: "2026-10-15T10:00:00.000Z",
    },
  ],
  you: null,
};

let fetchMock: ReturnType<typeof vi.fn>;

/** The POSTs made so far, parsed. */
function posts(): Array<Record<string, unknown>> {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse((init as RequestInit).body as string) as Record<string, unknown>);
}

function route(post: () => Response) {
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    Promise.resolve(init?.method === "POST" ? post() : json(BOARD)),
  );
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("reportError", vi.fn());
  identity.peek.mockReset().mockReturnValue(null);
  identity.get.mockReset().mockReturnValue(ID);
  identity.reset.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function mount(over: Partial<DailyResult> = {}) {
  route(() =>
    json({
      ok: true,
      boards: [{ period: "daily", board: "x", rank: 3, best: 8420, improved: true }],
    }),
  );
  render(<DailyPanel result={result(over)} />);
  await screen.findAllByText("Ada");
}

const submit = () => fireEvent.click(screen.getByRole("button", { name: /^(Submit|Retry)$/ }));

describe("opening the panel", () => {
  it("reads today's board and posts nothing", async () => {
    await mount();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/arcade/scores?game=failover&board=daily");
    expect(posts()).toHaveLength(0);
  });

  it("shows Your best when the player is not among the rows", async () => {
    fetchMock.mockResolvedValue(json({ ...BOARD, you: { rank: 7, score: 5000 } }));
    render(<DailyPanel result={result()} />);
    expect(await screen.findAllByText("Your best: #7 (5000)")).toBeTruthy();
  });

  it("switches period tabs and reads that board", async () => {
    await mount();
    fireEvent.click(screen.getByRole("button", { name: "All time" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(
        "/api/arcade/scores?game=failover&board=all-time",
      ),
    );
  });
});

describe("submitting", () => {
  it("sends the score, exactly the detail keys and the proof, with the typed name", async () => {
    await mount();
    fireEvent.change(screen.getByLabelText("Name for the board"), { target: { value: "Grace" } });
    submit();
    await screen.findAllByText("Posted. Rank 3 today.");
    expect(posts()).toHaveLength(1);
    expect(posts()[0]).toMatchObject({
      game: "failover",
      handle: "Grace",
      score: 8420,
      detail: { day: dayNumber(utcDayKey(new Date())), seconds: 342, ticks: 6840, actions: 12 },
      proof: "0,8",
    });
    expect(window.localStorage.getItem(HANDLE_KEY)).toBe('{"v":1,"handle":"Grace"}');
  });

  it("locks after a post so one run is sent once", async () => {
    await mount();
    submit();
    await screen.findAllByText("Posted. Rank 3 today.");
    const button = screen.getByRole("button", { name: "Saved" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(posts()).toHaveLength(1);
  });

  it("remembers the name for the next run", async () => {
    window.localStorage.setItem(HANDLE_KEY, '{"v":1,"handle":"Linus"}');
    await mount();
    expect((screen.getByLabelText("Name for the board") as HTMLInputElement).value).toBe("Linus");
  });

  it("says a 422 plainly, and offers no retry", async () => {
    await mount();
    route(() => json({ error: "implausible", reason: "score does not match the replay" }, 422));
    submit();
    expect(await screen.findAllByText("This run could not be verified")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(posts()).toHaveLength(1);
  });

  it("says Board unreachable on a failed post, and Retry sends again", async () => {
    await mount();
    route(() => json({}, 500));
    submit();
    expect(
      await screen.findAllByText("Could not reach the board. Try again in a moment."),
    ).toBeTruthy();
    route(() => json({ ok: true, boards: [] }));
    submit();
    await screen.findAllByText("Posted.");
    expect(posts()).toHaveLength(2);
  });
});

describe("guards before the POST", () => {
  it("sends one POST when the form is submitted twice while the first is pending", async () => {
    await mount();
    let answer: (res: Response) => void = () => undefined;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Promise<Response>((resolve) => {
            answer = resolve;
          })
        : Promise.resolve(json(BOARD)),
    );
    const form = screen.getByLabelText("Name for the board").closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    await act(async () => {
      await Promise.resolve();
    });
    expect(posts()).toHaveLength(1);
    await act(async () => {
      answer(json({ ok: true, boards: [] }));
    });
    await screen.findAllByText("Posted.");
    expect(posts()).toHaveLength(1);
  });

  it("closes and posts nothing when 00:00 UTC passes between game over and Submit", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T23:59:50Z"));
    await mount({ day: "2026-10-15" });
    vi.setSystemTime(new Date("2026-10-16T00:00:05Z"));
    submit();
    expect(
      (await screen.findAllByText("Today's incident closed at 00:00 UTC. Start the new one."))
        .length,
    ).toBeGreaterThan(0);
    expect(posts()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /^(Submit|Retry)$/ })).toBeNull();
  });
});

describe("a busy board (503)", () => {
  it("shows the message, holds Retry for the Retry-After, then sends the run again", async () => {
    await mount();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    route(() => json({ error: "busy" }, 503, { "Retry-After": "3" }));
    submit();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getAllByText("The board is busy, try again in a moment").length).toBeGreaterThan(
      0,
    );
    const retry = screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(true);
    fireEvent.click(retry);
    expect(posts()).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2999);
    });
    expect(retry.disabled).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(retry.disabled).toBe(false);

    route(() => json({ ok: true, boards: [] }));
    fireEvent.click(retry);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(posts()).toHaveLength(2);
    expect(screen.getAllByText("Posted.").length).toBeGreaterThan(0);
  });
});

describe("a run that cannot be ranked", () => {
  it("says Too many actions to rank, offers no Submit, and never posts", async () => {
    await mount({ proof: null, actions: 700 });
    expect(screen.getByText("Too many actions to rank")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Submit|Retry)$/ })).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it("closes when the incident belongs to a past UTC day", async () => {
    await mount({ day: "2020-01-01" });
    expect(
      screen.getByText("Today's incident closed at 00:00 UTC. Start the new one."),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^(Submit|Retry)$/ })).toBeNull();
    expect(posts()).toHaveLength(0);
  });
});

describe("sharing", () => {
  it("shares the one-line result", async () => {
    await mount({ day: utcDayKey(new Date()) });
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { share });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(share).toHaveBeenCalledWith({
      text: `Failover daily ${utcDayKey(new Date())}: 5:42, 8420. amindhou.com/games/failover`,
    });
  });

  it("copies when there is no share sheet, and says so", async () => {
    await mount();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Result copied."));
  });
});
