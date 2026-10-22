import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { COMBO_FLASH_MS, createInitialUiState, createUiStateFromGame } from "../ui-state";
import { createRefs } from "../run-init";
import type { GameRefs } from "../types";

function freshRefs(): GameRefs {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  return createRefs();
}

describe("ui-state", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("starts armed with zeroed counters and no boss", () => {
    const ui = createInitialUiState();
    expect(ui).toMatchObject({
      status: "armed",
      score: 0,
      seconds: 0,
      kills: 0,
      combo: 1,
      comboPeak: 1,
      boss: null,
      active: [],
    });
    expect(ui.dashCooldown).toEqual({ pct: 1, onCooldown: false });
  });

  it("reports 0 seconds before the run starts", () => {
    const g = freshRefs();
    g.startedAt = 0;
    expect(createUiStateFromGame(g, 5000).seconds).toBe(0);
  });

  it("counts seconds from startedAt while playing", () => {
    const g = freshRefs();
    g.status = "playing";
    g.startedAt = 1000;
    expect(createUiStateFromGame(g, 4500).seconds).toBe(3.5);
  });

  it("freezes the clock at the pause instant", () => {
    const g = freshRefs();
    g.status = "paused";
    g.startedAt = 1000;
    g.pausedAt = 3000;
    expect(createUiStateFromGame(g, 99_000).seconds).toBe(2);
  });

  it("stops the clock at dyingAt, falling back to now", () => {
    const g = freshRefs();
    g.status = "dead";
    g.startedAt = 1000;
    g.dyingAt = 6000;
    expect(createUiStateFromGame(g, 99_000).seconds).toBe(5);
    g.dyingAt = 0;
    expect(createUiStateFromGame(g, 8000).seconds).toBe(7);
  });

  it("applies the score multiplier and floors score and distance", () => {
    const g = freshRefs();
    g.score = 101;
    g.scoreMultiplier = 1.5;
    g.distance = 12.9;
    const ui = createUiStateFromGame(g, 0);
    expect(ui.score).toBe(151);
    expect(ui.distance).toBe(12);
  });

  it("flashes the combo chip for COMBO_FLASH_MS after a tier-up", () => {
    const g = freshRefs();
    g.comboTierUpAt = 1000;
    expect(createUiStateFromGame(g, 1000 + COMBO_FLASH_MS - 1).comboFlash).toBe(true);
    expect(createUiStateFromGame(g, 1000 + COMBO_FLASH_MS).comboFlash).toBe(false);
    g.comboTierUpAt = 0;
    expect(createUiStateFromGame(g, 10).comboFlash).toBe(false);
  });

  it("derives the dash cooldown fraction over a 2000 ms window", () => {
    const g = freshRefs();
    g.dash.cooldownUntil = 3000;
    expect(createUiStateFromGame(g, 2000).dashCooldown).toEqual({ pct: 0.5, onCooldown: true });
    expect(createUiStateFromGame(g, 3000).dashCooldown).toEqual({ pct: 1, onCooldown: false });
  });

  it("clamps remaining power-up time at zero", () => {
    const g = freshRefs();
    g.activePowerUps = [{ type: "shield", expiresAt: 1500 } as GameRefs["activePowerUps"][number]];
    expect(createUiStateFromGame(g, 1000).active).toEqual([{ type: "shield", remainingMs: 500 }]);
    expect(createUiStateFromGame(g, 2000).active[0]?.remainingMs).toBe(0);
  });
});
