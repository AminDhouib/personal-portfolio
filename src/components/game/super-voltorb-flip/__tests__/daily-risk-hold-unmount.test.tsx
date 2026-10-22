import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

// T-6453 review: a high-risk tap on the Daily board holds the flip for the fanfare plus half a
// second and only then commits it (and saves it to svf:daily). "Back to the game" stays clickable
// during the hold, and it unmounts the Daily board. The hold's timer is now cleared on unmount, so
// the flip has to be saved at that moment instead: the old behaviour (the timer outlived the
// unmount and saved it) is what stops a player from escaping a tile they were warned about by
// leaving the board and choosing again (DESIGN.md: one counted attempt per device).

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
import { RISK_WARNING_MS } from "../sound-cues";
import { CPU_BOUND_TEST_TIMEOUT_MS } from "@/test/heavy";

// These tests render the whole board in jsdom; see src/test/heavy.ts for why the 5 s default is not enough.
vi.setConfig({ testTimeout: CPU_BOUND_TEST_TIMEOUT_MS });

const DAY = "2026-10-07";
// On this day's board the tile at row 5, col 3 (index 22) is a safe tile whose column holds four
// Voltorbs in five, so tapping it raises the risk warning. The assertion below guards the pick.
const RISKY = { row: 4, col: 2 } as const;
const RISKY_INDEX = RISKY.row * 5 + RISKY.col;
// The muted path waits RISK_WARNING_MS + 500; the unmuted one waits for the (mocked, instant) fanfare plus 500.
const RISKY_WAIT_MS = RISK_WARNING_MS + 500;

const savedDaily = () => JSON.parse(window.localStorage.getItem("svf:daily") ?? "{}");
const dailyEl = () => document.querySelector<HTMLElement>("[data-daily-board]")!;
const dailyTile = (row: number, col: number) =>
  Array.from(dailyEl().querySelectorAll<HTMLElement>("[data-cell]")).find(
    (b) => b.getAttribute("data-cell") === `${row}-${col}`,
  )!;
const openDaily = () => fireEvent.click(document.querySelector<HTMLElement>("[data-daily-open]")!);
const back = () => fireEvent.click(screen.getByRole("button", { name: "Back to the game" }));

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function setup(muted: boolean) {
  window.localStorage.clear();
  window.localStorage.setItem("svf:muted", muted ? "1" : "0");
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${DAY}T12:00:00Z`));
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ entries: [], you: null }), { status: 200 })),
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe.each([
  { label: "muted", muted: true },
  { label: "unmuted", muted: false },
])("Daily risk hold left by Back to the game ($label)", ({ muted }) => {
  it("takes the held flip into the saved attempt, once, and replays it on re-entry", async () => {
    setup(muted);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(dailyBoard(DAY).layout[RISKY_INDEX]).not.toBe("V");
    render(<SuperVoltorbFlipGame />);
    openDaily();

    fireEvent.click(dailyTile(RISKY.row, RISKY.col));
    // Held: the warning is up and nothing is saved yet.
    await advance(10);
    expect(savedDaily().flips ?? []).toEqual([]);

    // Leave the board mid-hold.
    back();
    await advance(0);
    expect(savedDaily().flips).toEqual([RISKY_INDEX]);

    // Whatever the timers would have done, nothing more is saved or thrown.
    await advance(RISKY_WAIT_MS + 5000);
    expect(savedDaily().flips).toEqual([RISKY_INDEX]);
    expect(errors).not.toHaveBeenCalled();

    // Re-entering replays the flip: the player cannot take the tile back.
    openDaily();
    expect(dailyTile(RISKY.row, RISKY.col).getAttribute("aria-label")).toContain("revealed");
    expect(savedDaily().flips).toEqual([RISKY_INDEX]);
  });

  it("saves nothing when the hold finished before leaving, and nothing twice", async () => {
    setup(muted);
    render(<SuperVoltorbFlipGame />);
    openDaily();

    fireEvent.click(dailyTile(RISKY.row, RISKY.col));
    await advance(RISKY_WAIT_MS + 100);
    expect(savedDaily().flips).toEqual([RISKY_INDEX]);

    back();
    await advance(5000);
    expect(savedDaily().flips).toEqual([RISKY_INDEX]);
  });
});
