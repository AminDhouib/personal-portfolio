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
import { dailyBoard } from "../daily-board";

const DAY = "2026-10-07";
const layout = dailyBoard(DAY).layout;
const ODDS_LABEL =
  /(\d+|under 1|over 99) percent Voltorb|no chance of a Voltorb|certainly a Voltorb/;

// A tile whose row and column are far from the risk fanfare (75% Voltorb), so a
// flip commits at once instead of waiting out the warning.
const calm = (value: unknown) =>
  layout.findIndex((v, i) => {
    if (v !== value) return false;
    const row = Math.floor(i / 5);
    const col = i % 5;
    const inRow = layout.filter((x, j) => Math.floor(j / 5) === row && x === "V").length;
    const inCol = layout.filter((x, j) => j % 5 === col && x === "V").length;
    return inRow > 0 && inCol > 0 && inRow <= 3 && inCol <= 3;
  });
const at = (index: number) => [Math.floor(index / 5), index % 5] as const;

const dailyEl = () => document.querySelector<HTMLElement>("[data-daily-board]")!;
// The main board stays mounted while the Daily screen is open (CSS hides it, and
// jsdom has no stylesheet), so the Daily tiles are found inside the Daily wrapper.
const dailyTile = (row: number, col: number) =>
  Array.from(dailyEl().querySelectorAll<HTMLElement>("[data-cell]")).find(
    (b) => b.getAttribute("data-cell") === `${row}-${col}`,
  )!;
const flipDaily = (index: number) => fireEvent.click(dailyTile(...at(index)));
const openDaily = () => fireEvent.click(screen.getAllByRole("button", { name: "Daily" })[0]!);
const savedDaily = () => JSON.parse(window.localStorage.getItem("svf:daily") ?? "{}");
const savedStats = () => JSON.parse(window.localStorage.getItem("svf:stats") ?? "{}");
const quitDaily = () => {
  fireEvent.click(within(dailyEl()).getByRole("button", { name: "Quit" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Quit" }));
};

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  // Nothing touches the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? new Response(JSON.stringify({ ok: true, boards: [] }), { status: 200 })
        : new Response(JSON.stringify({ entries: [], you: null }), { status: 200 }),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("the Daily board", () => {
  it("opens from the mode row on today's board and leaves no trace in the main save", async () => {
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 3, totalScore: 40 }),
    );
    render(<SuperVoltorbFlipGame />);
    const before = window.localStorage.getItem("svf:progress");
    openDaily();
    expect(await screen.findByRole("region", { name: "Daily board" })).toBeInTheDocument();
    expect(screen.getAllByText(/2026-10-07/).length).toBeGreaterThan(0);
    // A flip is recorded in svf:daily and never in svf:progress.
    const two = calm(2);
    flipDaily(two);
    expect(savedDaily().flips).toEqual([two]);
    expect(window.localStorage.getItem("svf:progress")).toBe(before);
  });

  it("a reload resumes the same attempt with the flip still flipped", () => {
    const two = calm(2);
    const first = render(<SuperVoltorbFlipGame />);
    openDaily();
    flipDaily(two);
    first.unmount();
    cleanup();
    render(<SuperVoltorbFlipGame />);
    openDaily();
    expect(dailyTile(...at(two)).getAttribute("aria-label")).toContain("revealed");
  });

  it("losing ends the attempt for the day and shows nothing to post", async () => {
    render(<SuperVoltorbFlipGame />);
    openDaily();
    flipDaily(calm("V"));
    expect(await screen.findByText(/no score to post/i)).toBeInTheDocument();
    expect(savedDaily().outcome).toBe("lost");
  });

  it("allows one play a day: a finished board cannot be flipped again after a reload", async () => {
    const first = render(<SuperVoltorbFlipGame />);
    openDaily();
    flipDaily(calm("V"));
    await screen.findByText(/no score to post/i);
    const flips = savedDaily().flips;
    first.unmount();
    cleanup();
    render(<SuperVoltorbFlipGame />);
    openDaily();
    flipDaily(calm(2));
    expect(savedDaily().flips).toEqual(flips);
    expect(savedDaily().outcome).toBe("lost");
    expect(screen.getByText(/today's board is done/i)).toBeInTheDocument();
  });

  it("Back returns to the normal game with its level untouched", () => {
    window.localStorage.setItem(
      "svf:progress",
      JSON.stringify({ currentLevel: 3, totalScore: 40 }),
    );
    render(<SuperVoltorbFlipGame />);
    const before = window.localStorage.getItem("svf:progress");
    openDaily();
    fireEvent.click(screen.getByRole("button", { name: "Back to the game" }));
    expect(screen.queryByRole("region", { name: "Daily board" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Daily" })[0]).toBeEnabled();
    expect(window.localStorage.getItem("svf:progress")).toBe(before);
    expect(JSON.parse(before ?? "{}").currentLevel).toBe(3);
  });

  it("memo undo works on the Daily board, from the button and from Ctrl+Z", () => {
    render(<SuperVoltorbFlipGame />);
    openDaily();
    const memoBar = dailyEl().parentElement!;
    fireEvent.click(within(memoBar).getAllByRole("button", { name: "Memo 2" })[0]!);
    fireEvent.click(dailyTile(1, 1));
    expect(dailyTile(1, 1).getAttribute("aria-label")).toContain("memo 2");
    fireEvent.keyDown(dailyTile(1, 1), { key: "z", ctrlKey: true });
    expect(dailyTile(1, 1).getAttribute("aria-label")).not.toContain("memo");
    fireEvent.click(within(memoBar).getAllByRole("button", { name: "Memo 3" })[0]!);
    fireEvent.click(dailyTile(2, 2));
    expect(dailyTile(2, 2).getAttribute("aria-label")).toContain("memo 3");
    const undoButtons = screen.getAllByRole("button", { name: "Undo last memo" });
    fireEvent.click(undoButtons[undoButtons.length - 1]!);
    expect(dailyTile(2, 2).getAttribute("aria-label")).not.toContain("memo");
  });

  it("does not undo while Settings is open over the Daily board", () => {
    render(<SuperVoltorbFlipGame />);
    openDaily();
    const memoBar = dailyEl().parentElement!;
    fireEvent.click(within(memoBar).getAllByRole("button", { name: "Memo 3" })[0]!);
    fireEvent.click(dailyTile(1, 1));
    fireEvent.click(screen.getAllByRole("button", { name: "Settings" })[0]!);
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Settings" }), {
      key: "z",
      ctrlKey: true,
    });
    expect(dailyTile(1, 1).getAttribute("aria-label")).toContain("memo 3");
  });

  it("the main game's undo does nothing while the Daily screen is open", () => {
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(screen.getAllByRole("button", { name: "Memo 2" })[0]!);
    const mainTile = screen
      .getAllByRole("button")
      .find((b) => b.getAttribute("data-cell") === "0-0")!;
    fireEvent.click(mainTile);
    expect(mainTile.getAttribute("aria-label")).toContain("memo 2");
    openDaily();
    // Entering the Daily screen starts from a clean memo state; the key reaches
    // the Daily board's handler, never the main one.
    fireEvent.keyDown(dailyTile(0, 0), { key: "z", ctrlKey: true });
    expect(mainTile.getAttribute("aria-label")).toContain("memo 2");
  });

  it("has no odds assist even when the setting is on", async () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":true,"stats":true,"assist":true}',
    );
    render(<SuperVoltorbFlipGame />);
    openDaily();
    await new Promise((r) => setTimeout(r, 30));
    const tiles = Array.from(dailyEl().querySelectorAll<HTMLElement>("[data-cell]"));
    expect(tiles).toHaveLength(25);
    for (const t of tiles) {
      expect(t.getAttribute("aria-label")).not.toMatch(ODDS_LABEL);
    }
    expect(dailyEl().querySelectorAll("[data-odds-pill]")).toHaveLength(0);
  });

  it("a Daily round is never counted as assisted, even with the assist on", async () => {
    window.localStorage.setItem(
      "svf:settings",
      '{"v":1,"memoUndo":true,"stats":true,"assist":true}',
    );
    render(<SuperVoltorbFlipGame />);
    openDaily();
    await new Promise((r) => setTimeout(r, 30));
    flipDaily(calm("V"));
    await screen.findByText(/no score to post/i);
    expect(savedStats().assistedRounds ?? 0).toBe(0);
    expect(screen.queryByText(/Assisted/)).toBeNull();
  });
});

describe("the Daily streak", () => {
  it("a quit with coins banked is a completed day", async () => {
    render(<SuperVoltorbFlipGame />);
    openDaily();
    flipDaily(calm(2));
    quitDaily();
    await screen.findByText(/Today:/);
    expect(savedDaily().outcome).toBe("quit");
    expect(savedStats().streak).toEqual({ current: 1, best: 1, lastDay: DAY });
    expect(savedStats().dailyPlayed).toBe(1);
    // The day is not counted in the normal rounds.
    expect(savedStats().rounds?.played ?? 0).toBe(0);
  });

  it("a quit with no coins is played but not completed", async () => {
    render(<SuperVoltorbFlipGame />);
    openDaily();
    quitDaily();
    await screen.findByText(/no score to post/i);
    expect(savedStats().dailyPlayed).toBe(1);
    expect(savedStats().streak).toEqual({ current: 0, best: 0, lastDay: null });
  });

  it("a loss is played and leaves a live streak alone", async () => {
    window.localStorage.setItem(
      "svf:stats",
      JSON.stringify({
        v: 1,
        rounds: { played: 0, won: 0, lost: 0, quit: 0 },
        assistedRounds: 0,
        coins: { total: 0, best: 0 },
        highestLevel: 1,
        lv8Seconds: 0,
        streak: { current: 2, best: 2, lastDay: "2026-10-06" },
        dailyPlayed: 2,
      }),
    );
    render(<SuperVoltorbFlipGame />);
    openDaily();
    flipDaily(calm("V"));
    await screen.findByText(/no score to post/i);
    expect(savedStats().dailyPlayed).toBe(3);
    // Kept alive, not extended: tomorrow's completed board makes it 3.
    expect(savedStats().streak).toEqual({ current: 2, best: 2, lastDay: DAY });
  });
});
