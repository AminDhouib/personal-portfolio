import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, within, act } from "@testing-library/react";

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
  setMusicMuted: () => {},
}));

// The real provider swaps its wrapper when the async theme import lands, which
// remounts the board mid-test. Render children straight through instead.
vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("SuperVoltorbFlip quit flow", () => {
  it("cancel keeps the round live; confirming quits and shows the banner after the reveal", async () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);

    fireEvent.click(screen.getByRole("button", { name: "Quit" }));
    const dialog = screen.getByRole("alertdialog", { name: "Quit this round?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Keep playing" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText(/You quit/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Quit" }));
    const confirm = screen.getByRole("alertdialog", { name: "Quit this round?" });
    fireEvent.click(within(confirm).getByRole("button", { name: "Quit" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(screen.getByText("You quit with no coins.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next round" })).toBeTruthy();
  });
});
