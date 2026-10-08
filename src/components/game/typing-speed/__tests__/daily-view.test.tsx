import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { DAILY_KEY } from "../daily-store";
import { dailyScore, dailyText } from "../engine/daily";
import { SENTINEL as S } from "../engine/input";
import { STATS_KEY, emptyStats } from "../stats";
import { fakeVV, getInput, restoreViewport, stubViewportClass, typeInto } from "./phone-helpers";

// Typing a whole 180-360 char passage through the game re-renders it per key and
// overruns the default 5 s test timeout, so the typing tests play a short prefix of the
// real day's text. The same-text test switches the cut off and checks the whole passage.
const cut = vi.hoisted(() => ({ on: true }));
vi.mock("../engine/daily", async (importOriginal) => {
  const real = await importOriginal<typeof import("../engine/daily")>();
  return {
    ...real,
    dailyText: (day: string) => {
      const full = real.dailyText(day);
      return cut.on ? { ...full, text: full.text.slice(0, 40) } : full;
    },
  };
});

const DAY = "2026-10-08";
const TEXT = dailyText(DAY).text;
const L = TEXT.length;
const STEP_MS = 200;

let clock = 0;
const fetchMock = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** The whole day's text, one key every STEP_MS, from clock 0. */
function typeDaily(text = TEXT) {
  let i = 0;
  for (const ch of text) {
    clock = i++ * STEP_MS;
    typeInto(getInput(), getInput().value + ch);
  }
}

function openDaily() {
  fireEvent.click(screen.getByRole("button", { name: "Daily" }));
}

function posts() {
  return fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "POST",
  );
}

beforeEach(() => {
  cut.on = true;
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  window.localStorage.clear();
  window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: "quote" }));
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? json({
          ok: true,
          boards: [{ period: "daily", board: DAY, rank: 3, best: 1, improved: true }],
        })
      : json({ game: "typing-speed", board: `daily:${DAY}`, entries: [], you: null }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  restoreViewport();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
  document.documentElement.classList.remove("typing-lock");
});

describe("the Daily view", () => {
  it("shows today's text, the same for two sessions, and reads the board only then", async () => {
    cut.on = false;
    const full = dailyText(DAY).text;
    expect(full.length).toBeGreaterThanOrEqual(180);
    const first = render(<TypingSpeedGame />);
    expect(fetchMock).not.toHaveBeenCalled(); // nothing is read on load
    openDaily();
    const text = screen.getByTestId("ts-target").querySelector("[data-ts-visual]")?.textContent;
    expect(text).toBe(full);
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("game=typing-speed");
    first.unmount();

    render(<TypingSpeedGame />);
    openDaily();
    expect(screen.getByTestId("ts-target").querySelector("[data-ts-visual]")?.textContent).toBe(
      full,
    );
  });

  it("names the source with a Project Gutenberg link and has no Skip or Next", () => {
    render(<TypingSpeedGame />);
    openDaily();
    const panel = screen.getByTestId("ts-daily-panel");
    const link = within(panel).getByRole("link", { name: "Project Gutenberg" });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/www\.gutenberg\.org\/ebooks\/\d+$/);
    expect(link).toHaveAttribute("rel", "noopener");
    expect(screen.queryByRole("button", { name: /skip/i })).toBeNull();
    expect(within(panel).getByText(`${DAY} UTC`)).toBeInTheDocument();
  });

  it("a finished attempt is recorded, starts the streak and offers a hand-posted Post", async () => {
    render(<TypingSpeedGame />);
    openDaily();
    typeDaily();
    const ms = (L - 1) * STEP_MS;
    const wpm = dailyScore(L, ms);
    const saved = JSON.parse(window.localStorage.getItem(DAILY_KEY) as string);
    expect(saved).toMatchObject({
      v: 1,
      day: DAY,
      attempts: 1,
      best: { wpm, ms, chars: L, acc: 100 },
      posted: null,
    });
    expect(JSON.parse(window.localStorage.getItem(STATS_KEY) as string).daily).toMatchObject({
      streak: 1,
      lastDay: DAY,
    });
    expect(screen.getByText("1-day streak")).toBeInTheDocument();
    expect(posts()).toHaveLength(0); // never posted automatically

    fireEvent.change(screen.getByLabelText("Name for the board"), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await act(async () => {});
    expect(posts()).toHaveLength(1);
    const [url, init] = posts()[0] as [string, RequestInit];
    expect(url).toBe("/api/arcade/scores");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ game: "typing-speed", handle: "Ada", score: wpm });
    expect(body.detail).toEqual({ day: 20261008, ms, chars: L, acc: 100 });
    expect(screen.getByRole("button", { name: "Posted" })).toBeDisabled();
    expect(JSON.parse(window.localStorage.getItem(DAILY_KEY) as string)).toMatchObject({
      handle: "Ada",
      posted: wpm,
    });
  });

  it("attempts are unlimited: Try again keeps the better one", () => {
    render(<TypingSpeedGame />);
    openDaily();
    typeDaily();
    const first = JSON.parse(window.localStorage.getItem(DAILY_KEY) as string).best.wpm;
    fireEvent.click(screen.getByRole("button", { name: "Again" }));
    // A slower second attempt counts but does not replace the best.
    let i = 0;
    for (const ch of TEXT) {
      clock = i++ * STEP_MS * 2;
      typeInto(getInput(), getInput().value + ch);
    }
    const rec = JSON.parse(window.localStorage.getItem(DAILY_KEY) as string);
    expect(rec.attempts).toBe(2);
    expect(rec.best.wpm).toBe(first);
  });

  it("a bulk attempt shows the block line and can never be posted", () => {
    render(<TypingSpeedGame />);
    openDaily();
    const input = getInput();
    clock = 0;
    typeInto(input, S + TEXT.slice(0, 4));
    // Several letters in one input event are what a keyboard suggestion does.
    let i = 1;
    for (const ch of TEXT.slice(4)) {
      clock = i++ * STEP_MS;
      typeInto(getInput(), getInput().value + ch);
    }
    expect(
      screen.getByText("Keyboard suggestions were used, so this attempt cannot be posted."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();
    const rec = JSON.parse(window.localStorage.getItem(DAILY_KEY) as string);
    expect(rec.attempts).toBe(1);
    expect(rec.best).toBeNull();
  });

  it("shows a closed message instead of posting once the UTC day has turned over", async () => {
    render(<TypingSpeedGame />);
    openDaily();
    typeDaily();
    act(() => vi.setSystemTime(new Date("2026-10-09T00:00:00Z")));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));
    await act(async () => {});
    expect(posts()).toHaveLength(0);
    expect(screen.getByText(/closed at 00:00 UTC/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Post" })).toBeNull();

    // The new text is one click away, and it is the new day's.
    fireEvent.click(screen.getByRole("button", { name: "Play the new text" }));
    expect(screen.getByTestId("ts-target").querySelector("[data-ts-visual]")?.textContent).toBe(
      dailyText("2026-10-09").text,
    );
    expect(screen.getByText("2026-10-09 UTC")).toBeInTheDocument();
  });

  it("never becomes the mode the page opens in", () => {
    render(<TypingSpeedGame />);
    openDaily();
    typeDaily();
    expect(JSON.parse(window.localStorage.getItem(STATS_KEY) as string).lastMode).toBe("quote");
    cleanup();
    render(<TypingSpeedGame />);
    expect(screen.getByRole("button", { name: "Quote" })).toHaveAttribute("aria-pressed", "true");
  });

  it("works in the phone sheet: Start opens it on the daily text and finishing closes it", () => {
    stubViewportClass(true);
    fakeVV(844);
    render(<TypingSpeedGame />);
    openDaily();
    fireEvent.click(screen.getByRole("button", { name: /start typing/i }));
    const sheet = screen.getByTestId("ts-sheet");
    expect(within(sheet).getByTestId("ts-target").textContent).toContain(TEXT.slice(0, 20));
    typeDaily();
    expect(screen.queryByTestId("ts-sheet")).toBeNull();
    expect(screen.getByRole("button", { name: "Post" })).toBeInTheDocument();
    expect(document.documentElement).not.toHaveClass("typing-lock");
  });
});
