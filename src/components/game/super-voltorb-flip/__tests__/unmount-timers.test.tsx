import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

// T-6453. The round-end flow is a chain of timers (the board reveal, the card flip-down, the
// risk-warning release, the payout drain). Left armed past unmount they ran after the test
// environment was torn down and threw "window is not defined" from react-dom, which fails a whole
// vitest run even though every test passed. Same class as the Typing Speed burst timer (T-6088).

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));

vi.mock("../audio", () => ({
  sfx: new Proxy({}, { get: () => () => Promise.resolve() }),
  playMusic: () => {},
  stopMusic: () => {},
  fadeOutMusic: () => {},
  playGameOver: () => {},
  stopGameOver: () => {},
  playLevelWin: () => {},
  stopLevelWin: () => {},
  stopAllCues: () => {},
  setMusicMuted: () => {},
}));

vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";
import { LEVEL_WIN_MS } from "../sound-cues";
import { firstButton } from "@/test/first-button";
import { CPU_BOUND_TEST_TIMEOUT_MS } from "@/test/heavy";

// These tests render the whole Super Voltorb Flip board in jsdom; see src/test/heavy.ts for why the
// 5 s default is not enough.
vi.setConfig({ testTimeout: CPU_BOUND_TEST_TIMEOUT_MS });

const BANNER = "You quit with no coins.";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

/** Quit the round at once: no coins, so the flow goes straight to the board reveal. */
async function quitRound(): Promise<void> {
  fireEvent.click(screen.getByRole("button", { name: "Quit" }));
  const dialog = screen.getByRole("alertdialog", { name: "Quit this round?" });
  fireEvent.click(
    Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Quit")!,
  );
  await advance(0);
}

describe("Super Voltorb Flip leaves no timer running after unmount", () => {
  it("cancels the board-reveal timer when unmounted during the flip up", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(<SuperVoltorbFlipGame />);
    await quitRound();
    // The reveal has started: its 1000 ms timer is armed, the banner is not up yet.
    expect(screen.queryByText(BANNER)).toBeNull();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
    await advance(10_000);
    expect(errors).not.toHaveBeenCalled();
  });

  it("cancels the flip-down timers when unmounted mid fold", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const view = render(<SuperVoltorbFlipGame />);
    await quitRound();
    await advance(1500);
    expect(screen.getByText(BANNER)).toBeTruthy();

    // Continue: the cards fold down in five staggered columns, then the next board is dealt.
    fireEvent.keyDown(document, { key: "Enter" });
    await advance(100 + 250);
    expect(screen.queryByText(BANNER)).toBeNull();
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
    await advance(10_000);
    expect(errors).not.toHaveBeenCalled();
  });

  // The debug panel's "Win current level" ends the round as a win with coins on the board, which is
  // the shortest road into the payout drain and, past the reveal, the level flash. Muted, so the
  // clear wait is the silent LEVEL_WIN_MS timer rather than the (mocked, never-ending) fanfare.
  function winCurrentLevel(): void {
    window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 3, totalScore: 0 }));
    window.localStorage.setItem("svf:muted", "1");
    render(<SuperVoltorbFlipGame />);
    const mute = firstButton(/^(Mute|Unmute)$/);
    for (let i = 0; i < 10; i++) fireEvent.click(mute);
    fireEvent.click(screen.getByRole("button", { name: "Open debug panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Win current level" }));
  }

  it("cancels the payout drain's timers when unmounted mid drain", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    winCurrentLevel();
    // Past the clear wait and the 320 ms read pause: the drain is ticking every 17 ms.
    await advance(LEVEL_WIN_MS + 400);
    const view = { unmount: () => cleanup() };
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    view.unmount();

    expect(vi.getTimerCount()).toBe(0);
    await advance(10_000);
    expect(errors).not.toHaveBeenCalled();
  });

  it("cancels the level flash timer when unmounted while the flash is showing", async () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    winCurrentLevel();
    // Run the clear wait, the payout and the reveal until the result banner is up.
    for (let i = 0; i < 100 && !screen.queryByText(/Moved up to Level/); i++) await advance(100);
    expect(screen.getByText(/Moved up to Level/)).toBeTruthy();

    // Continue: the cards fold down and the level flash starts with the first column (100 ms in).
    fireEvent.keyDown(document, { key: "Enter" });
    await advance(100 + 50);
    expect(screen.queryByText(/Moved up to Level/)).toBeNull();
    // 1200 ms flash timer and the fold's last step are both still pending.
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    cleanup();

    expect(vi.getTimerCount()).toBe(0);
    await advance(10_000);
    expect(errors).not.toHaveBeenCalled();
  });
});
