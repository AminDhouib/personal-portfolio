// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG, TICK } from "../config";
import { getUpkeepMultiplier } from "../economy";
import {
  endRandomEvent,
  triggerRandomEvent,
  updateMaliciousSpike,
  updateRandomEvents,
  updateTrafficShift,
} from "../events";
import { drainEvents, resetSim, S } from "../state";
import { step } from "../tick";
import type { SimEvent } from "../types";
import { rand } from "../rng";
import { place, resetWorld } from "./helpers";

// Pin the roll the sim makes so a test can choose which event or shift comes up.
const pin = vi.hoisted(() => ({ value: null as number | null }));
vi.mock("../rng", async (importOriginal) => {
  const real = await importOriginal<typeof import("../rng")>();
  return {
    ...real,
    rand: (stream: Parameters<typeof real.rand>[0]) => pin.value ?? real.rand(stream),
  };
});

beforeEach(() => {
  pin.value = null;
  resetWorld({ mode: "survival" });
});
afterEach(() => {
  pin.value = null;
  resetSim({ seed: "after-events" });
});

const warnings = (): string[] =>
  S.events.flatMap((e: SimEvent) => (e.kind === "warning" ? [e.key] : []));

describe("random events run on game time", () => {
  it("do not expire while game time stands still, however often they are checked", () => {
    S.elapsedGameTime = 100;
    triggerRandomEvent("COST_SPIKE", 30000);
    expect(S.intervention.activeEvent).toBe("COST_SPIKE");
    for (let i = 0; i < 1000; i++) updateRandomEvents(0);
    expect(S.intervention.activeEvent).toBe("COST_SPIKE");
  });

  it("expire after exactly their duration in game seconds", () => {
    S.elapsedGameTime = 100;
    triggerRandomEvent("COST_SPIKE", 30000);

    S.elapsedGameTime = 129.9;
    updateRandomEvents(0);
    expect(S.intervention.activeEvent).toBe("COST_SPIKE");

    S.elapsedGameTime = 130.1;
    updateRandomEvents(0);
    expect(S.intervention.activeEvent).toBe(null);
  });

  it("an outage lasts its 30 game seconds, stepped through the real loop", () => {
    const db = place("db");
    triggerRandomEvent("SERVICE_OUTAGE", 30000, db.id);
    expect(db.isDisabled).toBe(true);

    step(Math.round(29.9 / TICK));
    expect(db.isDisabled).toBe(true);
    step(Math.round(0.2 / TICK));
    expect(db.isDisabled).toBe(false);
    expect(S.intervention.activeEvent).toBe(null);
  });

  it("only one event runs at a time", () => {
    triggerRandomEvent("COST_SPIKE", 30000);
    triggerRandomEvent("TRAFFIC_BURST", 30000);
    expect(S.intervention.activeEvent).toBe("COST_SPIKE");
    expect(S.intervention.trafficBurstMultiplier).toBe(1);
  });

  it("a check starts an event only on a roll under 30%", () => {
    pin.value = 0.31;
    updateRandomEvents(CONFIG.survival.randomEvents.checkInterval);
    expect(S.intervention.activeEvent).toBe(null);
    pin.value = 0.29;
    updateRandomEvents(CONFIG.survival.randomEvents.checkInterval);
    expect(S.intervention.activeEvent).not.toBe(null);
  });

  it("random events are survival-only", () => {
    resetWorld({ mode: "sandbox" });
    pin.value = 0;
    updateRandomEvents(1000);
    expect(S.intervention.activeEvent).toBe(null);
  });
});

describe("what each event does, and undoes", () => {
  it("COST_SPIKE doubles upkeep, and ending it restores the price", () => {
    triggerRandomEvent("COST_SPIKE", 30000);
    expect(S.intervention.costMultiplier).toBe(2);
    expect(getUpkeepMultiplier()).toBeCloseTo(2, 10);
    endRandomEvent();
    expect(S.intervention.costMultiplier).toBe(1);
    expect(getUpkeepMultiplier()).toBeCloseTo(1, 10);
  });

  it("CAPACITY_DROP halves every service's capacity, then restores it", () => {
    const compute = place("compute");
    const capacity = compute.getEffectiveCapacity();
    triggerRandomEvent("CAPACITY_DROP", 30000);
    expect(compute.getEffectiveCapacity()).toBe(Math.floor(capacity * 0.5));
    endRandomEvent();
    expect(compute.getEffectiveCapacity()).toBe(capacity);
  });

  it("TRAFFIC_BURST triples the arrival rate, then restores it", () => {
    triggerRandomEvent("TRAFFIC_BURST", 30000);
    expect(S.intervention.trafficBurstMultiplier).toBe(3);
    endRandomEvent();
    expect(S.intervention.trafficBurstMultiplier).toBe(1);
  });

  it("SERVICE_OUTAGE takes a service out of routing and gives it back", () => {
    const db = place("db");
    triggerRandomEvent("SERVICE_OUTAGE", 30000, db.id);
    expect(S.intervention.outageServiceId).toBe(db.id);
    expect(db.isDisabled).toBe(true);
    expect(db.getEffectiveCapacity()).toBe(0);
    endRandomEvent();
    expect(db.isDisabled).toBe(false);
    expect(S.intervention.outageServiceId).toBe(null);
  });

  it("SERVICE_OUTAGE never picks the firewall", () => {
    const waf = place("waf");
    const db = place("db");
    for (const roll of [0, 0.4, 0.99]) {
      pin.value = roll;
      triggerRandomEvent("SERVICE_OUTAGE", 30000);
      expect(waf.isDisabled).toBe(false);
      expect(db.isDisabled).toBe(true);
      endRandomEvent();
    }
  });

  it("SERVICE_OUTAGE with nothing to take down is inert, not an error", () => {
    place("waf");
    triggerRandomEvent("SERVICE_OUTAGE", 30000);
    expect(S.intervention.outageServiceId).toBe(null);
    expect(S.events).toContainEqual({
      kind: "event-start",
      event: "SERVICE_OUTAGE",
      serviceId: null,
    });
    endRandomEvent();
  });

  it("tells the view with keys, never prose", () => {
    const db = place("db");
    drainEvents();
    triggerRandomEvent("SERVICE_OUTAGE", 30000, db.id);
    endRandomEvent();
    expect(S.events).toEqual([
      { kind: "warning", key: "service_outage_warning", level: "danger", params: { type: "db" } },
      { kind: "event-start", event: "SERVICE_OUTAGE", serviceId: db.id },
      { kind: "event-end", event: "SERVICE_OUTAGE" },
      { kind: "warning", key: "event_ended", level: "info" },
    ]);
  });
});

describe("a run's events belong to that run", () => {
  it("a restart clears a live event and its effects", () => {
    S.elapsedGameTime = 400;
    triggerRandomEvent("TRAFFIC_BURST", 30000);
    expect(S.intervention.trafficBurstMultiplier).toBeGreaterThan(1);

    resetSim({ seed: "next-run", mode: "survival" });

    expect(S.intervention.activeEvent).toBe(null);
    expect(S.intervention.trafficBurstMultiplier).toBe(1);
    expect(S.intervention.costMultiplier).toBe(1);
    expect(S.intervention.eventEndTime).toBe(0);

    // The fresh run stays clean as its clock passes the old deadline.
    S.elapsedGameTime = 200;
    updateRandomEvents(0);
    expect(S.intervention.trafficBurstMultiplier).toBe(1);
  });

  it("a cost spike does not bill the next run", () => {
    S.elapsedGameTime = 250;
    triggerRandomEvent("COST_SPIKE", 30000);
    resetSim({ seed: "next-run", mode: "survival" });
    expect(getUpkeepMultiplier()).toBeCloseTo(1, 10);
  });
});

describe("the event schedule does not depend on what the player built", () => {
  function scheduleOf(build: () => void): Array<{ tick: number; event: string }> {
    resetWorld({ mode: "survival", seed: "daily-schedule" });
    build();
    drainEvents();
    const out: Array<{ tick: number; event: string }> = [];
    for (let t = 0; t < 12000; t += 100) {
      step(100);
      for (const e of drainEvents()) {
        if (e.kind === "event-start") out.push({ tick: S.tick, event: e.event });
      }
    }
    return out;
  }

  it("the same seed gives the same events at the same ticks, with or without a board", () => {
    const empty = scheduleOf(() => {});
    const built = scheduleOf(() => {
      place("alb");
      place("compute");
      place("db");
      place("s3");
    });
    expect(empty.length).toBeGreaterThan(0);
    expect(built).toEqual(empty);
  });

  it("a different seed gives a different schedule", () => {
    const a = scheduleOf(() => {});
    resetWorld({ mode: "survival", seed: "another-day" });
    const other: Array<{ tick: number; event: string }> = [];
    for (let t = 0; t < 12000; t += 100) {
      step(100);
      for (const e of drainEvents()) {
        if (e.kind === "event-start") other.push({ tick: S.tick, event: e.event });
      }
    }
    expect(other).not.toEqual(a);
  });
});

describe("traffic shifts", () => {
  const SHIFT = CONFIG.survival.trafficShift;

  it("start after the interval, swap the mix, and restore it when they end", () => {
    const base = { ...S.trafficDistribution };
    updateTrafficShift(SHIFT.interval - 1);
    expect(S.intervention.trafficShiftActive).toBe(false);
    updateTrafficShift(1);
    expect(S.intervention.trafficShiftActive).toBe(true);
    expect(S.trafficDistribution).not.toEqual(base);
    expect(warnings()).toContain("traffic_surging");

    updateTrafficShift(SHIFT.duration - 1);
    expect(S.intervention.trafficShiftActive).toBe(true);
    updateTrafficShift(1);
    expect(S.intervention.trafficShiftActive).toBe(false);
    expect(S.trafficDistribution).toEqual(base);
    expect(S.intervention.originalTrafficDist).toBe(null);
    expect(S.intervention.currentShift).toBe(null);
  });

  it("every shift's mix sums to 1", () => {
    for (const shift of SHIFT.shifts) {
      const total = Object.values(shift.distribution).reduce((a, b) => a + b, 0);
      expect(total, shift.name).toBeCloseTo(1, 9);
    }
  });

  it("a shift that needs a service joins the rotation only once the player owns one", () => {
    pin.value = 0.999; // the last eligible shift
    updateTrafficShift(SHIFT.interval);
    expect(S.intervention.currentShift?.name).toBe("Full-Text Flood");

    resetWorld({ mode: "survival" });
    place("gpu");
    pin.value = 0.999;
    updateTrafficShift(SHIFT.interval);
    expect(S.intervention.currentShift?.name).toBe("AI Hype Wave");
  });

  it("the pick always consumes the same draws, owned service or not", () => {
    // Same seed, with and without a gpu: the events stream must stand in the
    // same place after a shift starts, or the day would depend on the build.
    const next = (withGpu: boolean): number => {
      resetWorld({ mode: "survival", seed: "shift-draws" });
      if (withGpu) place("gpu");
      updateTrafficShift(SHIFT.interval);
      return rand("events");
    };
    expect(next(false)).toBe(next(true));
  });

  it("does not run in sandbox", () => {
    resetWorld({ mode: "sandbox" });
    updateTrafficShift(1000);
    expect(S.intervention.trafficShiftActive).toBe(false);
  });
});

describe("the malicious spike", () => {
  const ticks = (seconds: number): number => Math.round(seconds / TICK);

  function runSpikeTicks(n: number): void {
    for (let i = 0; i < n; i++) updateMaliciousSpike();
  }

  it("warns three seconds ahead, starts at 45 s, ends at 57 s", () => {
    runSpikeTicks(ticks(42) - 1);
    expect(warnings()).not.toContain("ddos_incoming");
    runSpikeTicks(1);
    expect(warnings()).toContain("ddos_incoming");

    runSpikeTicks(ticks(45) - ticks(42) - 1);
    expect(S.maliciousSpikeActive).toBe(false);
    runSpikeTicks(1);
    expect(S.maliciousSpikeActive).toBe(true);

    runSpikeTicks(ticks(12) - 1);
    expect(S.maliciousSpikeActive).toBe(true);
    runSpikeTicks(1);
    expect(S.maliciousSpikeActive).toBe(false);
  });

  it("swaps in a half-malicious mix and restores the original afterwards", () => {
    const base = { ...S.trafficDistribution };
    runSpikeTicks(ticks(45));
    const total = Object.values(S.trafficDistribution).reduce((a, b) => a + b, 0);
    expect(S.trafficDistribution.MALICIOUS).toBeCloseTo(
      CONFIG.survival.maliciousSpike.maliciousPercent,
      9,
    );
    expect(total).toBeCloseTo(1, 9);
    runSpikeTicks(ticks(12));
    expect(S.trafficDistribution).toEqual(base);
    expect(S.normalTrafficDist).toBe(null);
  });

  it("repeats every 45 s", () => {
    runSpikeTicks(ticks(45) + ticks(12) + ticks(33) - 1);
    expect(S.maliciousSpikeActive).toBe(false);
    runSpikeTicks(1);
    expect(S.maliciousSpikeActive).toBe(true);
  });

  it("waits for the next cycle when a traffic shift is on", () => {
    S.intervention.trafficShiftActive = true;
    runSpikeTicks(ticks(45) + ticks(12));
    expect(S.maliciousSpikeActive).toBe(false);
  });

  it("is not suppressed by a shift left over from a run that ended", () => {
    S.intervention.trafficShiftActive = true;
    S.intervention.originalTrafficDist = { STATIC: 0.99, READ: 0.01 };
    resetSim({ seed: "next-run", mode: "survival" });
    runSpikeTicks(ticks(45));
    expect(S.maliciousSpikeActive).toBe(true);
  });

  it("an all-malicious mix does not divide by zero", () => {
    S.trafficDistribution = { MALICIOUS: 1 };
    runSpikeTicks(ticks(45));
    expect(S.trafficDistribution).toEqual({ MALICIOUS: 1 });
  });

  it("does not run in sandbox", () => {
    resetWorld({ mode: "sandbox" });
    runSpikeTicks(ticks(100));
    expect(S.maliciousSpikeActive).toBe(false);
    expect(S.maliciousSpikeTicks).toBe(0);
  });

  it("the cycle lengths are whole ticks", () => {
    for (const seconds of [
      CONFIG.survival.maliciousSpike.interval,
      CONFIG.survival.maliciousSpike.duration,
      CONFIG.survival.maliciousSpike.warningTime,
    ]) {
      expect(Math.abs(seconds / TICK - Math.round(seconds / TICK))).toBeLessThan(1e-9);
    }
  });
});
