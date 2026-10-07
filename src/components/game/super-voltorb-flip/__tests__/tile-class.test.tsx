import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ReactNode } from "react";
import { render, cleanup, screen, fireEvent, act } from "@testing-library/react";

// Pins the tile wrapper's class list. The anxious modifier used to be glued to
// the perspective utility with no separator, which left the shake CSS
// (.svf-tile-anxious) with nothing to match.

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
import { RISK_WARNING_MS } from "../sound-cues";

// Same seeded board as audio-timing.test.tsx: at level 8 the top-left tile
// raises the risk warning.
function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const RISKY_TILE = "Row 1, Col 1, face down";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockImplementation(seededRandom(4));
  window.localStorage.setItem("svf:progress", JSON.stringify({ currentLevel: 8, totalScore: 0 }));
  window.localStorage.setItem("svf:muted", "1");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.localStorage.clear();
});

describe("tile wrapper classes", () => {
  it("keeps the perspective utility and the anxious modifier as separate tokens", async () => {
    render(<SuperVoltorbFlipGame />);
    const idle = screen.getByRole("button", { name: RISKY_TILE });
    expect(idle.classList.contains("[perspective:1000px]")).toBe(true);
    expect(idle.classList.contains("svf-tile-anxious")).toBe(false);

    fireEvent.click(idle);
    const held = screen.getByRole("button", { name: RISKY_TILE });
    expect(held.classList.contains("[perspective:1000px]")).toBe(true);
    expect(held.classList.contains("svf-tile-anxious")).toBe(true);
    expect(held.className).not.toContain("]svf-tile-anxious");

    // The hold ends after the fanfare plus the 500 ms beat; the class goes with it.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RISK_WARNING_MS + 501);
    });
    expect(document.querySelector(".svf-tile-anxious")).toBeNull();
  });
});
