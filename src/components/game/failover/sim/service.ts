import { calculateFailChanceBasedOnLoad, failRequest, flashMoney } from "./actions";
import { CONFIG, type Destination, type ServiceConfig, type ServiceType } from "./config";
import { exp } from "./dmath";
import { chargeServerlessInvocation, getUpkeepMultiplier } from "./economy";
import { FAIL_REASONS } from "./failure-reasons";
import { dispatch } from "./handlers";
import { screen } from "./handlers/waf";
import type { Request } from "./request";
import { rand } from "./rng";
import { isRoutable } from "./routing";
import { emit, S } from "./state";
import type { Job, Vec2 } from "./types";

/** Service types with upgrade tiers the player can buy. */
const UPGRADABLE: readonly ServiceType[] = [
  "compute",
  "db",
  "cache",
  "apigw",
  "nosql",
  "search",
  "replica",
];

/** Types whose per-job time scales with the traffic class's processing weight. */
const WEIGHTED: readonly ServiceType[] = ["compute", "serverless", "container"];

/**
 * One placed service. A plain data object with methods: no mesh, no clock. The
 * view reads it through snapshot(); nothing in here knows it is being drawn.
 */
export class Service {
  readonly id: string;
  readonly type: ServiceType;
  config: ServiceConfig;
  readonly position: Vec2;

  queue: Request[] = [];
  processing: Job[] = [];
  /** Ids of the services this one sends to. */
  connections: string[] = [];
  /** Requests in the air towards this service, counted against its intake. */
  incomingCount = 0;

  /** Trailing exponential mean of totalLoad: continuous and readable, unlike the raw ratio. */
  smoothedLoad = 0;
  tier = 1;
  rrIndex = 0;
  health = 100;

  /** Set by an outage event. A disabled service takes no traffic and has no capacity. */
  isDisabled = false;
  /** 1 normally; below 1 while a capacity-drop event is on. */
  tempCapacityReduction = 1;

  /** Auto-scaling fleet: ready instances, and the instances still booting. */
  asgEnabled = false;
  instances = 1;
  warming: number[] = [];

  constructor(type: ServiceType, position: Vec2) {
    this.id = `svc_${S.nextServiceId++}`;
    this.type = type;
    this.config = CONFIG.services[type];
    this.position = { x: position.x, z: position.z };
  }

  /** Buy the next tier. Returns false when the service cannot be upgraded or the money is short. */
  upgrade(): boolean {
    if (!UPGRADABLE.includes(this.type)) return false;
    const tiers = CONFIG.services[this.type].tiers;
    const next = tiers?.[this.tier];
    if (!next) return false;

    if (S.money < next.cost) {
      flashMoney();
      return false;
    }

    S.money -= next.cost;
    S.finances.expenses.services += next.cost;
    S.finances.expenses.byService[this.type] =
      (S.finances.expenses.byService[this.type] ?? 0) + next.cost;
    this.tier++;
    this.config = { ...this.config, capacity: next.capacity };
    if (this.type === "cache" && next.cacheHitRate) {
      this.config = { ...this.config, cacheHitRate: next.cacheHitRate };
    }
    if (this.type === "apigw" && next.rateLimit) {
      this.config = { ...this.config, rateLimit: next.rateLimit };
    }
    emit({ kind: "service-upgraded", id: this.id, tier: this.tier });
    return true;
  }

  /** Restore health to 100 for a fee. Returns false when there is nothing to repair or the money is short. */
  repair(): boolean {
    if (this.health >= 100) return false;

    const repairCost = Math.ceil(this.config.cost * CONFIG.survival.degradation.repairCostPercent);
    if (S.money < repairCost) {
      flashMoney();
      emit({
        kind: "warning",
        key: "repair_need_money",
        level: "danger",
        params: { cost: repairCost },
      });
      return false;
    }

    S.money -= repairCost;
    S.finances.expenses.repairs += repairCost;
    S.finances.expenses.byService[this.type] =
      (S.finances.expenses.byService[this.type] ?? 0) + repairCost;
    this.health = 100;
    emit({ kind: "service-repaired", id: this.id });
    return true;
  }

  /**
   * Utilisation of the READY fleet: jobs in hand over twice the rated capacity.
   * With one instance (every service but a scaled-out fleet) the denominator is
   * the original capacity * 2.
   */
  get totalLoad(): number {
    return (
      (this.processing.length + this.queue.length) / (this.config.capacity * this.instances * 2)
    );
  }

  getEffectiveCapacity(): number {
    // Ready instances only: a warming instance contributes nothing until its
    // cold start finishes. Applied before the health and event reductions so
    // those still scale the whole fleet proportionally.
    let capacity = this.config.capacity * this.instances;

    const criticalHealth = CONFIG.survival.degradation.criticalHealth;
    if (this.health < criticalHealth) {
      // Linear reduction from critical to 0 health: 100% -> 30% capacity.
      const healthRatio = this.health / criticalHealth;
      capacity = Math.max(1, Math.floor(capacity * (0.3 + 0.7 * healthRatio)));
    }

    if (this.tempCapacityReduction < 1) {
      capacity = Math.max(1, Math.floor(capacity * this.tempCapacityReduction));
    }

    if (this.isDisabled) return 0;
    return capacity;
  }

  /** The first routable connected service of a type, so routing falls through to a healthy peer. */
  findConnectedService(serviceType: ServiceType | Destination): Service | undefined {
    return S.services.find(
      (s) => this.connections.includes(s.id) && s.type === serviceType && isRoutable(s),
    );
  }

  /** Advance one step. `dt` is game seconds. */
  update(dt: number): void {
    // The smoothed load signal is updated first, so every consumer in this step
    // reads a value that already includes it. The exponential form is exactly
    // step-size invariant: two half steps compose to one whole step.
    this.smoothedLoad +=
      (this.totalLoad - this.smoothedLoad) * (1 - exp(-dt / CONFIG.load.smoothingTau));

    // Services wear down over time in survival.
    if (CONFIG.survival.degradation.enabled && S.gameMode === "survival") {
      const degradation = CONFIG.survival.degradation;
      const load = this.totalLoad;

      if (load > 0.05) {
        // Base decay plus load acceleration: 0.5x at low load, 2x at full load.
        const loadMultiplier = 0.5 + load * 1.5;
        this.health = Math.max(0, this.health - degradation.healthDecayRate * loadMultiplier * dt);
      } else if (degradation.autoRepairRate > 0 && this.health < 100) {
        this.health = Math.min(100, this.health + degradation.autoRepairRate * dt);
      }
    }

    if (S.upkeepEnabled) {
      // Every instance is billed, warming ones included: clouds charge from
      // boot, not from readiness.
      const upkeepCost =
        (this.config.upkeep / 60) * dt * getUpkeepMultiplier() * upkeepInstanceFactor(this);
      S.money -= upkeepCost;
      S.finances.expenses.upkeep += upkeepCost;
      S.finances.expenses.byService[this.type] =
        (S.finances.expenses.byService[this.type] ?? 0) + upkeepCost;
    }

    this.processQueue();

    for (let i = this.processing.length - 1; i >= 0; i--) {
      const job = this.processing[i];
      if (!job) continue;

      const processingTime = WEIGHTED.includes(this.type)
        ? this.config.processingTime * job.req.processingWeight
        : this.config.processingTime;

      job.timer += dt * 1000;
      if (job.timer < processingTime) continue;

      this.processing.splice(i, 1);

      const failChance = calculateFailChanceBasedOnLoad(this.totalLoad);
      // A damaged node fails more.
      const healthPenalty =
        this.health < CONFIG.survival.degradation.criticalHealth
          ? (1 - this.health / 100) * 0.5
          : 0;
      if (rand("rolls") < Math.min(1, failChance + healthPenalty)) {
        // Serverless pays per invocation even when the function errors out.
        chargeServerlessInvocation(this);
        failRequest(job.req, FAIL_REASONS.OVERLOADED);
        continue;
      }

      const outcome = dispatch(this, job);
      if (outcome === "requeue-next") {
        // Not consumed: put it back at its old index and move on.
        this.processing.splice(i, 0, job);
      } else if (outcome === "requeue-stop") {
        // Backpressure: put it back and stop for this step.
        this.processing.splice(i, 0, job);
        break;
      }
    }
  }

  /** Move queued requests into free processing slots. */
  private processQueue(): void {
    const effectiveCapacity = this.getEffectiveCapacity();
    while (this.processing.length < effectiveCapacity && this.queue.length > 0) {
      const req = this.queue.shift();
      if (!req) break;

      if (this.type === "waf" && screen(this, req)) continue;

      this.processing.push({ req, timer: 0 });
    }
  }
}

// Plain per-instance billing: one instance costs the base upkeep, each further
// instance (ready or booting) costs the same again.
function upkeepInstanceFactor(service: Service): number {
  const extra = service.instances + service.warming.length - 1;
  if (extra <= 0) return 1;
  return 1 + extra * CONFIG.autoscaling.instanceUpkeepFactor;
}
