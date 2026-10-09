import { canAutoscale, upkeepInstanceFactor } from "./sim/autoscaling";
import { CONFIG, type ServiceType } from "./sim/config";
import { getAutoRepairUpkeep, getUpkeepMultiplier } from "./sim/economy";
import { getRollingGoodput, getRunReport, getServiceMetrics, hasMonitoring } from "./sim/metrics";
import { scoreOf } from "./sim/score";
import { S } from "./sim/state";
import type { GameMode, GameOverReason, Power } from "./sim/types";

// What the HUD shows of the sim, read at 4 Hz (and at once on a discrete
// event) by the controller. Reads only: nothing here changes the sim.

/** The node the Select tool picked, with what the inspector offers for it. */
export interface SelectedInfo {
  id: string;
  type: ServiceType;
  name: string;
  tier: number;
  /** Tiers this type has; 1 for a type with no upgrades. */
  maxTier: number;
  /** 0-100. */
  health: number;
  /** What the next tier costs, or null at the top or for a type with no tiers. */
  upgradeCost: number | null;
  /** What a repair costs now, or null at full health. */
  repairCost: number | null;
  /** What demolishing it gives back. */
  refund: number;
  /** Auto-scaling on or off, or null for a type that cannot scale. */
  asg: boolean | null;
  instances: number;
  warming: number;
  disabled: boolean;
}

/** One row of the live metrics panel: the newest sample of each series. */
export interface MetricRow {
  id: string;
  name: string;
  /** Fraction of rated capacity, 1 = full. */
  util: number;
  queue: number;
  /** Fraction of requests that failed. */
  err: number;
  /** Milliseconds. */
  lat: number;
}

/** The first-run coach's checkpoints, read from the board. */
export interface Milestones {
  waf: boolean;
  wafLinked: boolean;
  compute: boolean;
  db: boolean;
}

/** The post-mortem the end-of-run report shows; built only once the run is over. */
export interface RunSummary {
  served: number;
  onTime: number;
  late: number;
  failures: number;
  /** The five commonest failure reasons (fail_* keys). */
  topReasons: ReadonlyArray<{ key: string; count: number }>;
  /** The three hottest nodes of the run (util: 1 = full), demolished ones included. */
  peaks: ReadonlyArray<{ id: string; name: string; util: number; atSec: number }>;
  income: number;
  expenses: {
    services: number;
    upkeep: number;
    repairs: number;
    autoRepair: number;
    mitigation: number;
    breach: number;
    dlq: number;
  };
}

export interface SimHud {
  mode: GameMode;
  money: number;
  reputation: number;
  /** Game seconds. */
  time: number;
  rps: number;
  over: GameOverReason | null;
  score: number;
  /** Share of the last 30 s of demand answered in time, or null with no demand yet. */
  goodput: number | null;
  /** Upkeep plus the auto-repair crew, in money per game minute, at today's multiplier. */
  upkeepPerMin: number;
  failures: number;
  /** Failure reasons (the fail_* string keys) by count, most first. */
  failuresByReason: ReadonlyArray<readonly [key: string, count: number]>;
  /** The power grid, once a GPU or a substation is on the board. */
  power: Power | null;
  /** A live Monitoring node is on the board: the metrics panel is unlocked. */
  monitoring: boolean;
  milestones: Milestones;
  selected: SelectedInfo | null;
  /** Rows for the metrics panel; empty without Monitoring. */
  metrics: MetricRow[];
  report: RunSummary | null;
}

const last = (series: readonly number[]): number => series[series.length - 1] ?? 0;

function selectedInfo(id: string | null): SelectedInfo | null {
  const svc = id ? S.services.find((s) => s.id === id) : undefined;
  if (!svc) return null;
  const config = CONFIG.services[svc.type];
  const tiers = config.tiers;
  const next = tiers?.[svc.tier];
  return {
    id: svc.id,
    type: svc.type,
    name: config.name,
    tier: svc.tier,
    maxTier: tiers ? tiers.length : 1,
    health: svc.health,
    upgradeCost: next ? next.cost : null,
    repairCost:
      svc.health < 100
        ? Math.ceil(svc.config.cost * CONFIG.survival.degradation.repairCostPercent)
        : null,
    refund: Math.floor(svc.config.cost / 2),
    asg: canAutoscale(svc) ? svc.asgEnabled : null,
    instances: svc.instances,
    warming: svc.warming.length,
    disabled: svc.isDisabled,
  };
}

function upkeepPerMin(): number {
  let perMin = 0;
  if (S.upkeepEnabled) {
    const multiplier = getUpkeepMultiplier();
    for (const svc of S.services)
      perMin += svc.config.upkeep * multiplier * upkeepInstanceFactor(svc);
    perMin += getAutoRepairUpkeep() * 60;
  }
  return perMin;
}

function metricRows(): MetricRow[] {
  return S.services.map((svc) => {
    const m = getServiceMetrics(svc.id);
    return {
      id: svc.id,
      name: CONFIG.services[svc.type].name,
      // The sampled util is the smoothed load, where 0.5 is 100% of rated capacity.
      util: m ? last(m.util) * 2 : 0,
      queue: m ? last(m.queueDepth) : 0,
      err: m ? last(m.errorRate) : 0,
      lat: m ? last(m.latency) : 0,
    };
  });
}

function milestones(): Milestones {
  const wafs = S.services.filter((s) => s.type === "waf").map((s) => s.id);
  return {
    waf: wafs.length > 0,
    wafLinked: S.connections.some((c) => c.from === "internet" && wafs.includes(c.to)),
    compute: S.services.some((s) => s.type === "compute"),
    db: S.services.some((s) => s.type === "db"),
  };
}

function runSummary(): RunSummary {
  const report = getRunReport(5);
  const e = S.finances.expenses;
  return {
    served: report.processed,
    onTime: report.onTime,
    late: report.late,
    failures: report.failures,
    topReasons: report.topReasons,
    peaks: report.peaks.slice(0, 3).map((p) => ({
      id: p.id,
      name: CONFIG.services[p.type as ServiceType]?.name ?? p.type,
      // Peaks are smoothed load, where 0.5 is 100% of rated capacity.
      util: p.util * 2,
      atSec: p.atSec,
    })),
    income: S.finances.income.total,
    expenses: {
      services: e.services,
      upkeep: e.upkeep,
      repairs: e.repairs,
      autoRepair: e.autoRepair,
      mitigation: e.mitigation,
      breach: e.breach,
      dlq: e.dlq,
    },
  };
}

export function readSimHud(selectedId: string | null): SimHud {
  const monitoring = hasMonitoring();
  const failuresByReason = Object.entries(S.failuresByReason)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const gridInUse = S.services.some((s) => s.type === "gpu" || s.type === "power");
  return {
    mode: S.gameMode,
    money: S.money,
    reputation: S.reputation,
    time: S.elapsedGameTime,
    rps: S.currentRPS,
    over: S.over ? S.over.reason : null,
    score: scoreOf(),
    goodput: getRollingGoodput(),
    upkeepPerMin: upkeepPerMin(),
    failures: Object.values(S.failures).reduce((sum, n) => sum + n, 0),
    failuresByReason,
    power: gridInUse ? { ...S.power } : null,
    monitoring,
    milestones: milestones(),
    selected: selectedInfo(selectedId),
    metrics: monitoring ? metricRows() : [],
    report: S.over ? runSummary() : null,
  };
}
