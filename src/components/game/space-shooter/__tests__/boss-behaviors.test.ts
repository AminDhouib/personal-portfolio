import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildBossSchedule,
  bossScheduleEntry,
  runHarvesterBehavior,
  spawnBoss,
  BOSS_BASE_HP,
} from "../boss-behaviors";
import { createRefs } from "../run-init";
import type { GameRefs } from "../types";

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

describe("boss schedule", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("returns the authored entries for indices inside the base schedule", () => {
    const schedule = buildBossSchedule();
    for (let i = 0; i < schedule.length; i++) {
      expect(bossScheduleEntry(schedule, i)).toEqual(schedule[i]);
    }
  });

  it("keeps producing entries past the end of the base schedule (endless recycling)", () => {
    const schedule = buildBossSchedule();
    const last = schedule[schedule.length - 1];
    expect(last).toBeDefined();
    const next = bossScheduleEntry(schedule, schedule.length);
    // The first recycled encounter must be reachable: further out than the
    // last authored one, but not absurdly far.
    expect(next.distance).toBeGreaterThan(last!.distance);
    expect(next.distance - last!.distance).toBeLessThanOrEqual(4000);
  });

  it("recycled entries have strictly increasing distances and valid boss ids", () => {
    const schedule = buildBossSchedule();
    let prev = 0;
    for (let i = 0; i < 40; i++) {
      const e = bossScheduleEntry(schedule, i);
      expect(e.distance).toBeGreaterThan(prev);
      expect(Object.keys(BOSS_BASE_HP)).toContain(e.bossId);
      prev = e.distance;
    }
  });

  it("scales boss HP by the recycle multiplier", () => {
    const g = createRefs();
    spawnBoss(g, "sentinel", 2);
    expect(g.boss).not.toBeNull();
    expect(g.boss!.hp).toBeCloseTo(BOSS_BASE_HP.sentinel * Math.pow(1.3, 2), 5);
  });
});

describe("harvester tractor beam cycle", () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  function makeHarvester(g: GameRefs, difficultyMult: number) {
    spawnBoss(g, "harvester", 0);
    const boss = g.boss!;
    boss.phase = "fighting";
    boss.phaseStartAt = 0;
    boss.difficultyMult = difficultyMult;
    return boss;
  }

  it("beam turns off within every cycle even at high difficulty multipliers", () => {
    const g = createRefs();
    // difficultyMult > 2 used to make CYCLE_MS < beam duration, so the beam
    // never turned off. The cycle must always contain an off phase.
    const boss = makeHarvester(g, 2.5);
    const observed: boolean[] = [];
    for (let now = 0; now <= 12_000; now += 100) {
      runHarvesterBehavior(g, boss, now, 0.1);
      observed.push(boss.tractorBeam!.active);
    }
    expect(observed).toContain(true);
    expect(observed).toContain(false);
  });
});
