import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));

const audio = vi.hoisted(() => ({ sfxCalls: [] as string[] }));

vi.mock("../audio", () => ({
  sfx: new Proxy(
    {},
    {
      get: (_target, name: string) => () => {
        audio.sfxCalls.push(name);
        return Promise.resolve();
      },
    },
  ),
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
import { RISK_WARNING_MS } from "../sound-cues";

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function tile(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function cursorCues(): number {
  return audio.sfxCalls.filter((n) => n === "cursorMove").length;
}

beforeEach(() => {
  vi.useFakeTimers();
  audio.sfxCalls.length = 0;
  vi.spyOn(Math, "random").mockImplementation(seededRandom(4));
  window.localStorage.setItem("svf:muted", "0");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("board keyboard play", () => {
  it("puts exactly one tile in the tab order (roving tabindex)", () => {
    render(<SuperVoltorbFlipGame />);
    const tiles = screen.getAllByRole("button", { name: /^Row \d, Col \d, face down/ });
    expect(tiles).toHaveLength(25);
    expect(tiles.filter((t) => t.tabIndex === 0)).toEqual([tile("Row 1, Col 1, face down")]);
  });

  it("names the board for assistive tech and describes the keys", () => {
    render(<SuperVoltorbFlipGame />);
    const board = screen.getByRole("group", { name: "Board, 5 by 5" });
    const hintId = board.getAttribute("aria-describedby");
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toContain("Arrow keys");
  });

  it("arrows move focus and the cursor, and play the cursor cue", () => {
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    const right = tile("Row 1, Col 2, face down");
    expect(document.activeElement).toBe(right);
    expect(right.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    expect(cursorCues()).toBe(1);

    fireEvent.keyDown(right, { key: "ArrowDown" });
    expect(document.activeElement).toBe(tile("Row 2, Col 2, face down"));
    expect(cursorCues()).toBe(2);
  });

  it("stays put, silently, at an edge", () => {
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(first);
    expect(cursorCues()).toBe(0);
  });

  it("makes no cursor sound when muted", () => {
    window.localStorage.setItem("svf:muted", "1");
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tile("Row 1, Col 2, face down"));
    expect(cursorCues()).toBe(0);
  });

  it("ignores arrows with a modifier held", () => {
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight", ctrlKey: true });
    expect(document.activeElement).toBe(first);
  });

  it("1, 2, 3 and V toggle that memo mark on the focused tile", () => {
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "2" });
    expect(screen.getByRole("button", { name: "Row 1, Col 1, face down, memo 2" })).toBeTruthy();
    fireEvent.keyDown(first, { key: "v" });
    expect(screen.getByRole("button", { name: "Row 1, Col 1, face down, memo 2, V" })).toBeTruthy();
    fireEvent.keyDown(first, { key: "2" });
    expect(screen.getByRole("button", { name: "Row 1, Col 1, face down, memo V" })).toBeTruthy();
    expect(audio.sfxCalls).toContain("memoToggle");
  });

  it("Enter flips the focused tile and announces it", async () => {
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
    // A risk warning, if this tile raises one, holds the flip for the fanfare.
    await advance(RISK_WARNING_MS + 600);
    expect(screen.getByRole("button", { name: /^Row 1, Col 1, revealed/ })).toBeTruthy();
    expect(screen.getByText(/^Row 1, Col 1: /)).toBeTruthy();
  });

  it("focusing a tile moves the cursor there", () => {
    render(<SuperVoltorbFlipGame />);
    const target = tile("Row 3, Col 4, face down");
    act(() => target.focus());
    expect(target.tabIndex).toBe(0);
    expect(tile("Row 1, Col 1, face down").tabIndex).toBe(-1);
  });
  it("memo keys do nothing on a flipped tile (they play the invalid cue)", async () => {
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
    await advance(RISK_WARNING_MS + 600);
    const flipped = screen.getByRole("button", { name: /^Row 1, Col 1, revealed/ });
    audio.sfxCalls.length = 0;
    fireEvent.keyDown(flipped, { key: "2" });
    expect(audio.sfxCalls).toContain("invalidTap");
    expect(audio.sfxCalls).not.toContain("memoToggle");
  });

  it("memo keys do nothing while a risk warning holds the board", async () => {
    // Seed 33 deals a board where flipping Row 1, Col 1 raises the risk warning
    // (found by search). The flip is held until the fanfare ends, so nothing is
    // announced yet; once the hold releases the flip lands.
    vi.spyOn(Math, "random").mockImplementation(seededRandom(33));
    render(<SuperVoltorbFlipGame />);
    const first = tile("Row 1, Col 1, face down");
    first.focus();
    fireEvent.keyDown(first, { key: "Enter" });
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");

    const other = tile("Row 5, Col 5, face down");
    audio.sfxCalls.length = 0;
    fireEvent.keyDown(other, { key: "2" });
    expect(audio.sfxCalls).not.toContain("memoToggle");
    expect(screen.queryByRole("button", { name: /memo 2/ })).toBeNull();

    await advance(RISK_WARNING_MS + 600);
    expect(status.textContent).toMatch(/^Row 1, Col 1: /);
  });

  it("memo keys do nothing while the quit confirmation is open", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(screen.getByRole("button", { name: /quit/i }));
    const first = tile("Row 1, Col 1, face down");
    audio.sfxCalls.length = 0;
    fireEvent.keyDown(first, { key: "2" });
    expect(audio.sfxCalls).not.toContain("memoToggle");
    expect(screen.queryByRole("button", { name: /memo 2/ })).toBeNull();
  });

  it("ignores keys typed in a text field inside the board", () => {
    render(<SuperVoltorbFlipGame />);
    const board = screen.getByRole("group", { name: "Board, 5 by 5" });
    const input = document.createElement("input");
    board.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyDown(input, { key: "2" });
    expect(cursorCues()).toBe(0);
    expect(audio.sfxCalls).not.toContain("memoToggle");
    expect(screen.queryByRole("button", { name: /memo 2/ })).toBeNull();
    expect(tile("Row 1, Col 1, face down").tabIndex).toBe(0);
    input.remove();
  });
});
