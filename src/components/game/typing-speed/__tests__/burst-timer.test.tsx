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
  passageAt: () => ({ id: "t-1", source: "austen-pp", text: "abcdefghijklmnopqrstuvwxyzabcd" }),
}));

const BURST_MS = 700;

let clock = 0;
// Ids of the timers the game armed with the burst delay, and the ids it has cancelled. framer-motion
// arms timers of its own, so the burst timers are told apart by their delay.
let burstTimers: unknown[] = [];
let cleared: unknown[] = [];

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
  burstTimers = [];
  cleared = [];
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const realSet = globalThis.setTimeout;
  const realClear = globalThis.clearTimeout;
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number) => {
    const id = realSet(fn, ms);
    if (ms === BURST_MS) burstTimers.push(id);
    return id;
  }) as unknown as typeof setTimeout);
  vi.spyOn(globalThis, "clearTimeout").mockImplementation(((id: unknown) => {
    cleared.push(id);
    realClear(id as never);
  }) as unknown as typeof clearTimeout);
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
  it("is armed by a 10-key streak, and the burst leaves on its own when the timer fires", () => {
    render(<TypingSpeedGame />);
    typeText("abcdefghij");
    expect(burstTimers).toHaveLength(1);

    // Firing it must not throw, and a fired timer needs no cancelling afterwards.
    act(() => {
      vi.advanceTimersByTime(BURST_MS);
    });
    cleanup();
    expect(cleared).not.toContain(burstTimers[0]);
  });

  it("is cancelled when the game unmounts inside the window", () => {
    const view = render(<TypingSpeedGame />);
    typeText("abcdefghij");
    expect(burstTimers).toHaveLength(1);
    expect(cleared).not.toContain(burstTimers[0]);

    view.unmount();

    expect(cleared).toContain(burstTimers[0]);
  });

  it("cancels every pending burst, not only the last", () => {
    const view = render(<TypingSpeedGame />);
    typeText("abcdefghijklmnopqrst"); // streaks of 10 and 20, the run still unfinished
    expect(burstTimers).toHaveLength(2);

    view.unmount();

    for (const id of burstTimers) expect(cleared).toContain(id);
  });
});
