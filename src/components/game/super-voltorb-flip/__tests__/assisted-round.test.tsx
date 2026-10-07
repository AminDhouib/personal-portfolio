import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, waitFor, within, act } from "@testing-library/react";

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

const ODDS_LABEL =
  /(\d+|under 1|over 99) percent Voltorb|no chance of a Voltorb|certainly a Voltorb/;
const ASSIST_ON = '{"v":1,"memoUndo":true,"stats":true,"assist":true}';
const NOTE = /Assisted: not in your record\./;

const first = (name: string | RegExp) => screen.getAllByRole("button", { name })[0]!;
const tiles = () => Array.from(document.querySelectorAll<HTMLElement>("[data-cell]"));
const oddsShown = () => tiles().some((t) => ODDS_LABEL.test(t.getAttribute("aria-label") ?? ""));
const quitRound = () => {
  fireEvent.click(first("Quit"));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
};
const savedStats = () => JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}");
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("an assisted round", () => {
  it("is recorded as played and assisted only", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await waitFor(() => expect(oddsShown()).toBe(true));
    quitRound();
    const stats = savedStats();
    expect(stats.rounds).toEqual({ played: 1, won: 0, lost: 0, quit: 0 });
    expect(stats.assistedRounds).toBe(1);
    expect(stats.coins).toEqual({ total: 0, best: 0 });
  });

  it("is not assisted when the assist was off for the whole round", () => {
    render(<SuperVoltorbFlipGame />);
    quitRound();
    const stats = savedStats();
    expect(stats.rounds.quit).toBe(1);
    expect(stats.assistedRounds).toBe(0);
  });

  it("stays assisted if the assist is switched off mid-round (sticky)", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await waitFor(() => expect(oddsShown()).toBe(true));
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /odds assist/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(oddsShown()).toBe(false);
    quitRound();
    expect(savedStats().assistedRounds).toBe(1);
  });

  it("is not made assisted by switching the assist on after the round has ended", async () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    quitRound();
    await advance(1200); // reveal done, banner up
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /odds assist/i }));
    expect(savedStats().rounds.quit).toBe(1);
    expect(savedStats().assistedRounds).toBe(0);
  });

  it("does not carry over to the next round once the assist is off", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await advance(50);
    quitRound();
    await advance(1200); // banner up
    // Switch the assist off while the banner is up, then play on.
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /odds assist/i }));
    fireEvent.keyDown(window, { key: "Escape" });
    await advance(300);
    fireEvent.click(screen.getByRole("button", { name: "Next round" }));
    await advance(2500); // flip-down, then the next board is dealt
    expect(oddsShown()).toBe(false);
    quitRound();
    const stats = savedStats();
    expect(stats.rounds).toEqual({ played: 2, won: 0, lost: 0, quit: 1 });
    expect(stats.assistedRounds).toBe(1);
  });

  it("says so on the banner", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await advance(50);
    quitRound();
    await advance(1200);
    expect(screen.getByText(NOTE)).toBeTruthy();
  });

  it("does not say so on the banner of a plain round", async () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    quitRound();
    await advance(1200);
    expect(screen.getByText(/You quit/)).toBeTruthy();
    expect(screen.queryByText(NOTE)).toBeNull();
  });
});
