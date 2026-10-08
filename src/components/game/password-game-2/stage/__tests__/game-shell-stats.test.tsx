import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { GameState } from "../../engine/types";

const params = { q: "seed=7" };
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(params.q),
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
import { EVENT_DEFS } from "../../engine/events/index";

const pump = () =>
  act(() => {
    vi.advanceTimersByTime(300);
  });

/** Turns the live run into a win and lets the shell heartbeat notice. */
function win(ms = 90_000) {
  const g = live.g!;
  g.elapsedMs = ms;
  g.outcome = "victory";
  g.version += 1;
  pump();
}

describe("GameShell records a finished run", () => {
  beforeEach(() => {
    localStorage.clear();
    saved.length = 0;
    params.q = "seed=7";
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
    fireEvent.click(getByRole("button", { name: /random seed/i }));
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
    fireEvent.click(getByRole("button", { name: /random seed/i }));
    const g = live.g!;
    g.elapsedMs = 1000;
    g.outcome = "victory";
    g.version += 1;
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(localStorage.getItem("pg2:stats")).toBe(newer);
  });

  describe("which runs are recorded", () => {
    it("records a random-seed run", () => {
      const { getByRole } = render(<GameShell />);
      fireEvent.click(getByRole("button", { name: /random seed/i }));
      win();
      expect(saved).toHaveLength(1);
    });

    it("records the daily", () => {
      const { getByRole } = render(<GameShell />);
      fireEvent.click(getByRole("button", { name: /start today/i }));
      win();
      expect(saved).toHaveLength(1);
      expect((JSON.parse(saved[0]!) as { streak: number }).streak).toBe(1);
    });

    it("does not record a run on a shared ?seed=, but records Play again after it", () => {
      const { getByRole } = render(<GameShell />);
      fireEvent.click(getByRole("button", { name: /start seed 7/i }));
      win();
      expect(saved).toHaveLength(0);
      fireEvent.click(getByRole("button", { name: /play again/i }));
      win();
      expect(saved).toHaveLength(1);
    });

    it("does not record an auto-started run with a forced ?event=", () => {
      params.q = `seed=7&event=${EVENT_DEFS[0]!.id}`;
      render(<GameShell />);
      act(() => {
        vi.advanceTimersByTime(10);
      });
      expect(live.g).not.toBeNull();
      win();
      expect(saved).toHaveLength(0);
    });
  });

  it("shares the day the daily started, not the day the receipt renders", () => {
    vi.setSystemTime(new Date("2026-10-08T23:50:00Z"));
    const share = vi.fn(async () => {});
    vi.stubGlobal("navigator", { share });
    const { getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /start today/i }));
    vi.setSystemTime(new Date("2026-10-09T00:05:00Z"));
    win(900_000);
    expect(JSON.parse(saved[0]!).lastDailyDay).toBe("2026-10-08");
    fireEvent.click(getByRole("button", { name: /share/i }));
    const arg = (share.mock.calls[0] as unknown as [{ text: string }])[0];
    expect(arg.text).toContain("2026-10-08");
    expect(arg.text).not.toContain("2026-10-09");
  });
});
