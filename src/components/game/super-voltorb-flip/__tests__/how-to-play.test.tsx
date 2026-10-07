import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));

// Same audio silencing as board-leak-guard.test.tsx: jsdom cannot play media.
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

// As in quit-flow.test.tsx: render children straight through so the board
// does not remount when the async theme import lands.
vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("SuperVoltorbFlip how to play", () => {
  it("lists the level rules and Quit", () => {
    render(<SuperVoltorbFlipGame />);
    // The phone and desktop layouts each render the button.
    const [openButton] = screen.getAllByRole("button", { name: "How to play" });
    if (!openButton) throw new Error("no How to play button");
    fireEvent.click(openButton);
    const modal = screen.getByRole("dialog", { name: "How to play" });
    expect(within(modal).getByText(/^There are 8 Levels\./)).toBeTruthy();
    expect(within(modal).getByText(/Press Quit to stop and keep your Coins/)).toBeTruthy();
  });
});
