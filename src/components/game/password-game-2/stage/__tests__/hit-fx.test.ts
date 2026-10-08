import { describe, expect, it } from "vitest";
import type { GameState } from "../../engine/types";
import {
  HIT_STOP_MS,
  burstAt,
  hitKindFor,
  hitLanded,
  hitSnapshot,
  newPaintClock,
  requestHitStop,
  shakeFor,
  stepPaintClock,
  stepParticles,
} from "../hit-fx";

describe("burstAt", () => {
  it("spawns N particles from a point with deterministic velocities", () => {
    const a = burstAt(100, 50, 12, 1);
    const b = burstAt(100, 50, 12, 1);
    expect(a).toHaveLength(12);
    expect(a).toEqual(b);
    expect(a.every((p) => p.x === 100 && p.y === 50 && p.alpha === 1)).toBe(true);
    expect(new Set(a.map((p) => p.vx)).size).toBeGreaterThan(1);
  });

  it("a different seed sprays differently", () => {
    expect(burstAt(0, 0, 8, 1)).not.toEqual(burstAt(0, 0, 8, 2));
  });
});

describe("stepParticles", () => {
  it("particles move, fade out and are dropped after their life", () => {
    let ps = burstAt(0, 0, 6, 1);
    ps = stepParticles(ps, 100);
    expect(ps.every((p) => p.alpha < 1)).toBe(true);
    expect(ps.some((p) => p.x !== 0 || p.y !== 0)).toBe(true);
    ps = stepParticles(ps, 2_000);
    expect(ps).toHaveLength(0);
  });
});

describe("shakeFor", () => {
  it("shake scales with the hit's weight and caps", () => {
    expect(shakeFor("parasite-evict")).toBeLessThan(shakeFor("alien-hit"));
    expect(shakeFor("alien-hit")).toBeLessThan(shakeFor("missile-intercept"));
    expect(shakeFor("missile-intercept")).toBeLessThanOrEqual(14);
  });
});

describe("hitKindFor", () => {
  it("names the canvas targets and ignores everything else", () => {
    expect(hitKindFor({ kind: "alien", id: 1 })).toBe("alien-hit");
    expect(hitKindFor({ kind: "parasite", id: 2 })).toBe("parasite-evict");
    expect(hitKindFor({ kind: "missile", id: 3 })).toBe("missile-intercept");
    expect(hitKindFor({ kind: "cell", id: 4 })).toBeNull();
  });
});

describe("hitLanded", () => {
  const g = () =>
    ({
      version: 4,
      stats: { aliensDowned: 0, missilesIntercepted: 0 },
    }) as unknown as GameState;

  it("is true when the engine changed the run or counted a hit", () => {
    const a = g();
    const before = hitSnapshot(a);
    expect(hitLanded(before, a)).toBe(false);
    a.stats.aliensDowned += 1; // an alien downed without touching the cells
    expect(hitLanded(before, a)).toBe(true);
    const b = g();
    const snap = hitSnapshot(b);
    b.version += 1; // a parasite evicted
    expect(hitLanded(snap, b)).toBe(true);
    const c = g();
    const snapC = hitSnapshot(c);
    c.stats.missilesIntercepted += 1;
    expect(hitLanded(snapC, c)).toBe(true);
  });
});

describe("HIT_STOP_MS", () => {
  it("is a short beat", () => {
    expect(HIT_STOP_MS).toBe(60);
  });
});

describe("stepPaintClock", () => {
  it("follows real frame time when nothing has been hit", () => {
    const c = newPaintClock();
    expect(stepPaintClock(c, 1_000)).toBe(0);
    expect(c.paintMs).toBe(1_000);
    expect(stepPaintClock(c, 1_016)).toBe(16);
    expect(c.paintMs).toBe(1_016);
  });

  it("a hit holds the painters still for HIT_STOP_MS, then they run on", () => {
    const c = newPaintClock();
    stepPaintClock(c, 0);
    stepPaintClock(c, 16);
    requestHitStop(c);
    const held = c.paintMs;
    for (const t of [32, 48, 64]) expect(stepPaintClock(c, t)).toBe(0);
    expect(c.paintMs).toBe(held);
    // 32 + 60 = 92: the first frame past the stop moves again.
    expect(stepPaintClock(c, 96)).toBe(32);
    expect(c.paintMs).toBe(held + 32);
  });

  it("a long gap between frames is clamped, like the engine's tick", () => {
    const c = newPaintClock();
    stepPaintClock(c, 0);
    expect(stepPaintClock(c, 5_000)).toBe(100);
  });
});
