import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { SENTINEL as S } from "../engine/input";
import type { ModeId } from "../engine/modes";
import { STATS_KEY, emptyStats } from "../stats";

vi.mock("../engine/text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/text")>()),
  passageAt: () => ({ id: "t-1", source: "austen-pp", text: "ab cd" }),
}));

let clock = 0;
const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;

function getInput(): HTMLInputElement {
  return screen.getByLabelText("Typing area") as HTMLInputElement;
}

/** Sets the value the way a browser does (bypassing React) and fires an input event. */
function setValue(input: HTMLInputElement, value: string, inputType = "insertText") {
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new InputEvent("input", { inputType, bubbles: true }));
  });
}

function typeKey(ch: string, at: number) {
  clock = at;
  const input = getInput();
  setValue(input, input.value + ch);
}

function backspace(at: number) {
  clock = at;
  const input = getInput();
  setValue(input, input.value.slice(0, -1), "deleteContentBackward");
}

/** The mode the game opens in: it remembers the last one played. */
function seedMode(mode: ModeId) {
  window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: mode }));
}

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  window.localStorage.clear();
  seedMode("quote");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("Typing Speed on the engine", () => {
  it("shows the text unblurred at rest and every button is sans (audit bug 7)", () => {
    const { container } = render(<TypingSpeedGame />);
    const visual = screen.getByTestId("ts-target").querySelector("[data-ts-visual]");
    expect(visual?.textContent).toBe("ab cd");
    expect(container.querySelector("[class*='backdrop-blur']")).toBeNull();
    for (const b of screen.getAllByRole("button")) expect(b).toHaveClass("font-sans");
  });

  it("an honest run: 5 characters over 480 ms is 125 WPM at 100% (audit bug 2)", () => {
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(screen.getByTestId("ts-net-wpm")).toHaveTextContent("125");
    expect(screen.getByTestId("ts-accuracy")).toHaveTextContent("100%");
    expect(screen.getByTestId("ts-mistakes")).toHaveTextContent("0 mistakes typed, 0 left");
  });

  it("a corrected slip still costs accuracy and is reported (audit bug 1)", () => {
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("x", 100);
    backspace(200);
    typeKey("b", 300);
    typeKey(" ", 400);
    typeKey("c", 500);
    typeKey("d", 600);
    expect(screen.getByTestId("ts-accuracy")).toHaveTextContent("83%");
    expect(screen.getByTestId("ts-mistakes")).toHaveTextContent("1 mistake typed, 0 left");
  });

  it("refuses paste, drop and pasted input (audit bug 6)", () => {
    render(<TypingSpeedGame />);
    const input = getInput();
    const before = new InputEvent("beforeinput", {
      inputType: "insertFromPaste",
      cancelable: true,
      bubbles: true,
    });
    input.dispatchEvent(before);
    expect(before.defaultPrevented).toBe(true);
    const paste = new Event("paste", { cancelable: true, bubbles: true });
    input.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    const drop = new Event("drop", { cancelable: true, bubbles: true });
    input.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);

    typeKey("a", 0);
    setValue(input, S + "a pasted text", "insertFromPaste");
    expect(input.value).toBe(S + "a");
    expect(document.querySelectorAll("[data-state='wrong'], [data-state='extra']")).toHaveLength(0);
  });

  it("rewrites the input only when it differs from the engine view", () => {
    render(<TypingSpeedGame />);
    const input = getInput();
    const writes: string[] = [];
    Object.defineProperty(input, "value", {
      configurable: true,
      get: () =>
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.get!.call(input),
      set: (v: string) => {
        writes.push(v);
        valueSetter.call(input, v);
      },
    });
    typeKey("a", 0);
    expect(writes).toEqual([]);
    setValue(input, S + "a pasted", "insertFromPaste");
    expect(writes).toEqual([S + "a"]);
  });

  it("writes typing-high-score only for a non-bulk run that beats it", () => {
    window.localStorage.setItem("typing-high-score", "100");
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(window.localStorage.getItem("typing-high-score")).toBe("125");
  });

  function playQuoteWith(globalBest: number, modeBest: number) {
    window.localStorage.setItem("typing-high-score", String(globalBest));
    window.localStorage.setItem(
      STATS_KEY,
      JSON.stringify({
        ...emptyStats(),
        lastMode: "quote",
        bests: { quote: { wpm: modeBest, raw: modeBest, acc: 100, day: "2026-10-01" } },
      }),
    );
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
  }

  it("says New best when the run beats the mode best even if not the global best", () => {
    playQuoteWith(500, 1);
    expect(screen.getByText(/New best for Quote/)).toBeInTheDocument();
  });

  it("does not say New best when only the global best was beaten", () => {
    playQuoteWith(1, 500);
    expect(screen.queryByText(/New best/)).toBeNull();
  });

  it("keeps a higher stored best", () => {
    window.localStorage.setItem("typing-high-score", "200");
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(window.localStorage.getItem("typing-high-score")).toBe("200");
  });

  it("a run with a bulk insert never writes a best and shows the suggestions note", () => {
    window.localStorage.setItem("typing-high-score", "50");
    render(<TypingSpeedGame />);
    const input = getInput();
    clock = 0;
    setValue(input, S + "ab");
    typeKey(" ", 120);
    typeKey("c", 240);
    typeKey("d", 360);
    expect(window.localStorage.getItem("typing-high-score")).toBe("50");
    expect(screen.getByText(/keyboard suggestions/i)).toBeInTheDocument();
    expect(screen.queryByText(/New best/)).toBeNull();
  });

  it("any printable key with focus on the body starts the run and counts as the first key", () => {
    render(<TypingSpeedGame />);
    document.body.focus();
    clock = 0;
    fireEvent.keyDown(document.body, { key: "a" });
    expect(document.activeElement).toBe(getInput());
    expect(getInput().value).toBe(S + "a");
    typeKey("b", 120);
    typeKey(" ", 240);
    typeKey("c", 360);
    typeKey("d", 480);
    expect(screen.getByTestId("ts-net-wpm")).toHaveTextContent("125");
  });

  it("Enter focuses the input without typing; Escape restarts a running round", () => {
    render(<TypingSpeedGame />);
    document.body.focus();
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(document.activeElement).toBe(getInput());
    expect(getInput().value).toBe(S);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(0);

    typeKey("a", 0);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(1);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(getInput().value).toBe(S);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(0);
  });

  it("a keydown whose target is not an Element does not throw", () => {
    render(<TypingSpeedGame />);
    expect(() => fireEvent.keyDown(window, { key: "Enter" })).not.toThrow();
    expect(() => fireEvent.keyDown(document, { key: "x" })).not.toThrow();
  });
});

describe("Typing Speed modes", () => {
  it("opens in the remembered mode", () => {
    seedMode("quotes-60");
    render(<TypingSpeedGame />);
    const bar = screen.getByRole("group", { name: "Mode" });
    expect(within(bar).getByRole("button", { name: "Quotes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(bar).getByRole("button", { name: "60 seconds" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("ts-timer")).toHaveTextContent("60");
  });

  it("defaults to 30 s words and remembers a change", () => {
    window.localStorage.clear();
    render(<TypingSpeedGame />);
    expect(screen.getByRole("button", { name: "30 seconds" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "15 seconds" }));
    const stored = JSON.parse(window.localStorage.getItem(STATS_KEY) ?? "{}");
    expect(stored.lastMode).toBe("words-15");
  });

  it("changing the mode mid-run restarts the round", () => {
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "60 seconds" }));
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(0);
    expect(screen.getByTestId("ts-timer")).toHaveTextContent("60");
    expect(getInput().value).toBe(S);
  });

  it("a timed run counts down from its first key and ends at zero with the results card", () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    seedMode("words-30");
    render(<TypingSpeedGame />);
    expect(screen.getByTestId("ts-timer")).toHaveTextContent("30");
    typeKey("a", 0);
    expect(screen.getByTestId("ts-timer")).toHaveTextContent("30");
    clock = 1000;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId("ts-timer")).toHaveTextContent("29");
    clock = 30_000;
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId("ts-timer")).toHaveTextContent("0");
    expect(screen.getByTestId("ts-net-wpm")).toBeInTheDocument();
  });
});

/** Types the first 40 characters of the current run, one correct keystroke each. */
function typeAll(from = 0, step = 100): number {
  const text = screen.getByTestId("ts-target").querySelector(".sr-only")!.textContent!;
  let t = from;
  for (const c of text.slice(0, 40)) {
    typeKey(c, t);
    t += step;
  }
  return t;
}

function finishTimed(seconds: number) {
  clock = seconds * 1000;
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

describe("Typing Speed results and stats", () => {
  function playWords15() {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    seedMode("words-15");
    render(<TypingSpeedGame />);
    typeAll();
    finishTimed(15);
  }

  it("records a finished run once in typing:stats", () => {
    playWords15();
    const stored = JSON.parse(window.localStorage.getItem(STATS_KEY) ?? "{}");
    expect(stored.runs).toBe(1);
    expect(stored.bests["words-15"].wpm).toBeGreaterThan(0);
    expect(Object.keys(stored.keys).length).toBeGreaterThan(0);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(JSON.parse(window.localStorage.getItem(STATS_KEY) ?? "{}").runs).toBe(1);
  });

  it("shows the counts, the full graph and the key map on the card", () => {
    playWords15();
    expect(screen.getByTestId("ts-net-wpm")).toBeInTheDocument();
    expect(screen.getByTestId("ts-raw-wpm")).toBeInTheDocument();
    expect(screen.getByTestId("ts-counts")).toHaveTextContent(/correct.*incorrect.*extra.*missed/i);
    expect(document.querySelector("svg[role='img'][aria-label^='WPM over time']")).not.toBeNull();
    expect(document.querySelector("[data-key='e']")).not.toBeNull();
    expect(screen.getByRole("button", { name: "All runs" })).toBeInTheDocument();
  });

  it("says New best for the mode only when beating a stored best", () => {
    playWords15();
    expect(screen.queryByText(/New best for 15s words/)).toBeNull();
    cleanup();
    const stored = JSON.parse(window.localStorage.getItem(STATS_KEY) ?? "{}");
    stored.bests["words-15"].wpm = 1;
    window.localStorage.setItem(STATS_KEY, JSON.stringify(stored));
    clock = 0;
    render(<TypingSpeedGame />);
    typeAll();
    finishTimed(15);
    expect(screen.getByText(/New best for 15s words/)).toBeInTheDocument();
  });

  it("does not claim a best on a tie", () => {
    playWords15();
    cleanup();
    clock = 0;
    render(<TypingSpeedGame />);
    typeAll();
    finishTimed(15);
    expect(screen.queryByText(/New best for 15s words/)).toBeNull();
  });

  it("writes typing-high-score when any mode beats it", () => {
    playWords15();
    expect(Number(window.localStorage.getItem("typing-high-score"))).toBeGreaterThan(0);
  });

  it("Tab from the input focuses Restart, Enter restarts in the same mode, Escape restarts too", () => {
    seedMode("words-60");
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    fireEvent.keyDown(getInput(), { key: "Tab" });
    const restart = screen.getByRole("button", { name: "Restart" });
    expect(document.activeElement).toBe(restart);
    fireEvent.click(restart);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "60 seconds" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    typeKey("a", 0);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(0);
  });
});

describe("Typing Speed leaves other text fields alone", () => {
  it("Tab and Escape inside an unrelated textarea are not hijacked", () => {
    render(<TypingSpeedGame />);
    typeKey("a", 0);
    const chat = document.createElement("textarea");
    document.body.appendChild(chat);
    chat.focus();
    const tab = fireEvent.keyDown(chat, { key: "Tab" });
    const esc = fireEvent.keyDown(chat, { key: "Escape" });
    expect(tab).toBe(true);
    expect(esc).toBe(true);
    expect(document.activeElement).toBe(chat);
    expect(document.querySelectorAll("[data-state='correct']")).toHaveLength(1);
    chat.remove();
  });
});

describe("Typing Speed live graph slot", () => {
  it("reserves the sparkline height before the run starts", () => {
    render(<TypingSpeedGame />);
    expect(screen.getByTestId("ts-live-slot")).toHaveClass("h-10");
  });
});
