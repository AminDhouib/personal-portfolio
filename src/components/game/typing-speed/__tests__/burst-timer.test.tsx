import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TypingSpeedGame } from "../../typing-speed";
import { STATS_KEY, emptyStats } from "../stats";
import { getInput, typeInto } from "./phone-helpers";

// T-6088: every 10th correct key in a row spawns a combo burst and a 700 ms timer that removes it.
// The timer used to be fire-and-forget, so a game unmounted inside that window (a test ending, a
// visitor leaving the page) left it armed. In CI it fired after jsdom was torn down and the run
// died on "window is not defined" from react-dom, one run in many, depending on timing.
vi.mock("../engine/text", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/text")>()),
  passageAt: () => ({ id: "t-1", source: "austen-pp", text: "abcdefghij klmnopqrst" }),
}));

const BURST_MS = 700;

let clock = 0;

function typeText(text: string) {
  let value = "";
  for (const ch of text) {
    value += ch;
    clock += 100;
    typeInto(getInput(), value);
  }
}

beforeEach(() => {
  clock = 0;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  // Only the timer pair is faked, so vi.getTimerCount() counts exactly the game's own timers.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  window.localStorage.clear();
  window.localStorage.setItem(STATS_KEY, JSON.stringify({ ...emptyStats(), lastMode: "quote" }));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("the combo burst timer", () => {
  it("is armed by a 10-key streak and settles on its own after 700 ms", () => {
    render(<TypingSpeedGame />);
    typeText("abcdefghij");
    expect(vi.getTimerCount()).toBe(1);

    act(() => {
      vi.advanceTimersByTime(BURST_MS);
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("is cancelled when the game unmounts inside the window, so nothing fires afterwards", () => {
    const view = render(<TypingSpeedGame />);
    typeText("abcdefghij");
    expect(vi.getTimerCount()).toBe(1);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels every pending burst, not only the last", () => {
    const view = render(<TypingSpeedGame />);
    typeText("abcdefghij klmnopqrst"); // streaks of 10 and 20 inside one window
    expect(vi.getTimerCount()).toBe(2);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
