// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { TICK } from "../../sim/config";
import { replay } from "../../sim/replay";
import { resetSim, S } from "../../sim/state";
import { step } from "../../sim/tick";
import { BOARD_S, play } from "../../sim/__tests__/scripted";
import {
  baseMix,
  DAILY_MAX_TICKS,
  DAILY_SEED_PREFIX,
  dailyReplayOptions,
  dailyRun,
  dayNumber,
  profileFor,
} from "../daily";
import { fnv1a } from "../../../password-game-2/engine/rng";
import { PROFILES } from "../profiles";

afterEach(() => resetSim({ seed: "after-daily" }));

function dayKeys(from: string, count: number): string[] {
  const start = Date.parse(`${from}T00:00:00Z`);
  return Array.from({ length: count }, (_unused, i) =>
    new Date(start + i * 86_400_000).toISOString().slice(0, 10),
  );
}

// The profile of each of the first 30 days from 2026-10-01. A day is a promise to the board:
// if this changes, every score ranked on those days changes meaning, so bump DAILY_SEED_PREFIX.
const FIRST_30_DAYS =
  "data-import launch-day data-import region-outage flash-sale region-outage data-import region-outage credential-stuffing flash-sale brownout credential-stuffing brownout flash-sale launch-day data-import launch-day data-import launch-day region-outage flash-sale region-outage credential-stuffing launch-day flash-sale launch-day credential-stuffing brownout credential-stuffing data-import";

describe("the recipe", () => {
  it("is versioned in the seed prefix and caps a run at 900 s", () => {
    expect(DAILY_SEED_PREFIX).toBe("failover-daily-v1-");
    expect(DAILY_MAX_TICKS).toBe(18000);
    expect(DAILY_MAX_TICKS * TICK).toBe(900);
  });

  it("has six profiles with distinct ids", () => {
    expect(PROFILES).toHaveLength(6);
    expect(new Set(PROFILES.map((p) => p.id)).size).toBe(6);
  });

  it("pins the profile of the first 30 days", () => {
    expect(
      dayKeys("2026-10-01", 30)
        .map((day) => profileFor(day).id)
        .join(" "),
    ).toBe(FIRST_30_DAYS);
  });

  it("reads a day key into the number the arcade carries, and refuses anything else", () => {
    expect(dayNumber("2026-10-09")).toBe(20261009);
    for (const bad of ["2026-1-09", "20261009", "2026-10-09T00:00", "", "tomorrow"]) {
      expect(() => dayNumber(bad), bad).toThrow(RangeError);
    }
  });
});

describe("dailyRun", () => {
  it("is pure: the same day twice is the same run, and building it touches nothing", () => {
    resetSim({ seed: "before-daily", mode: "survival" });
    const before = JSON.stringify(S.trafficDistribution);
    const a = dailyRun("2026-10-09");
    const b = dailyRun("2026-10-09");
    expect(a.seed).toBe(b.seed);
    expect(a.profile).toBe(b.profile);
    expect(a.scheduled.map((c) => c.tick)).toEqual(b.scheduled.map((c) => c.tick));
    expect(S.tick).toBe(0);
    expect(JSON.stringify(S.trafficDistribution)).toBe(before);
  });

  it("seeds each day from the prefix and the key, so two days differ", () => {
    expect(dailyRun("2026-10-09").seed).toBe("failover-daily-v1-2026-10-09");
    expect(dailyRun("2026-10-10").seed).not.toBe(dailyRun("2026-10-09").seed);
  });

  it("picks every profile at least once over 60 days", () => {
    const seen = new Set(dayKeys("2026-10-01", 60).map((day) => profileFor(day).id));
    expect([...seen].sort()).toEqual(PROFILES.map((p) => p.id).sort());
  });

  it("puts each step on the tick that is its second of game time", () => {
    for (const profile of PROFILES) {
      const day = dayKeys("2026-10-01", 400).find((d) => profileFor(d) === profile) ?? "";
      expect(day, profile.id).not.toBe("");
      expect(dailyRun(day).scheduled.map((c) => c.tick)).toEqual(
        profile.steps.map((s) => s.atSec / TICK),
      );
    }
  });
});

describe("each profile on the sim", () => {
  function dayOf(id: string): string {
    const day = dayKeys("2026-10-01", 400).find((d) => profileFor(d).id === id);
    if (!day) throw new Error(`no day for ${id}`);
    return day;
  }

  /** Play the day live: reset, set up, then make each call as the sim reaches its tick. */
  function live(day: string, untilTick: number) {
    const run = dailyRun(day);
    resetSim({ seed: run.seed, mode: "survival" });
    run.setup();
    const seen: Array<{ tick: number; event: string | null; mix: Record<string, number> }> = [];
    for (const call of run.scheduled) {
      if (call.tick > untilTick) break;
      // An empty board dies in seconds; hold the run up so the clock reaches the incident.
      while (S.tick < call.tick) {
        S.reputation = 100;
        S.money = 100_000;
        step(1);
      }
      call.run();
      seen.push({
        tick: S.tick,
        event: S.intervention.activeEvent,
        mix: { ...baseMix() } as Record<string, number>,
      });
    }
    return seen;
  }

  const total = (mix: Record<string, number>) => Object.values(mix).reduce((a, b) => a + b, 0);

  it("launch day opens tilted to pages and reads, and bursts at 120 s", () => {
    const run = dailyRun(dayOf("launch-day"));
    resetSim({ seed: run.seed, mode: "survival" });
    run.setup();
    expect(S.trafficDistribution.STATIC).toBeCloseTo(0.4, 9);
    expect(S.trafficDistribution.READ).toBeCloseTo(0.3, 9);
    expect(total(S.trafficDistribution as Record<string, number>)).toBeCloseTo(1, 9);
    const seen = live(dayOf("launch-day"), 99999);
    expect(seen.map((s) => [s.tick, s.event])).toEqual([[2400, "TRAFFIC_BURST"]]);
  });

  it("credential stuffing makes a third of the traffic hostile at 60 s", () => {
    const seen = live(dayOf("credential-stuffing"), 99999);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.tick).toBe(1200);
    expect(seen[0]?.mix.MALICIOUS).toBeCloseTo(0.35, 9);
    expect(total(seen[0]?.mix ?? {})).toBeCloseTo(1, 9);
  });

  it("region outage takes a node down at 180 s", () => {
    const seen = live(dayOf("region-outage"), 99999);
    expect(seen.map((s) => [s.tick, s.event])).toEqual([[3600, "SERVICE_OUTAGE"]]);
  });

  it("flash sale leans on writes and spikes costs at 90 s", () => {
    const run = dailyRun(dayOf("flash-sale"));
    resetSim({ seed: run.seed, mode: "survival" });
    run.setup();
    expect(S.trafficDistribution.WRITE).toBeCloseTo(0.3, 9);
    expect(live(dayOf("flash-sale"), 99999).map((s) => s.event)).toEqual(["COST_SPIKE"]);
  });

  it("brownout drops capacity at 150 s and bursts at 420 s", () => {
    const seen = live(dayOf("brownout"), 99999);
    expect(seen.map((s) => [s.tick, s.event])).toEqual([
      [3000, "CAPACITY_DROP"],
      [8400, "TRAFFIC_BURST"],
    ]);
  });

  it("data import opens on uploads and searches, then searches take over at 300 s", () => {
    const run = dailyRun(dayOf("data-import"));
    resetSim({ seed: run.seed, mode: "survival" });
    run.setup();
    expect(S.trafficDistribution.UPLOAD).toBeCloseTo(0.18, 9);
    expect(S.trafficDistribution.SEARCH).toBeCloseTo(0.18, 9);
    const seen = live(dayOf("data-import"), 99999);
    expect(seen[0]?.mix.SEARCH).toBeCloseTo(0.3, 9);
  });

  it("changes the run it is played in, and replays the same every time", () => {
    // The serverless board lasts 300 s, so every incident before that lands on a live run.
    const log = play("daily-board", "survival", BOARD_S, 0).log;
    for (const profile of PROFILES) {
      const day = dayOf(profile.id);
      const options = dailyReplayOptions(day);
      expect(options.seed).toBe(`${DAILY_SEED_PREFIX}${day}`);
      expect(options.mode).toBe("survival");
      const withDay = replay({ ...options, log, ticks: 6000 });
      const plain = replay({ seed: options.seed, mode: "survival", log, ticks: 6000 });
      expect(withDay.hash, profile.id).not.toBe(plain.hash);
      const again = replay({ ...dailyReplayOptions(day), log, ticks: 6000 });
      expect(again, profile.id).toEqual(withDay);
    }
  });
});

// The serialized profile table, hashed. A profile edit changes what a day means exactly as a
// seed change does, so it needs a new DAILY_SEED_PREFIX; change both together. The prefix names
// the table it was issued for, so an edit without a bump (or a bump without a new entry) fails.
const PROFILE_TABLE_HASHES: Record<string, number> = {
  "failover-daily-v1-": 2760215387,
};

describe("the profile table", () => {
  it("is the one the seed prefix was issued for", () => {
    expect(fnv1a(JSON.stringify(PROFILES))).toBe(PROFILE_TABLE_HASHES[DAILY_SEED_PREFIX]);
  });
});
