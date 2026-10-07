import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

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

const BANNER = "You quit with no coins.";

let stray: HTMLElement | null = null;

afterEach(() => {
  stray?.remove();
  stray = null;
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("round-end wait", () => {
  it("ignores keys typed in a text field and still continues on a board key", async () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(screen.getByRole("button", { name: "Quit" }));
    const dialog = screen.getByRole("alertdialog", { name: "Quit this round?" });
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find((b) => b.textContent === "Quit")!,
    );
    await advance(1500);
    expect(screen.getByText(BANNER)).toBeTruthy();

    // Someone typing in another field on the page (the AI chat) must not
    // dismiss the banner.
    stray = document.createElement("input");
    document.body.appendChild(stray);
    fireEvent.keyDown(stray, { key: "a" });
    fireEvent.keyDown(stray, { key: "Enter" });
    await advance(0);
    expect(screen.getByText(BANNER)).toBeTruthy();

    // Same for a textarea.
    stray.remove();
    stray = document.createElement("textarea");
    document.body.appendChild(stray);
    fireEvent.keyDown(stray, { key: "b" });
    await advance(0);
    expect(screen.getByText(BANNER)).toBeTruthy();

    // A key that is not in a field still continues it.
    fireEvent.keyDown(document.body, { key: "Enter" });
    await advance(0);
    expect(screen.queryByText(BANNER)).toBeNull();
  });
});
