import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRefs, startRun, pickNextBiomeDistance } from "../run-init";
import { ENVIRONMENTS, START_INVULN_MS } from "../types";
import type { GameRefs } from "../types";

// Characterization tests for run-init: the initial-state factory and the
// armed->playing transition. createRefs() calls matchMedia() unconditionally
// (it is guarded only by `typeof window !== "undefined"`, which is true under
// jsdom), and the shipped test setup does not provide matchMedia -- so each
// test stubs it via vi.stubGlobal (no source change). startRun() reads/writes
// localStorage (provided by the jsdom environment) and calls the sound manager,
// which no-ops without a real AudioContext.

function stubMatchMedia(matches = false): void {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches,
    media: q,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

describe("run-init", () => {
  beforeEach(() => {
    stubMatchMedia(false);
    // A clean localStorage means loadProfile() returns the default profile
    // (equippedShip "falcon", empty upgrades/inventory).
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe("createRefs", () => {
    it("starts 'armed' with the zeroed run scalars", () => {
      const g = createRefs();
      expect(g.status).toBe("armed");
      expect(g.score).toBe(0);
      expect(g.kills).toBe(0);
      expect(g.distance).toBe(0);
      expect(g.combo).toBe(1); // combo baseline is 1, not 0
      expect(g.comboPeak).toBe(1);
      expect(g.coinsThisRun).toBe(0);
      expect(g.startedAt).toBe(0);
    });

    it("starts every spawn collection empty", () => {
      const g = createRefs();
      const empties: Array<keyof GameRefs> = [
        "obstacles",
        "bullets",
        "explosions",
        "speedLines",
        "powerUps",
        "coins",
        "bossProjectiles",
        "activePowerUps",
        "debris",
        "scorePopups",
        "dashAfterimages",
      ];
      for (const key of empties) {
        expect(Array.isArray(g[key])).toBe(true);
        expect(g[key] as unknown[]).toHaveLength(0);
      }
    });

    it("starts with no boss active and a non-empty boss schedule at index 0", () => {
      const g = createRefs();
      expect(g.boss).toBeNull();
      expect(g.bossScheduleIdx).toBe(0);
      expect(g.bossesDefeatedThisRun).toBe(0);
      expect(g.bossSchedule.length).toBeGreaterThan(0);
      // Schedule is distance-ascending.
      const distances = g.bossSchedule.map((b) => b.distance);
      const sorted = [...distances].sort((a, b) => a - b);
      expect(distances).toEqual(sorted);
    });

    it("initializes the run flags to false and the ship at its start position", () => {
      const g = createRefs();
      expect(g.reviveAvailable).toBe(false);
      expect(g.reviveUsed).toBe(false);
      expect(g.invertedArmed).toBe(false);
      expect(g.devHotkeyArmed).toBe(false);
      expect(g.nextId).toBe(1);
      expect(g.shipX).toBe(0);
      expect(g.shipY).toBe(0);
      expect(g.shipZ).toBe(2);
      // The first environment is the initial biome.
      expect(g.currentEnv).toBe(ENVIRONMENTS[0]);
    });

    it("derives isMobile from matchMedia('(pointer: coarse)')", () => {
      stubMatchMedia(true); // simulate a coarse-pointer device
      expect(createRefs().isMobile).toBe(true);
      stubMatchMedia(false);
      // innerWidth in jsdom defaults to 1024 (>= 640), so the OR-clause stays false.
      expect(createRefs().isMobile).toBe(false);
    });
  });

  describe("startRun", () => {
    it("transitions armed -> playing and returns true on a fresh profile", () => {
      const g = createRefs();
      const before = performance.now();
      const ok = startRun(g);
      expect(ok).toBe(true);
      expect(g.status).toBe("playing");
      // The default equipped ship id resolves to the catalog default.
      expect(g.shipId).toBe("falcon");
      // Timers are set relative to the moment startRun ran.
      expect(g.startedAt).toBeGreaterThanOrEqual(before);
      expect(g.invulnUntil).toBeGreaterThanOrEqual(g.startedAt + START_INVULN_MS - 1);
      expect(g.nextWallAt).toBeGreaterThan(g.startedAt); // first wall scheduled ahead
      expect(g.lastSpawn).toBe(g.startedAt);
    });

    it("is idempotent: a second call returns false and leaves status 'playing'", () => {
      const g = createRefs();
      expect(startRun(g)).toBe(true);
      const startedAtAfterFirst = g.startedAt;
      expect(startRun(g)).toBe(false);
      expect(g.status).toBe("playing");
      // Second call short-circuits before touching timers.
      expect(g.startedAt).toBe(startedAtAfterFirst);
    });

    it("returns false when the ref is not in the 'armed' state", () => {
      const g = createRefs();
      g.status = "dead";
      expect(startRun(g)).toBe(false);
    });

    it("applies default (level 0) upgrade modifiers on a clean profile", () => {
      const g = createRefs();
      startRun(g);
      // With no owned upgrades, the score multiplier is the base 1 and the
      // additive coin bonuses are 0.
      expect(g.scoreMultiplier).toBe(1);
      expect(g.coinMagnetExtra).toBe(0);
      expect(g.coinValueBonus).toBe(0);
      expect(g.coinBoostMul).toBe(1);
    });
  });

  describe("pickNextBiomeDistance", () => {
    it("returns a distance 700-1600m beyond the current distance (invariant)", () => {
      for (let i = 0; i < 300; i++) {
        const current = Math.random() * 5000;
        const next = pickNextBiomeDistance(current);
        expect(next).toBeGreaterThanOrEqual(current + 700 - 1e-9);
        expect(next).toBeLessThanOrEqual(current + 1600 + 1e-9);
      }
    });

    it("with a fixed random draw, adds exactly 700 + r*900", () => {
      vi.spyOn(Math, "random").mockReturnValue(0.5);
      expect(pickNextBiomeDistance(1000)).toBeCloseTo(1000 + 700 + 0.5 * 900, 10);
    });
  });
});
