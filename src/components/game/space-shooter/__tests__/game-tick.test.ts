import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createRefs, startRun } from "../run-init";
import { runTick } from "../game-tick";
import type { GameRefs, Viewport, Obstacle } from "../types";
import { MAX_OBSTACLES } from "../types";
import { WALL_PIECES } from "../spawning";

// Smoke-level characterization for runTick: build the smallest valid live state
// via the run-init helpers, drive a handful of ticks with fixed inputs, and pin
// the invariants that must hold regardless of the (randomized) spawn/AI paths --
// no throw, time advances, and the key numeric fields never go NaN/Infinity.
// This deliberately does NOT assert on rendering or exact spawn counts; those
// depend on Math.random and are out of scope for a smoke test.

const VIEWPORT: Viewport = { width: 1200, height: 700 };

function stubMatchMedia(): void {
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
}

// The numeric ship/run fields that must stay finite for the loop to be sane.
function assertFinite(g: GameRefs): void {
  const fields: Array<keyof GameRefs> = [
    "now",
    "distance",
    "score",
    "kills",
    "combo",
    "shipX",
    "shipY",
    "shipZ",
    "shipRotZ",
    "nextBiomeAt",
    "nextWallAt",
  ];
  for (const key of fields) {
    const v = g[key] as number;
    expect(Number.isFinite(v), `${String(key)} should be finite, got ${v}`).toBe(true);
  }
}

describe("runTick smoke", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("advances several ticks on a live run without throwing", () => {
    const g = createRefs();
    startRun(g);

    // Advance a virtual clock so `performance.now()` moves forward across ticks
    // (difficulty/spawn timers key off it). Start at the run's startedAt.
    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    expect(() => {
      for (let i = 0; i < 20; i++) {
        clock += 16; // ~60fps
        runTick(
          g,
          0.016,
          VIEWPORT,
          () => {},
          () => {},
        );
      }
    }).not.toThrow();

    spy.mockRestore();

    expect(g.status).toBe("playing"); // no death expected from empty inputs
    assertFinite(g);
    // now is synced to the (stubbed) clock each tick.
    expect(g.now).toBe(g.startedAt + 20 * 16);
  });

  it("keeps ship coordinates finite while it steers toward a moving target", () => {
    const g = createRefs();
    startRun(g);
    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    for (let i = 0; i < 30; i++) {
      clock += 16;
      // Wiggle the target so the steering integration runs both directions.
      g.targetX = i % 2 === 0 ? 3 : -3;
      g.targetY = i % 2 === 0 ? -2 : 2;
      runTick(
        g,
        0.016,
        VIEWPORT,
        () => {},
        () => {},
      );
      assertFinite(g);
    }

    spy.mockRestore();
    expect(Number.isNaN(g.shipX)).toBe(false);
    expect(Number.isNaN(g.shipY)).toBe(false);
  });

  it("tolerates a large dt by clamping the physics step (no explosion to NaN)", () => {
    const g = createRefs();
    startRun(g);
    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);

    // Pass an absurd dt (2 seconds); runTick clamps step to <= 0.05 internally.
    expect(() => {
      clock += 2000;
      runTick(
        g,
        2,
        VIEWPORT,
        () => {},
        () => {},
      );
    }).not.toThrow();

    spy.mockRestore();
    assertFinite(g);
  });

  it("does not advance simulation while paused", () => {
    const g = createRefs();
    startRun(g);
    g.status = "paused";
    const distanceBefore = g.distance;

    let clock = g.startedAt;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    expect(() => {
      for (let i = 0; i < 5; i++) {
        clock += 16;
        runTick(
          g,
          0.016,
          VIEWPORT,
          () => {},
          () => {},
        );
      }
    }).not.toThrow();
    spy.mockRestore();

    // Distance accrues only while 'playing'; paused ticks must not move it.
    expect(g.distance).toBe(distanceBefore);
    expect(g.status).toBe("paused");
  });
});

// ---------- targeted behavior pins for the pass-3 gameplay fixes ----------

function makeObstacle(overrides: Partial<Obstacle>): Obstacle {
  return {
    id: 1,
    variant: "basic",
    x: 0,
    y: 0,
    z: -30,
    rx: 0,
    ry: 0,
    rz: 0,
    rsx: 0,
    rsy: 0,
    rsz: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    size: 0.6,
    hp: 1,
    shape: 0,
    closestApproach: Infinity,
    brushed: false,
    ...overrides,
  };
}

// Start a run and neutralize the start-of-run invulnerability window so the
// collision paths under test are actually reachable on the first tick.
function startVulnerableRun(g: GameRefs, clock: number): void {
  startRun(g);
  g.invulnUntil = clock - 1;
}

describe("zapper beam hitbox", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function tickWithZapper(shipY: number): GameRefs {
    const g = createRefs();
    let clock = 100_000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    startVulnerableRun(g, clock);
    // id 1 gives cycleAge = 317 + dt on the first tick: safely inside the
    // 1100ms beam-on phase of the 2500ms cycle.
    g.obstacles.push(makeObstacle({ id: 1, variant: "zapper", x: 0, y: 0, z: 0, hp: 3 }));
    g.shipX = 0;
    g.targetX = 0;
    g.shipY = shipY;
    g.targetY = shipY;
    clock += 16;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    spy.mockRestore();
    return g;
  }

  it("kills the ship inside the drawn beam column", () => {
    const g = tickWithZapper(0);
    expect(g.status).toBe("dying");
  });

  it("does NOT kill the ship vertically outside the drawn beam (6 units tall)", () => {
    // The rendered beam is a 6-unit box centered on the zapper: |dy| < 3.
    // A ship 4 units above must survive — previously it died to an
    // invisible full-height hitbox.
    const g = tickWithZapper(4);
    expect(g.status).toBe("playing");
  });
});

describe("homing boss projectiles", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("re-aims with a bounded turn rate instead of snapping onto the ship", () => {
    const g = createRefs();
    let clock = 100_000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    startVulnerableRun(g, clock);
    // Projectile far from the ship, currently moving perpendicular to the
    // pursuit direction (+y while the ship sits at +z from it).
    g.bossProjectiles.push({
      id: 1,
      position: [0, 0, -10],
      velocity: [0, 9, 0],
      radius: 0.3,
      color: "#fff",
      spawnedAt: clock,
      ttlMs: 100_000,
      homing: true,
      shielded: false,
    });
    clock += 16;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    spy.mockRestore();
    const p = g.bossProjectiles[0];
    expect(p).toBeDefined();
    const [vx, vy, vz] = p!.velocity;
    const speed = Math.hypot(vx, vy, vz);
    // Speed is preserved.
    expect(speed).toBeCloseTo(9, 1);
    // Direction may rotate at most ~turnRate * dt (plus slack); a 90-degree
    // instant snap (the old behavior) must be impossible.
    const dot = vy / speed; // cos(angle vs the old +y heading)
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    expect(angle).toBeLessThan(0.2);
  });
});

describe("wall spawn budget", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("defers a due wall while the obstacle budget cannot absorb it, then fires it", () => {
    const g = createRefs();
    let clock = 100_000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    startRun(g);
    // Crowd the arena so a 15-piece wall would blow past MAX_OBSTACLES.
    for (let i = 0; i < MAX_OBSTACLES - 5; i++) {
      g.obstacles.push(makeObstacle({ id: 100 + i, z: -30 }));
    }
    g.nextWallAt = clock;
    clock += 16;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    // Deferred: no wall pieces yet, cap respected, timer still pending.
    expect(g.obstacles.filter((o) => o.variant === "wall")).toHaveLength(0);
    expect(g.obstacles.length).toBeLessThanOrEqual(MAX_OBSTACLES);

    // Drain the arena; the pending wall must now fire.
    g.obstacles.length = 0;
    clock += 16;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    spy.mockRestore();
    expect(g.obstacles.filter((o) => o.variant === "wall")).toHaveLength(WALL_PIECES);
    expect(g.nextWallAt).toBeGreaterThan(clock);
  });
});

describe("death impulse direction", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("knocks the wreck AWAY from the boss projectile that hit it", () => {
    const g = createRefs();
    let clock = 100_000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    startVulnerableRun(g, clock);
    // Projectile just right of the ship, overlapping.
    g.bossProjectiles.push({
      id: 1,
      position: [g.shipX + 0.2, g.shipY, g.shipZ],
      velocity: [0, 0, 0],
      radius: 0.3,
      color: "#fff",
      spawnedAt: clock,
      ttlMs: 100_000,
      homing: false,
      shielded: false,
    });
    clock += 16;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    spy.mockRestore();
    expect(g.status).toBe("dying");
    // Hit from the right — wreck must fly left, matching every other death path.
    expect(g.deathVelX).toBeLessThan(0);
  });
});

describe("death sequence explosions", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("fires each staged burst exactly once even when a frame skips its window", () => {
    const g = createRefs();
    let clock = 100_000;
    const spy = vi.spyOn(performance, "now").mockImplementation(() => clock);
    startRun(g);
    g.status = "dying";
    // Jump straight past the old 0.60-0.65s wall-clock window.
    g.dyingAt = clock - 700;
    g.explosions.length = 0;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    expect(g.explosions).toHaveLength(1);
    // Re-ticking inside the same stage must not double-fire.
    clock += 16;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    expect(g.explosions).toHaveLength(1);
    // Jump past the second window (1.4s) — the triple burst fires once.
    g.dyingAt = clock - 1600;
    runTick(
      g,
      0.016,
      VIEWPORT,
      () => {},
      () => {},
    );
    spy.mockRestore();
    expect(g.explosions).toHaveLength(4);
  });
});
