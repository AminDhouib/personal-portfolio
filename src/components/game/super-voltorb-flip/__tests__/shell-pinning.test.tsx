import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { render, cleanup, screen, fireEvent, act, within } from "@testing-library/react";

// T-6766. Pins the behavior of the Super Voltorb Flip shell (super-voltorb-flip.tsx) that the file
// split moves: the board-size knob, the svf:progress save and restore, the score and level
// display that holds across a round end, the scoped stylesheet, the how-to-play modal, the debug
// panel and the scoreboard. Every assertion is made through the public component, so it holds
// before and after the pieces move into their own modules.

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
import { BOARD_FRAME_CSS } from "../board-size";
import { EMPTY_ROUND, HISTORY_SIZE } from "../hgss";
import { LEVEL_WIN_MS } from "../sound-cues";
import { CPU_BOUND_TEST_TIMEOUT_MS } from "@/test/heavy";
import { firstButton } from "@/test/first-button";

// These tests render the whole board in jsdom; see src/test/heavy.ts for why the 5 s default is not enough.
vi.setConfig({ testTimeout: CPU_BOUND_TEST_TIMEOUT_MS });

beforeEach(() => {
  // Muted, so no sound cue is involved and the clear wait is the silent LEVEL_WIN_MS timer.
  window.localStorage.setItem("svf:muted", "1");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  window.history.replaceState({}, "", "/");
});

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const boardLabel = () =>
  document.querySelector('[role="group"][aria-label^="Board,"]')?.getAttribute("aria-label");

const savedProgress = () => JSON.parse(window.localStorage.getItem("svf:progress") ?? "null");

function openDebugPanel(): void {
  // Ten taps on the mute button open the debug panel (back where we began).
  const mute = firstButton(/^(Mute|Unmute)$/);
  for (let i = 0; i < 10; i++) fireEvent.click(mute);
  fireEvent.click(screen.getByRole("button", { name: "Open debug panel" }));
}

// The "Lv" readout is rendered twice (phone HUD and desktop column); both must agree.
function levelReadouts(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>("span"))
    .filter((s) => s.textContent === "Lv")
    .map((s) => s.nextElementSibling?.textContent ?? "");
}

function levelFlashes(): boolean[] {
  return Array.from(document.querySelectorAll<HTMLElement>("span"))
    .filter((s) => s.textContent === "Lv")
    .map((s) => s.parentElement?.className.includes("svf-lv-flash-up") === true);
}

// The phone HUD's two readouts, found by their labels.
function hudDigits(label: "Total Coins" | "This Game"): string {
  const el = Array.from(document.querySelectorAll<HTMLElement>("span")).find(
    (s) => s.textContent === label,
  );
  return el?.parentElement?.nextElementSibling?.textContent ?? "";
}

const SEEDED_HISTORY = [
  { outcome: "won", cardsFlipped: 9, boardId: 40 },
  { outcome: "quit", cardsFlipped: 3, boardId: 41 },
  { outcome: "lost", cardsFlipped: 5, boardId: 42 },
  { outcome: "won", cardsFlipped: 12, boardId: 43 },
  { outcome: "none", cardsFlipped: 0, boardId: 0 },
];

describe("board size (?size=N)", () => {
  it("deals the default 5 by 5 board without a query", () => {
    render(<SuperVoltorbFlipGame />);
    expect(boardLabel()).toBe("Board, 5 by 5");
    expect(document.querySelectorAll("[data-cell]")).toHaveLength(25);
  });

  it("deals an N by N board for ?size=N in 2..10", () => {
    window.history.replaceState({}, "", "/?size=7");
    render(<SuperVoltorbFlipGame />);
    expect(boardLabel()).toBe("Board, 7 by 7");
    expect(document.querySelectorAll("[data-cell]")).toHaveLength(49);
  });

  it("falls back to 5 by 5 for an out-of-range or unreadable size", () => {
    window.history.replaceState({}, "", "/?size=99");
    render(<SuperVoltorbFlipGame />);
    expect(boardLabel()).toBe("Board, 5 by 5");
    cleanup();
    window.history.replaceState({}, "", "/?size=abc");
    render(<SuperVoltorbFlipGame />);
    expect(boardLabel()).toBe("Board, 5 by 5");
  });

  it("redeals when the debug panel's grid size changes", () => {
    render(<SuperVoltorbFlipGame />);
    openDebugPanel();
    const panel = screen.getByRole("dialog", { name: "Debug panel" });
    fireEvent.click(within(panel).getByRole("button", { name: "3" }));
    expect(boardLabel()).toBe("Board, 3 by 3");
    expect(within(panel).getByRole("button", { name: "3" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(within(panel).getByRole("button", { name: "5" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
    fireEvent.click(within(panel).getByRole("button", { name: "10" }));
    expect(boardLabel()).toBe("Board, 10 by 10");
  });
});

describe("svf:progress save and restore", () => {
  it("writes the default level, total and an empty history on a fresh mount", () => {
    render(<SuperVoltorbFlipGame />);
    const raw = window.localStorage.getItem("svf:progress");
    expect(raw).not.toBeNull();
    const saved = JSON.parse(raw!);
    expect(Object.keys(saved)).toEqual(["currentLevel", "totalScore", "history"]);
    expect(saved.currentLevel).toBe(1);
    expect(saved.totalScore).toBe(0);
    expect(saved.history).toEqual(Array.from({ length: HISTORY_SIZE }, () => ({ ...EMPTY_ROUND })));
  });

  it("restores a save and writes the same values back, never the defaults", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 4, totalScore: 1234, history: SEEDED_HISTORY }),
    );
    render(<SuperVoltorbFlipGame />);
    await advance(0);
    expect(savedProgress()).toEqual({
      currentLevel: 4,
      totalScore: 1234,
      history: SEEDED_HISTORY,
    });
    // The scoreboard and the level readout show the restored values.
    expect(hudDigits("Total Coins")).toBe("01234");
    expect(hudDigits("This Game")).toBe("00000");
    expect(levelReadouts()).toEqual(["4", "4"]);
  });

  it("restores a save without a history and pads it with empty rounds", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 6, totalScore: 77 }),
    );
    render(<SuperVoltorbFlipGame />);
    await advance(0);
    expect(savedProgress()).toEqual({
      currentLevel: 6,
      totalScore: 77,
      history: Array.from({ length: HISTORY_SIZE }, () => ({ ...EMPTY_ROUND })),
    });
    expect(levelReadouts()).toEqual(["6", "6"]);
  });

  it("ignores an unreadable save and overwrites it with the defaults", () => {
    window.localStorage.setItem("svf:progress", "not json {");
    render(<SuperVoltorbFlipGame />);
    expect(savedProgress()).toMatchObject({ currentLevel: 1, totalScore: 0 });
  });

  it("saves a won round: the new total, the next level and the round in the history", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 3, totalScore: 0 }));
    render(<SuperVoltorbFlipGame />);
    await advance(0);
    openDebugPanel();
    fireEvent.click(screen.getByRole("button", { name: "Win current level" }));
    await advance(0);
    const saved = savedProgress();
    expect(saved.totalScore).toBeGreaterThan(0);
    expect(saved.history).toHaveLength(HISTORY_SIZE);
    expect(saved.history[HISTORY_SIZE - 1]).toMatchObject({ outcome: "won" });
    expect(saved.currentLevel).toBeGreaterThanOrEqual(3);
  });
});

describe("score and level display across a round end", () => {
  async function winLevelThree(): Promise<void> {
    window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 3, totalScore: 0 }));
    render(<SuperVoltorbFlipGame />);
    // The restored level reaches the display on a 0 ms timer, before the round ends.
    await advance(0);
    openDebugPanel();
    fireEvent.click(screen.getByRole("button", { name: "Win current level" }));
  }

  it("holds the old level and an empty pot until the payout, then banks into the total", async () => {
    vi.useFakeTimers();
    await winLevelThree();
    const total = savedProgress().totalScore as number;
    const nextLevelNumber = String(savedProgress().currentLevel);
    expect(total).toBeGreaterThan(0);
    // The engine moved the level and the total at once; the display must not.
    expect(levelReadouts()).toEqual(["3", "3"]);
    expect(hudDigits("Total Coins")).toBe("00000");

    // Past the clear wait the pot snaps to the earnings and drains into the total.
    await advance(LEVEL_WIN_MS + 1);
    expect(hudDigits("This Game")).not.toBe("00000");
    for (let i = 0; i < 100 && !screen.queryByText(/Moved up to Level/); i++) await advance(100);
    expect(screen.getByText(/Moved up to Level/)).toBeTruthy();
    expect(hudDigits("This Game")).toBe("00000");
    expect(hudDigits("Total Coins")).toBe(String(total).padStart(5, "0"));
    // Still the old level while the banner is up.
    expect(levelReadouts()).toEqual(["3", "3"]);

    // Continue: the first column folds at 100 ms and the level card flashes with the new level.
    fireEvent.keyDown(document, { key: "Enter" });
    await advance(100 + 50);
    expect(levelReadouts()).toEqual([nextLevelNumber, nextLevelNumber]);
    expect(levelFlashes()).toEqual([true, true]);
    // The flash clears 1200 ms after it starts.
    await advance(1300);
    expect(levelFlashes()).toEqual([false, false]);
    expect(levelReadouts()).toEqual([nextLevelNumber, nextLevelNumber]);
  });

  it("snaps the drain to the final total when the player taps during it", async () => {
    vi.useFakeTimers();
    await winLevelThree();
    const total = savedProgress().totalScore as number;
    // Into the drain: past the clear wait and the 320 ms read pause.
    await advance(LEVEL_WIN_MS + 400);
    act(() => {
      window.dispatchEvent(new Event("pointerdown"));
    });
    // One drain tick later the loop sees the skip and banks the rest at once.
    await advance(60);
    expect(hudDigits("This Game")).toBe("00000");
    expect(hudDigits("Total Coins")).toBe(String(total).padStart(5, "0"));
  });
});

describe("the scoreboard", () => {
  it("shows Total Coins and This Game as five-digit readouts, one span per digit", () => {
    render(<SuperVoltorbFlipGame />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Total");
    expect(text).toContain("Coins");
    expect(text).toContain("This");
    expect(text).toContain("Game");
    // Desktop scoreboard: two 5-digit readouts in the stacked-pixel font, 0.5em wide cells.
    const cells = Array.from(
      document.querySelectorAll<HTMLElement>('span.inline-block[style*="width: 0.5em"]'),
    );
    // Two per column layout (desktop + phone) x two readouts x five digits.
    expect(cells).toHaveLength(20);
    expect(cells.every((c) => c.textContent === "0")).toBe(true);
  });
});

describe("the scoped stylesheet", () => {
  const css = () => document.querySelector(".svf-root > style")?.textContent ?? "";

  it("is rendered once inside the root and carries the board frame css", () => {
    render(<SuperVoltorbFlipGame />);
    expect(document.querySelectorAll(".svf-root > style")).toHaveLength(1);
    expect(css()).toContain(BOARD_FRAME_CSS);
    expect(css()).toContain("--svf-n: 5;");
  });

  it("defines the rules the board, modal and level flash depend on", () => {
    render(<SuperVoltorbFlipGame />);
    for (const rule of [
      ".svf-root .text-shadow-white",
      ".svf-root .picture-outline",
      ".svf-root .svf-conn-e",
      ".svf-root .svf-conn-s",
      ".svf-root .svf-tile-wrap::before",
      ".svf-root .svf-tile-wrap:focus-visible",
      ".svf-root .svf-coin",
      ".svf-root .svf-peek .svf-tile-wrap > div",
      ".svf-root .svf-modal-backdrop",
      ".svf-root .svf-modal-open",
      ".svf-root .svf-modal-closing",
      ".svf-lv-flash-up",
      ".svf-lv-flash-down",
      ".svf-tile-anxious > *:not(.svf-conn-e):not(.svf-conn-s)",
      ".svf-root:fullscreen",
      "@media (prefers-reduced-motion: reduce)",
    ]) {
      expect(css(), rule).toContain(rule);
    }
  });

  it("defines a keyframes block for every animation it uses", () => {
    render(<SuperVoltorbFlipGame />);
    const used = new Set(
      Array.from(css().matchAll(/animation:\s*(svf-[a-z-]+)/g)).map((m) => m[1]),
    );
    const defined = new Set(
      Array.from(css().matchAll(/@keyframes\s+(svf-[a-z-]+)/g)).map((m) => m[1]),
    );
    expect(Array.from(defined).sort()).toEqual([
      "svf-coin-spin",
      "svf-lv-flash-down",
      "svf-lv-flash-up",
      "svf-modal-backdrop-in",
      "svf-modal-backdrop-out",
      "svf-modal-card-in",
      "svf-modal-card-out",
      "svf-tile-shake",
    ]);
    for (const name of used) expect(defined.has(name as string), name).toBe(true);
  });
});

describe("the how to play modal", () => {
  function open(): HTMLElement {
    fireEvent.click(firstButton("How to play"));
    return screen.getByRole("dialog", { name: "How to play" });
  }

  it("shows the reward legend, the demo cards, the tips and the disclaimer", () => {
    render(<SuperVoltorbFlipGame />);
    const modal = open();
    const text = modal.textContent ?? "";
    expect(text).toContain("Tiles & rewards");
    expect(text).toContain("...x1! ...x2! ...x3!");
    expect(text).toContain("Game Over! 0!");
    expect(text).toContain("How it plays");
    expect(text).toContain("Collect coins");
    expect(text).toContain("Avoid Voltorbs");
    expect(text).toContain("Unofficial fan recreation.");
    // Five instruction bullets and two tips from the translations.
    expect(modal.querySelectorAll("section")).toHaveLength(3);
    expect(modal.querySelectorAll("section:nth-of-type(2) ul li")).toHaveLength(5);
    expect(modal.querySelectorAll("section:nth-of-type(3) ul li")).toHaveLength(2);
    expect(modal.getAttribute("aria-modal")).toBe("true");
  });

  it("closes through the close button, the backdrop and Escape, after the 180 ms exit", async () => {
    vi.useFakeTimers();
    render(<SuperVoltorbFlipGame />);
    let modal = open();
    expect(modal.className).toContain("svf-modal-open");

    // A click inside the card does nothing.
    fireEvent.click(modal.querySelector(".svf-modal-card")!);
    await advance(500);
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeNull();

    fireEvent.click(modal.querySelector('button[aria-label="Close"]')!);
    expect(modal.className).toContain("svf-modal-closing");
    await advance(179);
    expect(screen.queryByRole("dialog", { name: "How to play" })).not.toBeNull();
    await advance(2);
    expect(screen.queryByRole("dialog", { name: "How to play" })).toBeNull();

    modal = open();
    fireEvent.click(modal);
    await advance(181);
    expect(screen.queryByRole("dialog", { name: "How to play" })).toBeNull();

    open();
    // Escape closes at once: the modal registers a second, unanimated Escape listener.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "How to play" })).toBeNull();
  });
});

describe("the debug panel", () => {
  it("is hidden until the mute button has been tapped ten times", () => {
    render(<SuperVoltorbFlipGame />);
    const mute = firstButton(/^(Mute|Unmute)$/);
    for (let i = 0; i < 9; i++) fireEvent.click(mute);
    expect(screen.queryByRole("button", { name: "Open debug panel" })).toBeNull();
    fireEvent.click(mute);
    expect(screen.queryByRole("button", { name: "Open debug panel" })).not.toBeNull();
  });

  it("opens and closes, and offers grid sizes 2..10, win level and peek", () => {
    render(<SuperVoltorbFlipGame />);
    openDebugPanel();
    const panel = screen.getByRole("dialog", { name: "Debug panel" });
    const sizes = Array.from(panel.querySelectorAll("button[aria-pressed]")).map(
      (b) => b.textContent,
    );
    expect(sizes).toEqual(["2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    expect(
      panel.querySelector('button[aria-pressed="true"]')?.textContent,
      "the default size is pressed",
    ).toBe("5");
    expect(screen.getByRole("button", { name: "Win current level" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close debug panel" }));
    expect(screen.queryByRole("dialog", { name: "Debug panel" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open debug panel" })).not.toBeNull();
  });

  it("peeks at every tile without flipping any, and puts them back", () => {
    render(<SuperVoltorbFlipGame />);
    const faceDown = () =>
      Array.from(document.querySelectorAll<HTMLElement>("[data-cell]")).filter((t) =>
        t.getAttribute("aria-label")?.includes("face down"),
      ).length;
    expect(faceDown()).toBe(25);
    openDebugPanel();
    const peek = within(screen.getByRole("dialog", { name: "Debug panel" })).getByRole(
      "checkbox",
    ) as HTMLInputElement;
    fireEvent.click(peek);
    expect(peek.checked).toBe(true);
    expect(faceDown()).toBe(0);
    expect(document.querySelector(".svf-board-frame")?.className).toContain("svf-peek");
    fireEvent.click(peek);
    expect(faceDown()).toBe(25);
    expect(document.querySelector(".svf-board-frame")?.className).not.toContain("svf-peek");
  });
});

describe("the font modules", () => {
  // next/font/local resolves `src` relative to the file that calls it, at build time, and vitest
  // stubs the call, so a wrong relative path would only fail in `next build`. Walk the game's
  // sources, find every localFont call and check that each src exists on disk.
  const GAME_DIR = resolve(__dirname, "..", "..");

  function sources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "__tests__") out.push(...sources(full));
      } else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it("loads exactly the three shipped font files, each resolving from its calling file", () => {
    const found: string[] = [];
    for (const file of sources(resolve(GAME_DIR, "super-voltorb-flip"))
      .concat(join(GAME_DIR, "super-voltorb-flip.tsx"))
      .filter((f) => existsSync(f))) {
      const text = readFileSync(file, "utf8");
      if (!text.includes("localFont(")) continue;
      for (const m of text.matchAll(/src:\s*"([^"]+\.ttf)"/g)) {
        const target = resolve(dirname(file), m[1]!);
        expect(existsSync(target), `${file}: ${m[1]}`).toBe(true);
        found.push(target.replaceAll("\\", "/").split("/").pop()!);
      }
    }
    expect(found.sort()).toEqual(["m5x7.ttf", "pokemon-ds-font.ttf", "stacked-pixel.ttf"]);
  });
});
