// @vitest-environment node
// Auto-Scaling Group: capacity multiplication with cold start, the scale-out and
// scale-in rules (threshold, sustain, cooldown, hysteresis, bounds), fleet upkeep,
// the satellite ring the view draws, and the queue-depth scaling signal.
//
// Utilization is driven by shadowing the totalLoad getter on the instance: the
// engine reads exactly that one number, so this pins the input without hand-building
// queues of half-valid requests. The traffic-driven cases at the bottom exercise the
// real path end to end.
//
// Ported from upstream's autoscaling suite. Its pause case (timeScale 0) is dropped:
// the sim has no timeScale, a paused game simply does not step. Its save/load and
// satellite-mesh cases are dropped with the persistence layer and the meshes; the
// satellite ring is checked as snapshot data instead.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  canAutoscale,
  instanceCount,
  satellitesOf,
  toggleAutoscaling,
  updateAutoscaling,
  upkeepInstanceFactor,
  upstreamQueuePressure,
  warmingCount,
} from "../autoscaling";
import { CONFIG, TICK } from "../config";
import type { Service } from "../service";
import { snapshot } from "../snapshot";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { connect, inject, pinLoad, place, resetWorld, run } from "./helpers";

const ASG = CONFIG.autoscaling;
// Every autoscaling timer counts whole ticks; these are the config's seconds in ticks.
const WARMUP_TICKS = Math.round(ASG.warmupSec / TICK);

beforeEach(() => resetWorld());
afterEach(() => resetSim({ seed: "after-autoscaling" }));

// Feed the engine `seconds` of game time, one tick at a time.
function tick(service: Service, seconds: number): void {
  const n = Math.round(seconds / TICK);
  for (let i = 0; i < n; i++) updateAutoscaling(service);
}

function asg(): Service {
  const c = place("compute");
  toggleAutoscaling(c);
  return c;
}

function remaining(service: Service): number {
  const first = service.warming[0];
  if (first === undefined) throw new Error("no instance is warming");
  return first;
}

describe("defaults and gating", () => {
  it("a fresh Compute has ASG off with a single instance", () => {
    const c = place("compute");
    expect(c.asgEnabled).toBe(false);
    expect(c.instances).toBe(1);
    expect(c.warming).toEqual([]);
    expect(instanceCount(c)).toBe(1);
  });

  it("only Compute and the Container Cluster can autoscale", () => {
    expect(canAutoscale(place("compute"))).toBe(true);
    expect(canAutoscale(place("container"))).toBe(true);
    expect(canAutoscale(place("db"))).toBe(false);
    expect(canAutoscale(place("serverless"))).toBe(false);
  });

  it("toggling a service that cannot autoscale is refused", () => {
    const db = place("db");
    expect(toggleAutoscaling(db)).toBe(false);
    expect(db.asgEnabled).toBe(false);
  });

  it("a non-ASG Compute never scales, however hot it runs", () => {
    const c = place("compute");
    pinLoad(c, 1.5);
    tick(c, 30);
    expect(instanceCount(c)).toBe(1);
  });

  it("toggling off collapses the fleet back to one instance", () => {
    const c = asg();
    pinLoad(c, 0.95);
    tick(c, 30);
    expect(instanceCount(c)).toBeGreaterThan(1);

    toggleAutoscaling(c);
    expect(c.asgEnabled).toBe(false);
    expect(c.instances).toBe(1);
    expect(c.warming).toEqual([]);
    expect(satellitesOf(c)).toEqual([]);
  });
});

describe("capacity", () => {
  it("is untouched for a service with one instance", () => {
    const c = place("compute");
    expect(c.getEffectiveCapacity()).toBe(CONFIG.services.compute.capacity);
  });

  it("multiplies by the number of READY instances", () => {
    const c = asg();
    c.instances = 3;
    expect(c.getEffectiveCapacity()).toBe(CONFIG.services.compute.capacity * 3);
  });

  it("gives warming instances no capacity at all (cold start)", () => {
    const c = asg();
    c.warming.push(WARMUP_TICKS);
    expect(instanceCount(c)).toBe(2);
    expect(c.getEffectiveCapacity()).toBe(CONFIG.services.compute.capacity);
  });

  it("applies the fleet multiplier before the health reduction", () => {
    resetWorld({ mode: "survival" });
    const c = asg();
    c.instances = 2;
    const critical = CONFIG.survival.degradation.criticalHealth;
    c.health = critical / 2; // => factor 0.3 + 0.7 * 0.5
    const base = CONFIG.services.compute.capacity * 2;
    expect(c.getEffectiveCapacity()).toBe(Math.floor(base * 0.65));
    // ...and the same node with one instance gets exactly half of it.
    c.instances = 1;
    expect(c.getEffectiveCapacity()).toBe(Math.floor((base / 2) * 0.65));
  });

  it("still honours a temporary event capacity reduction", () => {
    const c = asg();
    c.instances = 4;
    c.tempCapacityReduction = 0.5;
    expect(c.getEffectiveCapacity()).toBe((CONFIG.services.compute.capacity * 4) / 2);
  });

  it("is zero for a disabled service no matter how wide the fleet", () => {
    const c = asg();
    c.instances = 5;
    c.isDisabled = true;
    expect(c.getEffectiveCapacity()).toBe(0);
  });

  it("totalLoad is utilization of the ready fleet, not of one box", () => {
    const c = place("compute");
    c.queue = Array.from({ length: CONFIG.services.compute.capacity * 2 }, () => null as never); // full
    expect(c.totalLoad).toBe(1);
    c.instances = 2;
    expect(c.totalLoad).toBe(0.5);
  });
});

describe("scale-out", () => {
  it("boots an instance after util holds above target for sustainSec", () => {
    const c = asg();
    pinLoad(c, ASG.targetUtil + 0.1);
    tick(c, ASG.sustainSec + 0.2);
    expect(warmingCount(c)).toBe(1);
    expect(c.instances).toBe(1); // still cold
  });

  it("does not scale out before the sustain window elapses", () => {
    const c = asg();
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec - 0.5);
    expect(instanceCount(c)).toBe(1);
  });

  it("does not scale out at or below the target utilization", () => {
    const c = asg();
    pinLoad(c, ASG.targetUtil);
    tick(c, 30);
    expect(instanceCount(c)).toBe(1);
  });

  it("the new instance becomes ready only after warmupSec", () => {
    const c = asg();
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec + 0.2);
    expect(c.instances).toBe(1);

    tick(c, ASG.warmupSec - 0.5);
    expect(c.instances).toBe(1); // still warming
    tick(c, 0.6);
    expect(c.instances).toBe(2);
    expect(warmingCount(c)).toBe(0);
  });

  it("capacity rises only once the instance is ready", () => {
    const c = asg();
    const base = CONFIG.services.compute.capacity;
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec + 0.2);
    expect(c.getEffectiveCapacity()).toBe(base);
    tick(c, ASG.warmupSec + 0.2);
    expect(c.getEffectiveCapacity()).toBe(base * 2);
  });

  it("a Container Cluster boots its node pool on the longer containerWarmupSec", () => {
    const c = place("container");
    toggleAutoscaling(c);
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec + 0.2);
    expect(warmingCount(c)).toBe(1);
    // Compute's 3 s warmup would be over by now; a node pool is not.
    tick(c, ASG.warmupSec + 0.5);
    expect(c.instances).toBe(1);
    tick(c, ASG.containerWarmupSec - ASG.warmupSec);
    expect(c.instances).toBe(2);
  });

  it("the cooldown gates the next scaling action", () => {
    const c = asg();
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec + 0.2);
    expect(instanceCount(c)).toBe(2);
    // Sustain elapses again well inside the cooldown: still no third box.
    tick(c, ASG.sustainSec + 0.2);
    expect(instanceCount(c)).toBe(2);
    tick(c, ASG.cooldownSec);
    expect(instanceCount(c)).toBe(3);
  });

  it("never exceeds maxInstances", () => {
    const c = asg();
    pinLoad(c, 2.0);
    tick(c, 300);
    expect(instanceCount(c)).toBe(ASG.maxInstances);
    expect(c.instances).toBe(ASG.maxInstances);
  });
});

describe("scale-in and hysteresis", () => {
  it("retires an instance after util holds below scaleInUtil", () => {
    const c = asg();
    c.instances = 3;
    pinLoad(c, ASG.scaleInUtil - 0.1);
    tick(c, ASG.sustainSec + 0.2);
    expect(c.instances).toBe(2);
  });

  it("scale-in is immediate: no warmup on the way down", () => {
    const c = asg();
    c.instances = 3;
    pinLoad(c, 0);
    tick(c, ASG.sustainSec + 0.2);
    expect(c.getEffectiveCapacity()).toBe(CONFIG.services.compute.capacity * 2);
  });

  it("does nothing inside the hysteresis band", () => {
    const c = asg();
    c.instances = 3;
    pinLoad(c, (ASG.targetUtil + ASG.scaleInUtil) / 2);
    tick(c, 60);
    expect(instanceCount(c)).toBe(3);
  });

  it("a dip into the band resets the scale-out streak (no flapping)", () => {
    const c = asg();
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec - 0.4);
    pinLoad(c, 0.5); // inside the band
    tick(c, 1);
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec - 0.4);
    expect(instanceCount(c)).toBe(1); // neither streak ever completed
  });

  it("cancels a warming boot before retiring a ready instance", () => {
    const c = asg();
    c.instances = 2;
    c.warming.push(WARMUP_TICKS);
    c.asgCooldown = 0;
    pinLoad(c, 0);
    tick(c, ASG.sustainSec + 0.2);
    expect(warmingCount(c)).toBe(0);
    expect(c.instances).toBe(2);
  });

  it("never drops below minInstances", () => {
    const c = asg();
    c.instances = 3;
    pinLoad(c, 0);
    tick(c, 300);
    expect(c.instances).toBe(ASG.minInstances);
  });
});

describe("a stopped run holds its fleet", () => {
  // Upstream froze the fleet at timeScale 0. The sim has no timeScale: the clock is
  // the tick, and a run that is not stepped has no time passing, so there is nothing
  // to pause. What is left to pin is that the warmup counts steps, not calls.
  it("a warming instance only advances when the engine is ticked", () => {
    const c = asg();
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec + 0.2);
    expect(warmingCount(c)).toBe(1);
    const before = remaining(c);

    expect(remaining(c)).toBe(before); // nothing ticked, nothing moved
    tick(c, 1);
    expect(remaining(c)).toBe(before - Math.round(1 / TICK));
  });
});

describe("upkeep", () => {
  it("is unchanged for a single-instance service", () => {
    expect(upkeepInstanceFactor(place("compute"))).toBe(1);
    expect(upkeepInstanceFactor(place("db"))).toBe(1);
  });

  it("bills every extra instance at instanceUpkeepFactor", () => {
    const c = asg();
    c.instances = 3;
    expect(upkeepInstanceFactor(c)).toBeCloseTo(1 + 2 * ASG.instanceUpkeepFactor, 10);
  });

  it("bills warming instances too (clouds charge from boot)", () => {
    const c = asg();
    c.warming.push(WARMUP_TICKS);
    expect(upkeepInstanceFactor(c)).toBeCloseTo(1 + ASG.instanceUpkeepFactor, 10);
  });

  it("Service.update charges the fleet through the byService bucket", () => {
    const c = asg();
    c.instances = 3;
    pinLoad(c, 0.5); // inside the band: no scaling noise during the charge
    S.upkeepEnabled = true;
    const before = S.money;
    const bucketBefore = S.finances.expenses.byService.compute ?? 0; // holds the build cost
    const upkeepBefore = S.finances.expenses.upkeep;

    c.update(TICK);

    const expected = (CONFIG.services.compute.upkeep / 60) * TICK * upkeepInstanceFactor(c);
    expect(before - S.money).toBeCloseTo(expected, 9);
    expect((S.finances.expenses.byService.compute ?? 0) - bucketBefore).toBeCloseTo(expected, 9);
    expect(S.finances.expenses.upkeep - upkeepBefore).toBeCloseTo(expected, 9);
  });
});

describe("the satellite ring (snapshot data, not meshes)", () => {
  it("has one satellite per extra instance, ready ones first", () => {
    const c = asg();
    expect(satellitesOf(c)).toHaveLength(0);
    c.instances = 3;
    c.warming.push(WARMUP_TICKS);
    const ring = satellitesOf(c);
    expect(ring).toHaveLength(3);
    expect(ring.map((s) => s.ready)).toEqual([true, true, false]);
  });

  it("spreads the slots evenly round the node, with the angle in radians", () => {
    const c = asg();
    c.instances = ASG.maxInstances;
    const ring = satellitesOf(c);
    const slots = ASG.maxInstances - 1;
    expect(ring).toHaveLength(slots);
    ring.forEach((s, i) => expect(s.angle).toBeCloseTo((i / slots) * Math.PI * 2, 12));
  });

  it("a slot keeps its angle as the fleet grows, so boxes never shuffle", () => {
    const c = asg();
    c.instances = 2;
    const first = satellitesOf(c)[0]?.angle;
    c.instances = 4;
    expect(satellitesOf(c)[0]?.angle).toBe(first);
  });

  it("is empty for a service that is not an auto-scaled fleet", () => {
    expect(satellitesOf(place("db"))).toEqual([]);
  });

  it("the snapshot carries it, and editing the copy never reaches the sim", () => {
    const c = asg();
    c.instances = 3;
    const snap = snapshot().services.find((s) => s.id === c.id);
    expect(snap?.satellites).toHaveLength(2);
    expect(snap?.asg).toBe(true);
    snap?.satellites.pop();
    expect(satellitesOf(c)).toHaveLength(2);
  });

  it("scaling out through the engine adds a not-yet-ready satellite, which turns ready", () => {
    const c = asg();
    pinLoad(c, 0.99);
    tick(c, ASG.sustainSec + 0.2);
    expect(satellitesOf(c).map((s) => s.ready)).toEqual([false]);
    tick(c, ASG.warmupSec + 0.2);
    expect(satellitesOf(c).map((s) => s.ready)).toEqual([true]);
  });
});

// Queue-depth scaling: the second scale-out signal. An SQS-fed fleet PULLS, capping
// its own intake at capacity, so its utilization never crosses targetUtil however deep
// the backlog gets: the engine must scale on the upstream queue's fill ratio instead.
describe("queue-depth scaling", () => {
  const THRESHOLD = CONFIG.autoscaling.queuePressureThreshold;

  // A compute fed by an SQS. Depth is pinned by stuffing the REAL arrays the signal
  // reads: updateAutoscaling alone never drains them, so the fill stays put.
  function sqsFed() {
    const sqs = place("sqs");
    const c = asg();
    connect(sqs, c);
    return { sqs, c };
  }

  function fillTo(sqs: Service, fraction: number): void {
    const max = sqs.config.maxQueueSize ?? 20;
    sqs.queue = Array.from({ length: Math.round(max * fraction) }, () => null as never);
    sqs.processing = [];
  }

  describe("discovery", () => {
    it("reads 0 for an ALB-push fleet (no upstream SQS)", () => {
      const alb = place("alb");
      const c = asg();
      connect(alb, c);
      expect(upstreamQueuePressure(c)).toBe(0);
    });

    it("is the fill ratio over queue + parked jobs", () => {
      const { sqs, c } = sqsFed();
      const max = sqs.config.maxQueueSize ?? 20;
      sqs.queue = Array.from({ length: 30 }, () => null as never);
      sqs.processing = Array.from({ length: 50 }, () => null as never); // "requeue-next" parked jobs
      expect(upstreamQueuePressure(c)).toBeCloseTo(80 / max, 10);
    });

    it("takes the MAX across several upstream queues", () => {
      const { sqs, c } = sqsFed();
      const sqs2 = place("sqs");
      connect(sqs2, c);
      fillTo(sqs, 0.1);
      fillTo(sqs2, 0.6);
      expect(upstreamQueuePressure(c)).toBeCloseTo(0.6, 10);
    });

    it("ignores an SQS that is not connected to this fleet", () => {
      const c = asg();
      const other = place("compute");
      const sqs = place("sqs");
      connect(sqs, other); // wired to a DIFFERENT compute
      fillTo(sqs, 1);
      expect(upstreamQueuePressure(c)).toBe(0);
    });

    it("ignores a disabled SQS: a frozen backlog no fleet can drain", () => {
      const { sqs, c } = sqsFed();
      fillTo(sqs, 1);
      sqs.isDisabled = true;
      expect(upstreamQueuePressure(c)).toBe(0);
    });

    it("still sees a queue whose breaker is open (the repro state)", () => {
      // A saturated SQS trips its own breaker; the backlog is real anyway.
      const { sqs, c } = sqsFed();
      fillTo(sqs, 0.5);
      sqs.breakerState = "open";
      expect(upstreamQueuePressure(c)).toBeCloseTo(0.5, 10);
    });
  });

  describe("scale-out on pressure", () => {
    it("boots an instance while util reads 0", () => {
      const { sqs, c } = sqsFed();
      pinLoad(c, 0);
      fillTo(sqs, THRESHOLD + 0.1);
      tick(c, ASG.sustainSec + 0.2);
      expect(warmingCount(c)).toBe(1);
    });

    it("does not fire at exactly the threshold (strict >)", () => {
      const { sqs, c } = sqsFed();
      pinLoad(c, 0);
      fillTo(sqs, THRESHOLD);
      tick(c, 30);
      expect(instanceCount(c)).toBe(1);
    });

    it("respects the sustain window like the util signal", () => {
      const { sqs, c } = sqsFed();
      pinLoad(c, 0);
      fillTo(sqs, THRESHOLD + 0.1);
      tick(c, ASG.sustainSec - 0.5);
      expect(instanceCount(c)).toBe(1);
      tick(c, 0.7);
      expect(instanceCount(c)).toBe(2);
    });

    it("feeds the SAME accumulator as utilization: the streaks add up", () => {
      const { sqs, c } = sqsFed();
      pinLoad(c, ASG.targetUtil + 0.2); // hot CPU for most of the window...
      tick(c, ASG.sustainSec - 0.5);
      expect(instanceCount(c)).toBe(1);
      pinLoad(c, 0); // ...then idle CPU but a deep queue for the rest
      fillTo(sqs, THRESHOLD + 0.1);
      tick(c, 0.7);
      expect(instanceCount(c)).toBe(2);
    });

    it("goes through the same cooldown gate", () => {
      const { sqs, c } = sqsFed();
      pinLoad(c, 0);
      fillTo(sqs, THRESHOLD + 0.1);
      tick(c, ASG.sustainSec + 0.2);
      expect(instanceCount(c)).toBe(2);
      tick(c, ASG.sustainSec + 0.2); // inside the cooldown: no third box
      expect(instanceCount(c)).toBe(2);
      tick(c, ASG.cooldownSec);
      expect(instanceCount(c)).toBe(3);
    });
  });

  describe("scale-in guard (no flapping)", () => {
    it("holds the fleet while pressure sits between half-threshold and threshold", () => {
      // The flap this prevents: scale out on pressure, drain a little, util still
      // reads 0. Without the guard the fleet would retire the very instance it just
      // booted.
      const { sqs, c } = sqsFed();
      c.instances = 3;
      pinLoad(c, 0);
      fillTo(sqs, (THRESHOLD + THRESHOLD / 2) / 2);
      tick(c, 60);
      expect(c.instances).toBe(3);
    });

    it("does not scale in at exactly half the threshold (strict <)", () => {
      const { sqs, c } = sqsFed();
      c.instances = 3;
      pinLoad(c, 0);
      fillTo(sqs, THRESHOLD / 2);
      tick(c, 30);
      expect(c.instances).toBe(3);
    });

    it("scales in once the queue drains below half the threshold", () => {
      const { sqs, c } = sqsFed();
      c.instances = 3;
      pinLoad(c, 0);
      fillTo(sqs, THRESHOLD / 2 - 0.02);
      tick(c, ASG.sustainSec + 0.2);
      expect(c.instances).toBe(2);
    });

    it("changes nothing for an ALB-push fleet: pressure 0 never blocks scale-in", () => {
      const alb = place("alb");
      const c = asg();
      connect(alb, c);
      c.instances = 3;
      pinLoad(c, ASG.scaleInUtil - 0.1);
      tick(c, ASG.sustainSec + 0.2);
      expect(c.instances).toBe(2);
    });
  });

  describe("the repro, end to end", () => {
    // waf -> sqs -> compute(AUTO) -> db, arrivals far past one instance's throughput.
    // Spawns requests at `rps` through the real entry router.
    function repro() {
      const waf = place("waf");
      const sqs = place("sqs");
      const c = asg();
      const db = place("db");
      connect("internet", waf);
      connect(waf, sqs);
      connect(sqs, c);
      connect(c, db);
      return { sqs, c };
    }

    function drive(seconds: number, rps: number): void {
      let acc = 0;
      for (let t = 0, n = Math.round(seconds / TICK); t < n; t++) {
        acc += rps * TICK;
        while (acc >= 1) {
          acc -= 1;
          inject("READ");
        }
        step();
      }
    }

    it("without the queue signal the fleet is stuck at 1 (the filed bug)", () => {
      const saved = CONFIG.autoscaling.queuePressureThreshold;
      CONFIG.autoscaling.queuePressureThreshold = 999; // signal off
      try {
        const { c } = repro();
        drive(30, 20);
        expect(instanceCount(c)).toBe(1);
      } finally {
        CONFIG.autoscaling.queuePressureThreshold = saved;
      }
    });

    it("scales out under queue pressure while util never sustains past target", () => {
      const { sqs, c } = repro();
      let peak = 1;
      for (let t = 0; t < 30; t++) {
        drive(1, 20);
        peak = Math.max(peak, instanceCount(c));
      }
      expect(peak).toBeGreaterThan(1); // the fleet grew...
      expect(instanceCount(c)).toBeGreaterThan(1);
      expect(upstreamQueuePressure(c)).toBeGreaterThan(0); // ...on a real backlog
      expect(sqs.queue.length + sqs.processing.length).toBeGreaterThan(0);
    });

    it("drains the queue and returns to 1 instance after the traffic stops", () => {
      const { sqs, c } = repro();
      drive(30, 20);
      expect(instanceCount(c)).toBeGreaterThan(1);
      drive(60, 0); // silence: backlog drains, fleet retires
      expect(sqs.queue.length + sqs.processing.length).toBe(0);
      expect(instanceCount(c)).toBe(1);
    });
  });
});

describe("under real traffic", () => {
  it("grows the fleet when requests pile up and capacity follows", () => {
    const alb = place("alb");
    const compute = asg();
    const db = place("db");
    connect("internet", alb);
    connect(alb, compute);
    connect(compute, db);

    for (let i = 0; i < 40; i++) inject("READ");

    // Watch the whole burst: the fleet grows while the backlog drains and shrinks
    // again once the queue empties.
    let peak = 1;
    let peakCapacity = compute.getEffectiveCapacity();
    for (let s = 0; s < 20; s++) {
      run(1);
      peak = Math.max(peak, instanceCount(compute));
      peakCapacity = Math.max(peakCapacity, compute.getEffectiveCapacity());
    }

    expect(peak).toBeGreaterThan(1);
    expect(peakCapacity).toBeGreaterThan(CONFIG.services.compute.capacity);
    expect(instanceCount(compute)).toBe(1); // scaled back in after the burst
  });
});
