import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, within } from "@testing-library/react";

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

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

// The phone and desktop columns both render a MemoBar (one is CSS-hidden), so
// controls appear twice in the DOM; always take the first.
const first = (name: string | RegExp) => screen.getAllByRole("button", { name })[0]!;
const tile = (row: number, col: number) =>
  screen.getAllByRole("button").find((b) => b.getAttribute("data-cell") === `${row}-${col}`)!;

describe("memo undo wiring", () => {
  it("undoes the last memo change from the button", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Memo 2"));
    fireEvent.click(tile(0, 0));
    expect(tile(0, 0).getAttribute("aria-label")).toContain("memo 2");
    fireEvent.click(first("Undo last memo"));
    expect(tile(0, 0).getAttribute("aria-label")).not.toContain("memo");
  });

  it("undoes with Ctrl+Z from a tile, but never from a text field", () => {
    render(
      <>
        <input aria-label="chat" />
        <SuperVoltorbFlipGame />
      </>,
    );
    fireEvent.click(first("Memo 3"));
    fireEvent.click(tile(1, 1));
    expect(tile(1, 1).getAttribute("aria-label")).toContain("memo 3");
    // A key typed in an unrelated field is outside .svf-root and never reaches it.
    fireEvent.keyDown(screen.getByLabelText("chat"), { key: "z", ctrlKey: true });
    expect(tile(1, 1).getAttribute("aria-label")).toContain("memo 3");
    fireEvent.keyDown(tile(1, 1), { key: "z", ctrlKey: true });
    expect(tile(1, 1).getAttribute("aria-label")).not.toContain("memo");
  });

  it("undoes a memo made by key, newest first", () => {
    render(<SuperVoltorbFlipGame />);
    const a = tile(0, 0);
    a.focus();
    fireEvent.keyDown(a, { key: "1" });
    fireEvent.keyDown(a, { key: "2" });
    expect(a.getAttribute("aria-label")).toContain("memo 1, 2");
    fireEvent.keyDown(a, { key: "z", ctrlKey: true });
    expect(a.getAttribute("aria-label")).toContain("memo 1");
    expect(a.getAttribute("aria-label")).not.toContain("memo 1, 2");
  });

  it("offers neither the button nor the key when the setting is off", () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":false,"stats":true,"assist":false}',
    );
    render(<SuperVoltorbFlipGame />);
    expect(screen.queryByRole("button", { name: "Undo last memo" })).toBeNull();
    fireEvent.click(first("Memo 2"));
    fireEvent.click(tile(0, 0));
    fireEvent.keyDown(tile(0, 0), { key: "z", ctrlKey: true });
    expect(tile(0, 0).getAttribute("aria-label")).toContain("memo 2");
  });
});

describe("settings and statistics entries", () => {
  it("opens Settings, flips a switch and stores it", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /memo undo/i }));
    expect(window.localStorage.getItem("svf:settings")).toBe(
      '{"v":1,"memoUndo":false,"stats":true,"assist":false}',
    );
  });

  it("hides the Statistics entry when statistics are off", () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":true,"stats":false,"assist":false}',
    );
    render(<SuperVoltorbFlipGame />);
    expect(screen.queryByRole("button", { name: "Statistics" })).toBeNull();
  });

  it("never rewrites svf:progress or svf:muted because of a setting", () => {
    window.localStorage.setItem("svf:muted", "1");
    render(<SuperVoltorbFlipGame />);
    const progress = window.localStorage.getItem("svf:progress");
    fireEvent.click(first("Settings"));
    fireEvent.click(screen.getByRole("switch", { name: /odds assist/i }));
    expect(window.localStorage.getItem("svf:progress")).toBe(progress);
    expect(window.localStorage.getItem("svf:muted")).toBe("1");
  });

  it("restores the saved level into the round's statistics", () => {
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 3, totalScore: 40 }),
    );
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Quit"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
    const stats = JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}");
    expect(stats.highestLevel).toBe(3);
  });
});

describe("statistics recording", () => {
  it("records a quit round", () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Quit"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
    const stats = JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}");
    expect(stats.rounds).toEqual({ played: 1, won: 0, lost: 0, quit: 1 });
  });

  it("records nothing while statistics are off", () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":true,"stats":false,"assist":false}',
    );
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(first("Quit"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
    expect(window.localStorage.getItem("svf:stats")).toBeNull();
  });
});
