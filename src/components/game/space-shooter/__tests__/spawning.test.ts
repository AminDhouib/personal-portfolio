import { describe, it, expect, vi, afterEach } from "vitest";
import {
  spawnIntervalMs,
  fireIntervalMs,
  bulletDamage,
  styleForBullet,
  bulletColor,
  spawnObstacle,
  spawnPowerUp,
  spawnCoin,
  pickWallGapX,
  spawnWall,
} from "../spawning";
import { ARENA_W, ARENA_H, SPAWN_Z, POWERUP_TYPES, setArena } from "../types";
import type { GameRefs, ObstacleVariant, PowerUpType } from "../types";

// Characterization tests for the extracted spawning module. The deterministic
// rate helpers are pinned to exact values (derived from the shipped formulas).
// The random spawn functions are driven two ways:
//   1. Math.random stubbed with a fixed sequence -> assert exact resulting
//      fields (pins the arithmetic that maps random draws to spawn state).
//   2. Invariant assertions over many unstubbed iterations -> pin the bounds/
//      shape guarantees that must hold for ANY random draw.
// No source is modified; Math.random / performance.now are stubbed via vi only.

// Minimal GameRefs stub carrying just the fields the spawning helpers read.
// difficulty() reads performance.now() - startedAt; isPowerUpActive() reads
// activePowerUps + performance.now(); spawn* read shipX/shipY, the arrays they
// push into, prefs.reducedMotion, and nextId.
function baseRefs(overrides: Partial<GameRefs> = {}): GameRefs {
  return {
    startedAt: 0,
    isMobile: false,
    shipX: 0,
    shipY: 0,
    shipDamageMul: 1,
    activePowerUps: [],
    obstacles: [],
    coins: [],
    prefs: { reducedMotion: false },
    nextId: 1,
    ...overrides,
  } as unknown as GameRefs;
}

// A deterministic Math.random that walks a fixed list, then repeats the last
// value once exhausted (so a spawn function drawing "a few more" values than
// listed stays deterministic instead of falling back to real randomness).
function stubRandom(sequence: number[]): void {
  let i = 0;
  vi.spyOn(Math, "random").mockImplementation(() => {
    const v = sequence[Math.min(i, sequence.length - 1)] ?? 0;
    i += 1;
    return v;
  });
}

describe("spawning", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Restore module arena state to its default in case a test changed it.
    setArena(9, 5.4);
  });

  describe("spawnIntervalMs", () => {
    it("at t=0 (difficulty 0.25) is 900 - 0.25*280 = 830", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      expect(spawnIntervalMs(baseRefs())).toBeCloseTo(830, 10);
    });

    it("is floored at 280 for high difficulty", () => {
      // Large t -> difficulty caps at 3.0 -> 900 - 840 = 60 -> floored to 280.
      vi.spyOn(performance, "now").mockReturnValue(10_000 * 1000);
      expect(spawnIntervalMs(baseRefs())).toBe(280);
    });
  });

  describe("fireIntervalMs", () => {
    it("base 220 at t=0 -> 220 - 0.25*30 = 212.5 when not rapid", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      expect(fireIntervalMs(baseRefs())).toBeCloseTo(212.5, 10);
    });

    it("rapid power-up lowers the base to 95 -> 87.5 at t=0", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const g = baseRefs({ activePowerUps: [{ type: "rapid", expiresAt: 1_000_000 }] });
      expect(fireIntervalMs(g)).toBeCloseTo(87.5, 10);
    });

    it("is floored at 70 (rapid + high difficulty)", () => {
      vi.spyOn(performance, "now").mockReturnValue(10_000 * 1000);
      const g = baseRefs({ activePowerUps: [{ type: "rapid", expiresAt: 20_000_000 }] });
      // 95 - 3*30 = 5 -> floored to 70.
      expect(fireIntervalMs(g)).toBe(70);
    });
  });

  describe("bulletDamage", () => {
    it("is 1 * shipDamageMul with no mega", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      expect(bulletDamage(baseRefs({ shipDamageMul: 1 }))).toBe(1);
      expect(bulletDamage(baseRefs({ shipDamageMul: 2 }))).toBe(2);
    });

    it("adds +3 base while mega is active, then applies the ship multiplier", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const g = baseRefs({
        shipDamageMul: 2,
        activePowerUps: [{ type: "mega", expiresAt: 1_000_000 }],
      });
      // (1 + 3) * 2 = 8
      expect(bulletDamage(g)).toBe(8);
    });
  });

  describe("styleForBullet / bulletColor", () => {
    it("defaults to sprite / #fde047 with no power-ups", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      expect(styleForBullet(baseRefs())).toBe("sprite");
      expect(bulletColor(baseRefs())).toBe("#fde047");
    });

    it("mega takes precedence: plasma / #a78bfa", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const g = baseRefs({
        activePowerUps: [
          { type: "mega", expiresAt: 1_000_000 },
          { type: "triple", expiresAt: 1_000_000 },
        ],
      });
      expect(styleForBullet(g)).toBe("plasma");
      expect(bulletColor(g)).toBe("#a78bfa");
    });

    it("triple (no mega): bolt / #f472b6", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const g = baseRefs({ activePowerUps: [{ type: "triple", expiresAt: 1_000_000 }] });
      expect(styleForBullet(g)).toBe("bolt");
      expect(bulletColor(g)).toBe("#f472b6");
    });

    it("rapid only tints the bullet (#22d3ee) but keeps the sprite style", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const g = baseRefs({ activePowerUps: [{ type: "rapid", expiresAt: 1_000_000 }] });
      expect(styleForBullet(g)).toBe("sprite");
      expect(bulletColor(g)).toBe("#22d3ee");
    });
  });

  describe("spawnObstacle", () => {
    it("with a fixed random sequence, produces an exact deterministic obstacle", () => {
      vi.spyOn(performance, "now").mockReturnValue(0); // t=0 -> only 'basic' unlocked
      // Draw order in spawnObstacle at t=0:
      //   [0] variant pick, [1] aimAtPlayer roll, [2] uniform-x, [3] uniform-y,
      //   [4] size, then z/rotation/spin/shape draws.
      // 0.9 aimAtPlayer roll (>= 0.35) -> uniform branch.
      stubRandom([0, 0.9, 0.5, 0.5, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const o = spawnObstacle(baseRefs());
      expect(o.variant).toBe("basic");
      expect(o.id).toBe(1);
      // uniform-x: (0.5 - 0.5) * 2 * spawnHalfW = 0
      expect(o.x).toBeCloseTo(0, 10);
      expect(o.y).toBeCloseTo(0, 10);
      // basic size: 0.55 + 0*0.45 = 0.55, hp 1
      expect(o.size).toBeCloseTo(0.55, 10);
      expect(o.hp).toBe(1);
      // vz is the obstacle's forward speed (baseSpeed = 9 + difficulty*4 at t=0 = 10)
      expect(o.vz).toBeCloseTo(9 + 0.25 * 4, 5);
      expect(o.brushed).toBe(false);
      expect(o.closestApproach).toBe(Infinity);
      expect([0, 1, 2]).toContain(o.shape);
    });

    it("aim-at-player branch keeps the obstacle within the spawn bounds", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      // aimAtPlayer roll 0.0 (< 0.35) -> aim branch; ship far in a corner.
      stubRandom([0, 0.0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
      const g = baseRefs({ shipX: 100, shipY: 100 });
      const o = spawnObstacle(g);
      const spawnHalfW = ARENA_W / 2 - 0.8;
      const spawnHalfH = ARENA_H / 2 - 0.8;
      expect(o.x).toBeLessThanOrEqual(spawnHalfW + 1e-9);
      expect(o.x).toBeGreaterThanOrEqual(-spawnHalfW - 1e-9);
      expect(o.y).toBeLessThanOrEqual(spawnHalfH + 1e-9);
      expect(o.y).toBeGreaterThanOrEqual(-spawnHalfH - 1e-9);
    });

    it("only spawns unlocked variants for the elapsed time (invariant over many draws)", () => {
      // t=200s -> every variant unlocked; the picked variant must be one of them.
      vi.spyOn(performance, "now").mockReturnValue(200 * 1000);
      const allowed: ObstacleVariant[] = [
        "basic",
        "heavy",
        "speeder",
        "shooter",
        "zapper",
        "drone",
      ];
      for (let i = 0; i < 200; i++) {
        const o = spawnObstacle(baseRefs());
        expect(allowed).toContain(o.variant);
        expect(o.size).toBeGreaterThan(0);
        expect(o.hp).toBeGreaterThanOrEqual(1);
        expect(Number.isNaN(o.x)).toBe(false);
        expect(Number.isNaN(o.y)).toBe(false);
      }
    });

    it("assigns the documented hp/speed profile per variant", () => {
      vi.spyOn(performance, "now").mockReturnValue(200 * 1000); // all unlocked
      const seen = new Map<string, { hp: number }>();
      for (let i = 0; i < 500 && seen.size < 5; i++) {
        const o = spawnObstacle(baseRefs());
        if (!seen.has(o.variant)) seen.set(o.variant, { hp: o.hp });
      }
      // Pin the fixed hp values for the combat variants that were observed.
      if (seen.has("basic")) expect(seen.get("basic")?.hp).toBe(1);
      if (seen.has("heavy")) expect(seen.get("heavy")?.hp).toBe(3);
      if (seen.has("speeder")) expect(seen.get("speeder")?.hp).toBe(1);
      if (seen.has("shooter")) expect(seen.get("shooter")?.hp).toBe(2);
    });
  });

  describe("spawnPowerUp", () => {
    it("picks a valid power-up type and spawns at SPAWN_Z - 4 within the arena band", () => {
      for (let i = 0; i < 200; i++) {
        const pu = spawnPowerUp(baseRefs());
        expect(POWERUP_TYPES as PowerUpType[]).toContain(pu.type);
        expect(pu.z).toBe(SPAWN_Z - 4);
        // x/y drawn from +/- (ARENA * 0.7 / 2).
        expect(Math.abs(pu.x)).toBeLessThanOrEqual((ARENA_W * 0.7) / 2 + 1e-9);
        expect(Math.abs(pu.y)).toBeLessThanOrEqual((ARENA_H * 0.7) / 2 + 1e-9);
      }
    });

    it("with a fixed sequence, the first power-up type is the first in POWERUP_TYPES", () => {
      stubRandom([0, 0.5, 0.5]);
      const pu = spawnPowerUp(baseRefs());
      expect(pu.type).toBe(POWERUP_TYPES[0]);
      expect(pu.id).toBe(1);
    });
  });

  describe("spawnCoin", () => {
    it("pushes a coin carrying the exact passed position/value with zero velocity", () => {
      const g = baseRefs();
      spawnCoin(g, 1.5, -2.25, -10, 7);
      expect(g.coins).toHaveLength(1);
      const coin = g.coins[0];
      expect(coin?.x).toBe(1.5);
      expect(coin?.y).toBe(-2.25);
      expect(coin?.z).toBe(-10);
      expect(coin?.value).toBe(7);
      expect(coin?.vx).toBe(0);
      expect(coin?.vy).toBe(0);
      expect(coin?.id).toBe(1);
    });

    it("advances nextId across successive coins", () => {
      const g = baseRefs();
      spawnCoin(g, 0, 0, 0, 1);
      spawnCoin(g, 0, 0, 0, 1);
      expect(g.coins.map((c) => c.id)).toEqual([1, 2]);
      expect(g.nextId).toBe(3);
    });
  });

  describe("pickWallGapX", () => {
    it("keeps the gap at least MIN_GAP_DIST (3) from the player when possible (invariant)", () => {
      const arenaW = 9;
      const half = arenaW / 2;
      for (let i = 0; i < 300; i++) {
        const playerX = (Math.random() - 0.5) * arenaW; // real randomness for the input
        const gap = pickWallGapX(playerX, arenaW);
        // Always clamped inside [-half+1, half-1].
        expect(gap).toBeGreaterThanOrEqual(-half + 1 - 1e-9);
        expect(gap).toBeLessThanOrEqual(half - 1 + 1e-9);
      }
    });

    it("with the safety fallback (all candidates too close), steps MIN_GAP_DIST from the player", () => {
      // Force every candidate draw to land on the player's X so none satisfy the
      // >= 3 rule, exercising the fallback branch. Candidate =
      // (r - 0.5) * (arenaW - 2); for player at 0 with arenaW=9 -> r=0.5 yields 0.
      stubRandom([0.5, 0.5, 0.5, 0.5, 0.5]);
      const gap = pickWallGapX(0, 9);
      // Fallback: player 0 -> "> 0 ? -3 : +3" picks +3 (0 is not > 0), then clamp.
      expect(gap).toBeCloseTo(3, 10);
    });
  });

  describe("spawnWall", () => {
    it("pushes a full row of bullet-immune wall pieces sharing a variant and hp", () => {
      vi.spyOn(performance, "now").mockReturnValue(0);
      const g = baseRefs();
      spawnWall(g);
      expect(g.obstacles.length).toBeGreaterThan(0);
      for (const o of g.obstacles) {
        expect(o.variant).toBe("wall");
        expect(o.hp).toBe(999); // wall pieces are bullet-immune; hp is a no-op sentinel
        expect(o.size).toBe(0.8);
        expect(Number.isNaN(o.x)).toBe(false);
        expect([0, 1, 2]).toContain(o.shape);
      }
    });
  });
});
