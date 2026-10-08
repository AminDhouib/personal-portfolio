import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { GameState } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("seed=7"),
}));

const live: { g: GameState | null } = { g: null };
vi.mock("../../engine/engine", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/engine")>();
  return {
    ...orig,
    createRun: (opts: Parameters<typeof orig.createRun>[0]) => {
      live.g = orig.createRun({ ...opts, nowHHMM: () => "12:00" });
      return live.g;
    },
  };
});

const saved: string[] = [];
vi.mock("../../stats/stats", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../stats/stats")>();
  return {
    ...orig,
    saveStats: (s: Parameters<typeof orig.saveStats>[0]) => {
      saved.push(JSON.stringify(s));
      orig.saveStats(s);
    },
  };
});

import { GameShell } from "../game-shell";

describe("GameShell records a finished run", () => {
  beforeEach(() => {
    localStorage.clear();
    saved.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 1024px"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    live.g = null;
    localStorage.clear();
    document.documentElement.classList.remove("pg2-lock");
  });

  it("shows the stored best and a daily streak chip on the start screen", () => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(
      "pg2:stats",
      JSON.stringify({
        v: 1,
        runs: 4,
        bestMs: 731_000,
        dailyBestMs: 731_000,
        streak: 3,
        bestStreak: 3,
        lastDailyDay: today,
        history: [],
      }),
    );
    const { container } = render(<GameShell />);
    expect(container.textContent).toContain("12:11");
    expect(container.textContent).toContain("Daily streak: 3");
  });

  it("writes once when the run turns to victory, even across re-renders", () => {
    const { getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /start seed 7/i }));
    const g = live.g!;
    expect(saved).toHaveLength(0);

    g.elapsedMs = 654_321;
    g.outcome = "victory";
    g.version += 1;
    for (let i = 0; i < 4; i++) {
      act(() => {
        vi.advanceTimersByTime(300);
      });
    }

    expect(saved).toHaveLength(1);
    const written = JSON.parse(saved[0]!) as { runs: number; bestMs: number };
    expect(written.runs).toBe(1);
    expect(written.bestMs).toBe(654_321);
  });

  it("leaves a newer build stored stats untouched when a run is won", () => {
    const newer = JSON.stringify({ v: 99, bestMs: 1 });
    localStorage.setItem("pg2:stats", newer);
    const { getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /start seed 7/i }));
    const g = live.g!;
    g.elapsedMs = 1000;
    g.outcome = "victory";
    g.version += 1;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(localStorage.getItem("pg2:stats")).toBe(newer);
  });
});
