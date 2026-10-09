import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { ghostPosition } from "../engine/ghost";
import { SENTINEL as S } from "../engine/input";
import { GHOSTS_KEY, type GhostStore } from "../ghost-store";
import { STATS_KEY, emptyStats } from "../stats";
import { fakeVV, getInput, restoreViewport, stubViewportClass, typeInto } from "./phone-helpers";

const TEXT = "ab cd ef gh ij kl mn";
const WORDS = TEXT.split(" ");
const DAY = "2026-10-08";

vi.mock("../engine/text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/text")>()),
  passageAt: () => ({ id: "t-1", source: "austen-pp", text: "ab cd ef gh ij kl mn" }),
}));

let clock = 0;

/** A ghost at four characters a second (10 s of samples), or at a crawl. */
const FAST = Array.from({ length: 41 }, (_, i) => i);
const SLOW = [0, 1];

function seed(ghosts: GhostStore["ghosts"], prefs = emptyStats().prefs) {
  window.localStorage.setItem(GHOSTS_KEY, JSON.stringify({ v: 1, ghosts }));
  window.localStorage.setItem(
    STATS_KEY,
    JSON.stringify({ ...emptyStats(), lastMode: "quote", prefs }),
  );
}

function key(ch: string, at: number) {
  clock = at;
  typeInto(getInput(), getInput().value + ch);
}

/** Types the whole text, one key every `gap` ms from clock 0. */
function playAll(gap: number) {
  [...TEXT].forEach((ch, i) => key(ch, i * gap));
}

function ghostEl() {
  return screen.queryByTestId("ts-ghost");
}

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  window.localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({ game: "typing-speed", board: "daily", entries: [], you: null }),
        ),
    ),
  );
});

afterEach(() => {
  cleanup();
  restoreViewport();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("the ghost caret and pace chip", () => {
  it("sits where your best run stood 2000 ms in, and the chip says how far behind", () => {
    seed({ quote: { wpm: 48, samples: FAST } });
    render(<TypingSpeedGame />);
    expect(ghostEl()).toBeNull(); // not before the run starts
    key("a", 0);
    key("b", 2000);
    // 2000 ms at four characters a second is 8 net characters: the space after "ef".
    expect(ghostPosition(WORDS, 8)).toEqual({ word: 2, letter: 2 });
    const ghost = screen.getByTestId("ts-ghost");
    expect(ghost).toHaveAttribute("aria-hidden", "true");
    expect(ghost.closest("[data-ts-word]")).toHaveAttribute("data-ts-word", "2");
    expect(ghost.textContent).toBe(" ");
    expect(screen.getByTestId("ts-ghost-chip")).toHaveTextContent("-6 behind");
    expect(screen.getAllByTestId("ts-ghost")).toHaveLength(1);
  });

  it("puts the ghost on a letter inside a word and reads ahead when you lead", () => {
    seed({ quote: { wpm: 6, samples: SLOW } });
    render(<TypingSpeedGame />);
    key("a", 0);
    key("b", 2000);
    // The slow ghost holds at 1 character: on the "b" of the first word.
    const ghost = screen.getByTestId("ts-ghost");
    expect(ghost.closest("[data-ts-word]")).toHaveAttribute("data-ts-word", "0");
    expect(ghost.textContent).toBe("b");
    expect(screen.getByTestId("ts-ghost-chip")).toHaveTextContent("+1 ahead");
  });

  it("announces the pace through a polite live region at most once per 5 s", () => {
    seed({ quote: { wpm: 48, samples: FAST } });
    render(<TypingSpeedGame />);
    const live = () => screen.getByTestId("ts-ghost-live");
    key("a", 0);
    expect(live()).toHaveAttribute("aria-live", "polite");
    expect(live()).toHaveTextContent("Ghost: +1 ahead");
    key("b", 1000); // the pill follows, the announcement waits
    expect(screen.getByTestId("ts-ghost-chip")).toHaveTextContent("-2 behind");
    expect(live()).toHaveTextContent("Ghost: +1 ahead");
    key(" ", 4900);
    expect(live()).toHaveTextContent("Ghost: +1 ahead");
    key("c", 5000);
    expect(live()).toHaveTextContent(/^Ghost: -\d+ behind$/);
  });

  it("renders nothing without a stored ghost", () => {
    window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: "quote" }));
    render(<TypingSpeedGame />);
    key("a", 0);
    key("b", 2000);
    expect(ghostEl()).toBeNull();
    expect(screen.queryByTestId("ts-ghost-chip")).toBeNull();
    expect(screen.queryByTestId("ts-ghost-live")).toBeNull();
  });

  it("renders nothing for a ghost of another mode", () => {
    seed({ "words-30": { wpm: 48, samples: FAST } });
    render(<TypingSpeedGame />);
    key("a", 0);
    expect(ghostEl()).toBeNull();
  });

  it("renders nothing with the toggle off in the saved prefs", () => {
    seed({ quote: { wpm: 48, samples: FAST } }, { ghost: false });
    render(<TypingSpeedGame />);
    key("a", 0);
    key("b", 2000);
    expect(ghostEl()).toBeNull();
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveAttribute("aria-pressed", "false");
  });

  it("races a daily ghost from today and drops one from yesterday", () => {
    seed({ daily: { wpm: 48, samples: FAST, day: DAY } });
    render(<TypingSpeedGame />);
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    key("T", 0);
    key("h", 1000);
    expect(screen.getByTestId("ts-ghost")).toBeInTheDocument();
    cleanup();

    seed({ daily: { wpm: 48, samples: FAST, day: "2026-10-07" } });
    render(<TypingSpeedGame />);
    fireEvent.click(screen.getByRole("button", { name: "Daily" }));
    key("T", 0);
    key("h", 1000);
    expect(ghostEl()).toBeNull();
  });
});

describe("in the phone sheet", () => {
  it("puts the pace chip in the HUD row and keeps the ghost on the text", () => {
    stubViewportClass(true);
    fakeVV(844);
    seed({ quote: { wpm: 48, samples: FAST } });
    render(<TypingSpeedGame />);
    fireEvent.click(screen.getByRole("button", { name: /start typing/i }));
    key("a", 0);
    key("b", 2000);
    const sheet = screen.getByTestId("ts-sheet");
    const hud = within(sheet).getByTestId("ts-hud");
    expect(within(hud).getByTestId("ts-ghost-chip")).toHaveTextContent("-6 behind");
    expect(within(sheet).getAllByTestId("ts-ghost-chip")).toHaveLength(1);
    expect(within(sheet).getByTestId("ts-ghost")).toBeInTheDocument();
  });
});

describe("the ghost toggle", () => {
  it("is a 44 px button in the mode bar row, on by default", () => {
    render(<TypingSpeedGame />);
    const toggle = screen.getByRole("button", { name: "Ghost" });
    expect(toggle).toHaveClass("min-h-11", "min-w-11");
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("group", { name: "Mode" })).toContainElement(toggle);
  });

  it("hides the ghost at once and keeps the choice in typing:stats.prefs", () => {
    seed({ quote: { wpm: 48, samples: FAST } });
    render(<TypingSpeedGame />);
    key("a", 0);
    key("b", 2000);
    expect(screen.getByTestId("ts-ghost")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ghost" }));
    expect(ghostEl()).toBeNull();
    expect(screen.queryByTestId("ts-ghost-chip")).toBeNull();
    const saved = JSON.parse(window.localStorage.getItem(STATS_KEY) as string);
    expect(saved.prefs).toEqual({ ghost: false });
    expect(saved.lastMode).toBe("quote");
    cleanup();
    render(<TypingSpeedGame />);
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("recording the ghost", () => {
  function setItemCalls() {
    return vi.spyOn(Storage.prototype, "setItem");
  }
  const ghostWrites = (spy: ReturnType<typeof setItemCalls>) =>
    spy.mock.calls.filter(([k]) => k === GHOSTS_KEY);

  it("replaces the ghost once when a faster run finishes", () => {
    seed({ quote: { wpm: 10, samples: SLOW } });
    render(<TypingSpeedGame />);
    const spy = setItemCalls();
    playAll(100); // 20 characters in 1.9 s
    const stored = JSON.parse(window.localStorage.getItem(GHOSTS_KEY) as string);
    expect(stored.ghosts.quote.wpm).toBeGreaterThan(100);
    expect(stored.ghosts.quote.samples.length).toBe(9);
    expect(ghostWrites(spy)).toHaveLength(1);
  });

  it("keeps a faster stored ghost and does not write when a slower run finishes", () => {
    seed({ quote: { wpm: 300, samples: [0, 100] } });
    render(<TypingSpeedGame />);
    const spy = setItemCalls();
    playAll(500);
    const stored = JSON.parse(window.localStorage.getItem(GHOSTS_KEY) as string);
    expect(stored.ghosts.quote).toEqual({ wpm: 300, samples: [0, 100] });
    expect(ghostWrites(spy)).toHaveLength(0);
  });

  it("never turns a run typed with suggestions into a ghost", () => {
    window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: "quote" }));
    render(<TypingSpeedGame />);
    clock = 0;
    typeInto(getInput(), S + "ab"); // two letters in one input event, as a suggestion does
    [..." cd ef gh ij kl mn"].forEach((ch, i) => key(ch, 100 + i * 100));
    expect(screen.getByTestId("ts-net-wpm")).toBeInTheDocument();
    expect(window.localStorage.getItem(GHOSTS_KEY)).toBeNull();
  });
});
