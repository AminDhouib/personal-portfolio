import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

// The audio cues are a timing contract: the round flow waits on them. Here the
// audio layer is mocked so each cue resolves at exactly its nominal length (the
// real facade does the same, see audio.test.ts), and the component is driven on
// fake timers to pin what it does with those lengths.

vi.mock("next/font/local", () => ({
  default: () => ({ className: "mock-font", style: { fontFamily: "mock" } }),
}));

const audio = vi.hoisted(() => ({
  sfxCalls: [] as string[],
  stopAllCues: vi.fn(),
}));

vi.mock("../audio", async () => {
  const { RISK_WARNING_MS, LEVEL_WIN_MS } = await import("../sound-cues");
  return {
    sfx: new Proxy(
      {},
      {
        get: (_target, name: string) => () => {
          audio.sfxCalls.push(name);
          return name === "riskWarning"
            ? new Promise<void>((resolve) => setTimeout(resolve, RISK_WARNING_MS))
            : Promise.resolve();
        },
      },
    ),
    playMusic: () => {},
    stopMusic: () => {},
    fadeOutMusic: () => {},
    playGameOver: () => {},
    stopGameOver: () => {},
    playLevelWin: (onEnded?: () => void) => {
      setTimeout(() => onEnded?.(), LEVEL_WIN_MS);
    },
    stopLevelWin: () => {},
    stopAllCues: audio.stopAllCues,
    setMusicMuted: () => {},
  };
});

vi.mock("../effects/context", () => ({
  EffectsProvider: ({ children }: { children: ReactNode }) => children,
  useEffectsTheme: () => null,
}));

import { SuperVoltorbFlipGame } from "../../super-voltorb-flip";
import { LEVEL_WIN_MS, RISK_WARNING_MS } from "../sound-cues";

// A seeded generator so the board is the same every run. With this seed the
// level-8 board's top-left tile sits in a column that is at least 75% Voltorb
// but not certain, so tapping it raises the risk warning (found by scanning
// seeds against the engine; the assertion in each risk test guards the pick).
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const RISKY_SEED = 4;
const RISKY_TILE = "Row 1, Col 1, face down";

function seedStorage(muted: boolean): void {
  window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 8, totalScore: 0 }));
  window.localStorage.setItem("svf:muted", muted ? "1" : "0");
}

function quitButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Quit" }) as HTMLButtonElement;
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  audio.sfxCalls.length = 0;
  audio.stopAllCues.mockClear();
  vi.spyOn(Math, "random").mockImplementation(seededRandom(RISKY_SEED));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe.each([
  { label: "unmuted", muted: false },
  { label: "muted", muted: true },
])("risk warning lock ($label)", ({ muted }) => {
  it("holds the board and Quit until RISK_WARNING_MS + 500, then commits the flip", async () => {
    seedStorage(muted);
    render(<SuperVoltorbFlipGame />);
    const tile = screen.getByRole("button", { name: RISKY_TILE });
    expect(quitButton().disabled).toBe(false);

    fireEvent.click(tile);
    // The fanfare runs only when sound is on; either way the lock is the same.
    expect(audio.sfxCalls.includes("riskWarning")).toBe(!muted);
    expect(quitButton().disabled).toBe(true);

    await advance(RISK_WARNING_MS + 500 - 1);
    expect(quitButton().disabled).toBe(true);
    expect(screen.getByRole("button", { name: RISKY_TILE })).toBeTruthy();

    await advance(2);
    expect(quitButton().disabled).toBe(false);
    expect(screen.queryByRole("button", { name: RISKY_TILE })).toBeNull();
  });

  it("ignores other taps on the board while it is held", async () => {
    seedStorage(muted);
    render(<SuperVoltorbFlipGame />);
    fireEvent.click(screen.getByRole("button", { name: RISKY_TILE }));
    const flipsBefore = audio.sfxCalls.filter((n) => n === "flip").length;
    fireEvent.click(screen.getByRole("button", { name: "Row 5, Col 5, face down" }));
    expect(screen.getByRole("button", { name: "Row 5, Col 5, face down" })).toBeTruthy();
    expect(audio.sfxCalls.filter((n) => n === "flip").length).toBe(flipsBefore);
  });
});

describe("level-clear fanfare", () => {
  it("waits for the clear fanfare before the payout starts", async () => {
    seedStorage(false);
    render(<SuperVoltorbFlipGame />);
    // Ten taps on the mute button open the debug panel (back where we began).
    for (let i = 0; i < 10; i++) {
      fireEvent.click(screen.getAllByRole("button", { name: /^(Mute|Unmute)$/ })[0]!);
    }
    fireEvent.click(screen.getByRole("button", { name: "Open debug panel" }));
    fireEvent.click(screen.getByRole("button", { name: "Win current level" }));

    // Nothing of the payout (its drain ticks) before the fanfare ends. The
    // payout opens with a 320 ms read pause, so a wait shorter than the
    // fanfare would already show a tick here.
    await advance(LEVEL_WIN_MS - 1);
    expect(audio.sfxCalls).not.toContain("payoutTickBank");

    // Fanfare over (+ the 320 ms pause, rounded up to the next 60 ms slice).
    await advance(1 + 400);
    expect(audio.sfxCalls).toContain("payoutTickBank");
  });
});

describe("unmount", () => {
  it("silences every live cue", () => {
    seedStorage(false);
    const { unmount } = render(<SuperVoltorbFlipGame />);
    expect(audio.stopAllCues).not.toHaveBeenCalled();
    unmount();
    expect(audio.stopAllCues).toHaveBeenCalledTimes(1);
  });
});
