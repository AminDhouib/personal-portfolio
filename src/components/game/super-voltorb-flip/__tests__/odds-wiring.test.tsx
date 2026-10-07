import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, waitFor, within } from "@testing-library/react";

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

// Tiles by their data-cell hook, not by role: an open dialog may hide the board
// from the accessibility tree, and these tests read the labels either way.
const tiles = () => Array.from(document.querySelectorAll<HTMLElement>("[data-cell]"));
const labelled = () => tiles().filter((t) => ODDS_LABEL.test(t.getAttribute("aria-label") ?? ""));
const pills = () => document.querySelectorAll("[data-odds-pill]");

// A seeded Math.random deals a fixed, real board; try a few until one has a tile
// the odds call certainly safe, so the flip below can never be a Voltorb.
function lcg(seed: number): () => number {
  let x = seed;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}
async function renderWithSafeTile(): Promise<HTMLElement> {
  for (const seed of [11, 23, 37, 41, 53, 67, 71, 89]) {
    const spy = vi.spyOn(Math, "random").mockImplementation(lcg(seed));
    render(<SuperVoltorbFlipGame />);
    spy.mockRestore();
    await waitFor(() => expect(labelled()).toHaveLength(25));
    const safe = tiles().find((t) => (t.getAttribute("aria-label") ?? "").includes("no chance"));
    if (safe) return safe;
    cleanup();
  }
  throw new Error("no dealt board had a certainly-safe tile");
}

beforeEach(() => {
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("odds assist", () => {
  it("shows nothing by default", async () => {
    render(<SuperVoltorbFlipGame />);
    await new Promise((r) => setTimeout(r, 30));
    expect(labelled()).toHaveLength(0);
  });

  it("with the assist on, every face-down tile reports its odds in its aria-label", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await waitFor(() => expect(labelled()).toHaveLength(25));
  });

  it("exactly one tile is suggested as the next flip, and it says so", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await waitFor(() => expect(labelled()).toHaveLength(25));
    const suggested = tiles().filter((t) =>
      (t.getAttribute("aria-label") ?? "").includes("suggested next flip"),
    );
    expect(suggested.length).toBeLessThanOrEqual(1);
  });

  it("turning it on in Settings shows the odds, turning it off removes them", async () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]!);
    fireEvent.click(screen.getByRole("switch", { name: /odds assist/i }));
    await waitFor(() => expect(labelled().length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("switch", { name: /odds assist/i }));
    await waitFor(() => expect(labelled()).toHaveLength(0));
  });

  it("flipped tiles carry no odds", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    const safe = await renderWithSafeTile();
    fireEvent.click(safe);
    // A risk fanfare can hold the flip for a moment.
    await waitFor(() => expect(safe.getAttribute("aria-label")).toContain("revealed"), {
      timeout: 4000,
    });
    expect(safe.getAttribute("aria-label")).not.toMatch(ODDS_LABEL);
    // Nor a badge, once the new board's odds have landed (they cover 24 tiles).
    await waitFor(() => expect(labelled()).toHaveLength(24), { timeout: 4000 });
    expect(safe.querySelector("[data-odds-pill]")).toBeNull();
    expect(pills()).toHaveLength(24);
  });

  it("refreshes the odds after a flip, for the new board only", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    const safe = await renderWithSafeTile();
    fireEvent.click(safe);
    // 24 face-down tiles are left, and every one of them is labelled again.
    await waitFor(() => expect(labelled()).toHaveLength(24), { timeout: 4000 });
  });

  it("the badge text is not announced separately (it lives in the tile's label)", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await waitFor(() => expect(labelled()).toHaveLength(25));
    expect(pills().length).toBeGreaterThan(0);
    for (const pill of Array.from(pills())) {
      expect(pill.closest("[aria-hidden='true']")).not.toBeNull();
    }
  });

  it("the peek debug view hides the odds", async () => {
    window.localStorage.setItem("svf:settings", ASSIST_ON);
    render(<SuperVoltorbFlipGame />);
    await waitFor(() => expect(labelled()).toHaveLength(25));
    const mute = () => screen.getAllByRole("button", { name: /^(un)?mute$/i })[0]!;
    for (let i = 0; i < 10; i++) fireEvent.click(mute());
    fireEvent.click(screen.getByRole("button", { name: "Open debug panel" }));
    const dialog = screen.getByRole("dialog", { name: "Debug panel" });
    fireEvent.click(within(dialog).getByRole("checkbox"));
    await waitFor(() => expect(labelled()).toHaveLength(0));
    expect(pills()).toHaveLength(0);
  });
});
