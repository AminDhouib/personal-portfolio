import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { BoardPanel, type FinishedRun } from "../board-panel";

const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

function entry(over: Record<string, unknown> = {}) {
  return {
    rank: 1,
    handle: "Cy",
    score: 480,
    achievedAt: "2026-10-15T10:00:00.000Z",
    detail: { day: 20261015, blocks: 34, perfects: 9, streak: 5, seconds: 40 },
    ...over,
  };
}

const RUN: FinishedRun = {
  mode: "daily",
  dayKey: "2026-10-15",
  score: 220,
  floors: 7,
  perfects: 5,
  bestStreak: 5,
  seconds: 7,
  closed: false,
};

function panel(over: Partial<FinishedRun> = {}, extra: { handle?: string } = {}) {
  const onHandle = vi.fn();
  const onPlayDaily = vi.fn();
  render(
    <BoardPanel
      run={{ ...RUN, ...over }}
      handle={extra.handle ?? ""}
      streakDays={0}
      onHandle={onHandle}
      onPlayDaily={onPlayDaily}
    />,
  );
  return { onHandle, onPlayDaily };
}

const gets = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method !== "POST");
const posts = () =>
  fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  // RUN is a tower of 2026-10-15; Submit rechecks the UTC day, so hold the clock inside it.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
  window.localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("the daily board panel", () => {
  it("reads today's board once when the card opens, and renders heading, three tabs and rows", async () => {
    fetchMock.mockResolvedValueOnce(
      json({ entries: [entry(), entry({ rank: 2, handle: "Bo", score: 300 })], you: null }),
    );
    panel();
    expect(screen.getByRole("heading", { name: /^Tower board$/ })).toBeTruthy();
    expect(screen.getAllByRole("button", { pressed: true }).map((b) => b.textContent)).toContain(
      "Today",
    );
    expect(screen.getByRole("button", { name: "This week" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "All time" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Cy")).toBeTruthy());
    expect(screen.getByText("Bo")).toBeTruthy();
    expect(gets()).toHaveLength(1);
    expect((gets()[0] as [string])[0]).toBe("/api/arcade/scores?game=tower-stacker&board=daily");
    expect(posts()).toHaveLength(0);
  });

  it("keeps the panel when the read fails, and says so in the body", async () => {
    fetchMock.mockResolvedValueOnce(json({}, 500));
    panel();
    expect(screen.getByRole("heading", { name: /^Tower board$/ })).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Could not load the board")).toBeTruthy());
    expect(screen.getByRole("button", { name: "All time" })).toBeTruthy();
  });

  it("says when the board is empty", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    panel();
    await waitFor(() => expect(screen.getByText("No scores yet today")).toBeTruthy());
  });

  it("a tab switch reads that board and keeps the focused tab mounted", async () => {
    fetchMock.mockResolvedValue(json({ entries: [entry()], you: null }));
    panel();
    await waitFor(() => expect(screen.getByText("Cy")).toBeTruthy());
    const week = screen.getByRole("button", { name: "This week" });
    week.focus();
    fireEvent.click(week);
    await waitFor(() => expect(gets()).toHaveLength(2));
    expect((gets()[1] as [string])[0]).toBe("/api/arcade/scores?game=tower-stacker&board=weekly");
    const after = screen.getByRole("button", { name: "This week" });
    expect(after).toBe(week);
    expect(document.activeElement).toBe(week);
    expect(after.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the viewer's own best when they are off the visible rows", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [entry()], you: { rank: 42, score: 130 } }));
    panel();
    await waitFor(() => expect(screen.getByText(/Your best: #42 \(130\)/)).toBeTruthy());
  });
});

describe("posting a daily result", () => {
  async function post(name: string) {
    const input = screen.getByLabelText("Name for the board");
    fireEvent.change(input, { target: { value: name } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
  }

  it("sends exactly the run's numbers and today's day, then shows the rank line", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    const { onHandle } = panel({}, { handle: "Ada" });
    expect((screen.getByLabelText("Name for the board") as HTMLInputElement).value).toBe("Ada");
    fetchMock.mockResolvedValueOnce(
      json({
        ok: true,
        boards: [
          { period: "all-time", board: "all-time", rank: 9, best: 220, improved: true },
          { period: "weekly", board: "weekly:2026-W42", rank: 5, best: 220, improved: true },
          { period: "daily", board: "daily:2026-10-15", rank: 3, best: 220, improved: true },
        ],
      }),
    );
    fetchMock.mockResolvedValueOnce(json({ entries: [entry({ handle: "Ada" })], you: null }));
    await post("Ada Lovelace the First");
    await waitFor(() => expect(screen.getByText("#3 today")).toBeTruthy());
    const body = JSON.parse((posts()[0] as [string, RequestInit])[1].body as string);
    expect(body.game).toBe("tower-stacker");
    expect(body.handle).toBe("Ada Lovelace");
    expect(body.score).toBe(220);
    expect(body.detail).toEqual({ day: 20261015, blocks: 7, perfects: 5, streak: 5, seconds: 7 });
    expect(onHandle).toHaveBeenCalledWith("Ada Lovelace");
    expect(posts()).toHaveLength(1);
    // The board is read again so the new row shows up.
    await waitFor(() => expect(gets()).toHaveLength(2));
  });

  it("an empty name posts as Stacker", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    panel();
    fetchMock.mockResolvedValueOnce(json({ ok: true, boards: [] }));
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    await post("   ");
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse((posts()[0] as [string, RequestInit])[1].body as string).handle).toBe(
      "Stacker",
    );
  });

  it("a 422 says the run was not accepted and offers no retry", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    panel();
    fetchMock.mockResolvedValueOnce(json({ error: "implausible", reason: "x" }, 422));
    await post("Ada");
    await waitFor(() => expect(screen.getByText("This run was not accepted.")).toBeTruthy());
    expect(
      (screen.getByRole("button", { name: /Submit|Rejected/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(posts()).toHaveLength(1);
  });

  it("an identity reset asks the player to submit again, and allows it", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    panel();
    fetchMock.mockResolvedValueOnce(json({ error: "identity" }, 403));
    await post("Ada");
    await waitFor(() =>
      expect(screen.getByText("Your player id was reset; submit again.")).toBeTruthy(),
    );
    expect((screen.getByRole("button", { name: "Submit" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("a network failure offers a retry", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    panel();
    fetchMock.mockResolvedValueOnce(json({}, 500));
    await post("Ada");
    await waitFor(() => expect(screen.getByText(/Could not reach the board/)).toBeTruthy());
    expect((screen.getByRole("button", { name: "Retry" }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("offers no Submit for a run with no floors", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    panel({ score: 0, floors: 0, perfects: 0, bestStreak: 0, seconds: 1 });
    expect(screen.queryByLabelText("Name for the board")).toBeNull();
    expect(screen.getByRole("heading", { name: /^Tower board$/ })).toBeTruthy();
  });
});

describe("a tower that closed at midnight", () => {
  it("says so, offers the new tower and posts nothing", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    const { onPlayDaily } = panel({ closed: true });
    expect(screen.getByText("Today's tower closed at 00:00 UTC. Play the new one.")).toBeTruthy();
    expect(screen.queryByLabelText("Name for the board")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play the new tower" }));
    expect(onPlayDaily).toHaveBeenCalledTimes(1);
    await act(async () => {
      await Promise.resolve();
    });
    expect(posts()).toHaveLength(0);
  });
});

describe("a free build", () => {
  it("has no form, no board read and no tabs, only a way to the daily tower", async () => {
    const { onPlayDaily } = panel({ mode: "free" });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByLabelText("Name for the board")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "This week" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play today's tower" }));
    expect(onPlayDaily).toHaveBeenCalledTimes(1);
  });
});

describe("sharing a daily result", () => {
  it("copies the result line and says so", async () => {
    fetchMock.mockResolvedValue(json({ entries: [], you: null }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    panel();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy());
    expect(writeText).toHaveBeenCalledWith(
      "Tower Stacker, 2026-10-15: 7 floors, 220 points, best streak 5. https://amindhou.com/games/tower-stacker",
    );
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "clipboard");
  });

  it("is not offered for a free build or an empty tower", async () => {
    fetchMock.mockResolvedValue(json({ entries: [], you: null }));
    panel({ floors: 0, score: 0 });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
    cleanup();
    panel({ mode: "free" });
    expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
  });
});

describe("the first paint", () => {
  it("says Loading, never an empty board, before the read starts", () => {
    const html = renderToString(
      <BoardPanel
        run={RUN}
        handle=""
        streakDays={0}
        onHandle={() => undefined}
        onPlayDaily={() => undefined}
      />,
    );
    expect(html).toContain("Loading");
    expect(html).not.toContain("No scores yet");
  });

  it("keeps the list in a box five rows tall whatever it holds", async () => {
    fetchMock.mockResolvedValue(json({ entries: [], you: null }));
    panel();
    await waitFor(() => expect(screen.getByText("No scores yet today")).toBeTruthy());
    expect(screen.getByTestId("tower-board-list").className).toContain("min-h-[9.25rem]");
  });

  it("labels the board without calling the weekly and all-time tabs Today's", () => {
    fetchMock.mockResolvedValue(json({ entries: [], you: null }));
    panel();
    expect(screen.getByRole("heading", { name: "Tower board" })).toBeTruthy();
    expect(screen.queryByText(/Today's tower board/)).toBeNull();
  });

  it("sets the name field to 16 px on phones so iOS does not zoom on focus", () => {
    fetchMock.mockResolvedValue(json({ entries: [], you: null }));
    panel();
    const cls = screen.getByLabelText("Name for the board").className;
    expect(cls).toContain("text-base");
    expect(cls).toContain("sm:text-sm");
  });
});

describe("the live region", () => {
  it("is one persistent status that carries the share and submit outcomes", async () => {
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    panel();
    const live = screen.getByRole("status");
    expect(live.textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(live.textContent).toContain("copied"));
    fetchMock.mockResolvedValueOnce(json({ error: "implausible", reason: "x" }, 422));
    fireEvent.change(screen.getByLabelText("Name for the board"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(live.textContent).toContain("not accepted"));
    expect(screen.getAllByRole("status")).toHaveLength(1);
    Reflect.deleteProperty(navigator, "share");
    Reflect.deleteProperty(navigator, "clipboard");
  });
});

describe("a card left open past midnight", () => {
  afterEach(() => vi.useRealTimers());

  it("recomputes the day at Submit: closed copy, no post, a way to the new tower", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T23:59:50Z"));
    fetchMock.mockResolvedValue(json({ entries: [], you: null }));
    const { onPlayDaily } = panel();
    await act(async () => {
      await Promise.resolve();
    });
    vi.setSystemTime(new Date("2026-10-16T00:00:10Z"));
    fireEvent.change(screen.getByLabelText("Name for the board"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(screen.getByText("Today's tower closed at 00:00 UTC. Play the new one.")).toBeTruthy(),
    );
    expect(posts()).toHaveLength(0);
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(screen.queryByText("This run was not accepted.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play the new tower" }));
    expect(onPlayDaily).toHaveBeenCalledTimes(1);
  });

  it("treats a 422 after midnight as closed, not as a rejected run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T23:59:59Z"));
    fetchMock.mockResolvedValueOnce(json({ entries: [], you: null }));
    panel();
    await act(async () => {
      await Promise.resolve();
    });
    fetchMock.mockImplementationOnce(async () => {
      vi.setSystemTime(new Date("2026-10-16T00:00:01Z"));
      return json({ error: "implausible", reason: "not today's tower" }, 422);
    });
    fireEvent.change(screen.getByLabelText("Name for the board"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(screen.getByText("Today's tower closed at 00:00 UTC. Play the new one.")).toBeTruthy(),
    );
    expect(screen.queryByText("This run was not accepted.")).toBeNull();
    expect(screen.getByRole("button", { name: "Play the new tower" })).toBeTruthy();
  });
});
