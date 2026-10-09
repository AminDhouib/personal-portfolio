import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { GHOSTS_KEY, type GhostStore } from "../ghost-store";
import { STATS_KEY, emptyStats } from "../stats";
import { getInput, typeInto } from "./phone-helpers";

const TEXT = "ab cd ef gh ij kl mn";
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("the results overlay", () => {
  it("compares with the ghost raced and says a new ghost was saved", () => {
    seed({ quote: { wpm: 100, samples: FAST } });
    render(<TypingSpeedGame />);
    playAll(100);
    const net = Number(screen.getByTestId("ts-net-wpm").textContent);
    expect(net).toBeGreaterThan(100);
    expect(screen.getByTestId("ts-vs-ghost")).toHaveTextContent(`vs your best: +${net - 100} WPM`);
    expect(screen.getByTestId("ts-ghost-saved")).toHaveTextContent("New ghost saved");
    const line = document.querySelector('[data-line="ghost"]');
    expect(line).not.toBeNull();
    expect(line).toHaveAttribute("stroke-dasharray");
  });

  it("says how far behind, and saves nothing, after a slower run", () => {
    seed({ quote: { wpm: 300, samples: [0, 100] } });
    render(<TypingSpeedGame />);
    playAll(500);
    const net = Number(screen.getByTestId("ts-net-wpm").textContent);
    expect(screen.getByTestId("ts-vs-ghost")).toHaveTextContent(`vs your best: -${300 - net} WPM`);
    expect(screen.queryByTestId("ts-ghost-saved")).toBeNull();
    expect(document.querySelector('[data-line="ghost"]')).not.toBeNull();
  });

  it("shows no comparison on a first run, only that a ghost was saved", () => {
    window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: "quote" }));
    render(<TypingSpeedGame />);
    playAll(100);
    expect(screen.queryByTestId("ts-vs-ghost")).toBeNull();
    expect(screen.getByTestId("ts-ghost-saved")).toBeInTheDocument();
    expect(document.querySelector('[data-line="ghost"]')).toBeNull();
  });

  it("leaves the whole overlay out with the toggle off", () => {
    seed({ quote: { wpm: 100, samples: FAST } }, { ghost: false });
    render(<TypingSpeedGame />);
    playAll(100);
    expect(screen.queryByTestId("ts-vs-ghost")).toBeNull();
    expect(document.querySelector('[data-line="ghost"]')).toBeNull();
    expect(screen.queryByTestId("ts-ghost-saved")).toBeNull();
    // The ghost is still kept, so switching the toggle back on has something to race.
    const stored = JSON.parse(window.localStorage.getItem(GHOSTS_KEY) as string);
    expect(stored.ghosts.quote.wpm).toBeGreaterThan(100);
  });
});

describe("what reaches storage", () => {
  const FASTER = { wpm: 300, samples: [0, 100] };

  it("compares against the stored ghost, not the one read at mount, and keeps other modes", () => {
    seed({ quote: { wpm: 10, samples: SLOW } });
    render(<TypingSpeedGame />);
    // Another tab saves a better quote ghost and a words-30 one after this page loaded.
    window.localStorage.setItem(
      GHOSTS_KEY,
      JSON.stringify({ v: 1, ghosts: { quote: FASTER, "words-30": { wpm: 55, samples: [0, 9] } } }),
    );
    playAll(100); // 126 WPM: beats the stale 10, loses to the stored 300
    const stored = JSON.parse(window.localStorage.getItem(GHOSTS_KEY) as string);
    expect(stored.ghosts.quote).toEqual(FASTER);
    expect(stored.ghosts["words-30"].wpm).toBe(55);
    expect(screen.queryByTestId("ts-ghost-saved")).toBeNull();
  });

  it("does not claim a save when the write fails", () => {
    seed({ quote: { wpm: 10, samples: SLOW } });
    render(<TypingSpeedGame />);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k, v) {
      if (k === GHOSTS_KEY) throw new DOMException("full", "QuotaExceededError");
      real.call(this, k, v);
    });
    playAll(100);
    expect(screen.getByTestId("ts-net-wpm")).toBeInTheDocument();
    expect(screen.queryByTestId("ts-ghost-saved")).toBeNull();
  });

  it("does not claim a save when a newer version owns the key", () => {
    seed({ quote: { wpm: 10, samples: SLOW } });
    render(<TypingSpeedGame />);
    const newer = JSON.stringify({ v: 2, ghosts: { quote: FASTER } });
    window.localStorage.setItem(GHOSTS_KEY, newer);
    playAll(100);
    expect(window.localStorage.getItem(GHOSTS_KEY)).toBe(newer);
    expect(screen.queryByTestId("ts-ghost-saved")).toBeNull();
  });
});
