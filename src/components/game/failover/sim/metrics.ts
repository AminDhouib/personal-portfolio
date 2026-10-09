// Observability layer: the metrics collection engine. Ring-buffered per-service
// samples (2 Hz over a 60 s window) for utilization, queue depth, windowed error rate
// and rolling latency, plus the hasMonitoring() gate and the threshold alerts.
// Error and latency attribution is fed from the request lifecycle in actions.ts
// (failRequest and finishRequest). Alerts live here rather than in a module of their
// own: they are evaluated inside the same per-sample loop over the same counters.
//
// It also keeps the rolling goodput window and the per-run peak watermarks, so the
// whole "what happened to this board" record is one pure data module with plain
// getters. It never reads a clock: a sample is every SAMPLE_TICKS ticks of the sim's
// own step, cooldowns are game time, and every piece of state lives in S.metrics, so a
// reset starts a run clean.
//
// The alerts are warning events with a key and the node type as a param, never prose.

import { CONFIG, TICK } from "./config";
import type { Service } from "./service";
import { emit, S } from "./state";
import type { GoodputBucket, ServiceSeries } from "./types";

/** Samples per second is 2: one every half second of game time. */
const SAMPLE_TICKS = Math.round(0.5 / TICK);
export const METRICS_BUFFER_SIZE = 120; // 120 samples x 0.5 s = 60 s window

const ALERT_COOLDOWN = 15; // seconds of game time, per service and rule
// Utilization thresholds live in CONFIG.load so the ring colours, the alert and the
// failure onset are calibrated against one another instead of drifting apart in three
// files. Both are read at call time, not captured here.
const QUEUE_THRESHOLD = 0.9; // fraction of maxQueueSize
const ERROR_RATE_THRESHOLD = 0.2;
const ERROR_MIN_EVENTS = 5; // a rate alone is noise on 1-2 requests

// Rolling goodput. The game's headline number is reputation: an unbounded integral
// clamped at 100, so it reads 100 for a board that is merely coasting and it cannot
// distinguish "healthy" from "recovering". Goodput is a bounded RATIO over a short
// window: of everything the board was asked to do in the last 30 seconds, what share
// was answered while someone still wanted it. Buckets are per metrics SAMPLE, so the
// window is GOODPUT_WINDOW_SAMPLES x 0.5 s of game time.
const GOODPUT_WINDOW_SAMPLES = 60; // 60 x 0.5 s = 30 s of game time

/**
 * Called from the request lifecycle, once per terminated request.
 *
 * Three buckets, and the third is wider than its name: it is "demand that got no
 * timely answer", not "a service errored". A dropped request, a 429 from a rate
 * limiter and an event drained out of a dead-letter queue are different events with
 * different costs, and the player sees them differently, but to goodput they are the
 * same thing: a customer who did not get served. Leaving any of them out of the
 * denominator is what lets a board that sheds nine tenths of its traffic report
 * itself perfect.
 */
export function recordOutcome(kind: "onTime" | "late" | "failed" | "unanswered"): void {
  const pending = S.metrics.pending;
  if (kind === "onTime") pending.onTime++;
  else if (kind === "late") pending.late++;
  else pending.failed++;
}

/**
 * Share of recent demand that was answered in time, or null when the window holds
 * nothing at all: an idle board has no goodput, and printing 100% for "nothing
 * happened" is exactly the lie reputation already tells.
 */
export function getRollingGoodput(): number | null {
  let onTime = 0;
  let total = 0;
  for (const b of S.metrics.goodput) {
    onTime += b.onTime;
    total += b.onTime + b.late + b.failed;
  }
  if (total === 0) return null;
  return onTime / total;
}

function seriesFor(id: string): ServiceSeries {
  let m = S.metrics.series.get(id);
  if (!m) {
    m = {
      util: [],
      queueDepth: [],
      errorRate: [],
      latency: [],
      errors: 0,
      successes: 0,
      latencySum: 0,
      latencyCount: 0,
      utilStreak: 0,
    };
    S.metrics.series.set(id, m);
  }
  return m;
}

function pushSample(arr: number[], value: number): void {
  arr.push(value);
  if (arr.length > METRICS_BUFFER_SIZE) arr.shift();
}

// Attribution hooks, called from actions.ts. `service` is any object with a service
// id (failRequest passes req.target, finishRequest the finishing service).
export function recordServiceError(service: Pick<Service, "id"> | null | undefined): void {
  if (!service) return;
  seriesFor(service.id).errors++;
}

export function recordServiceSuccess(
  service: Pick<Service, "id"> | null | undefined,
  latencyMs: number,
): void {
  if (!service) return;
  const m = seriesFor(service.id);
  m.successes++;
  if (Number.isFinite(latencyMs)) {
    m.latencySum += Math.max(0, latencyMs);
    m.latencyCount++;
  }
}

export function hasMonitoring(): boolean {
  return S.services.some((s) => s.type === "monitor" && !s.isDisabled);
}

/** Called once per sim step. Every SAMPLE_TICKS ticks it takes a sample of every service. */
export function metricsTick(): void {
  const m = S.metrics;
  m.sampleTicks++;
  if (m.sampleTicks < SAMPLE_TICKS) return;
  m.sampleTicks = 0;
  takeSample();
}

function takeSample(): void {
  const metrics = S.metrics;
  metrics.sampleCount++;

  // Roll the goodput window one bucket forward.
  const closed: GoodputBucket = { ...metrics.pending };
  metrics.goodput.push(closed);
  if (metrics.goodput.length > GOODPUT_WINDOW_SAMPLES) metrics.goodput.shift();
  metrics.pending = { onTime: 0, late: 0, failed: 0 };

  // Lazily prune buffers for deleted services: cheaper and simpler than hooking
  // deleteObject, and at most one sample (0.5 s) stale.
  const live = new Set(S.services.map((s) => s.id));
  for (const id of metrics.series.keys()) {
    if (!live.has(id)) metrics.series.delete(id);
  }

  const monitored = hasMonitoring();

  for (const service of S.services) {
    const m = seriesFor(service.id);
    // The SMOOTHED load: the sampled series, the alert and the panel's red tint all
    // read the same axis the load rings do. Sampling the instantaneous signal produced
    // a sparkline of a quantity that on a tier-1 Compute can only be 0.75, 1.00 or
    // 1.25, and an alert that fired at 170% of rated capacity.
    const util = service.smoothedLoad;

    // Watermark first, so a node deleted later in the run still keeps the peak it
    // reached while it existed: the report is a post-mortem of the RUN, not a snapshot
    // of the surviving board. A running watermark rather than a scan of the buffers,
    // which hold only 60 s and would silently forget an early spike; it is also O(1)
    // per sample instead of O(services x 120).
    const prev = metrics.peaks.get(service.id);
    if (!prev || util > prev.util) {
      metrics.peaks.set(service.id, { type: service.type, util, atSec: S.elapsedGameTime });
    }

    const queueDepth = service.queue.length;
    const events = m.errors + m.successes;
    const errorRate = events > 0 ? m.errors / events : 0;
    // Rolling latency: the average of completions since the last sample; quiet samples
    // carry the previous value forward so the sparkline does not collapse to zero
    // between requests.
    const lastLatency = m.latency[m.latency.length - 1] ?? 0;
    const latency = m.latencyCount > 0 ? m.latencySum / m.latencyCount : lastLatency;

    pushSample(m.util, util);
    pushSample(m.queueDepth, queueDepth);
    pushSample(m.errorRate, errorRate);
    pushSample(m.latency, latency);

    if (monitored) checkAlerts(service, m, util, queueDepth, errorRate, events);
    else m.utilStreak = 0;

    m.errors = 0;
    m.successes = 0;
    m.latencySum = 0;
    m.latencyCount = 0;
  }
}

function checkAlerts(
  service: Service,
  m: ServiceSeries,
  util: number,
  queueDepth: number,
  errorRate: number,
  events: number,
): void {
  if (util > CONFIG.load.alertUtil) m.utilStreak++;
  else m.utilStreak = 0;
  if (m.utilStreak >= CONFIG.load.alertSustainSamples) {
    fireAlert(service, "util", "alert_high_load", "warning");
  }

  const maxQueue = service.config.maxQueueSize ?? 20;
  if (queueDepth >= QUEUE_THRESHOLD * maxQueue) {
    fireAlert(service, "queue", "alert_queue_capacity", "warning");
  }

  if (events >= ERROR_MIN_EVENTS && errorRate > ERROR_RATE_THRESHOLD) {
    fireAlert(service, "errors", "alert_error_rate", "danger");
  }
}

/**
 * Shared alert emitter. The circuit breaker reuses it for trips and recoveries so
 * they share the per-service cooldown. It is deliberately NOT gated on
 * hasMonitoring(): only the threshold rules in checkAlerts are an observability
 * feature, a breaker trip is a routing event.
 */
export function fireAlert(
  service: Pick<Service, "id" | "type">,
  rule: string,
  key: string,
  severity: "info" | "warning" | "danger",
): void {
  const cooldownKey = `${service.id}:${rule}`;
  const now = S.elapsedGameTime;
  const last = S.metrics.alertCooldowns.get(cooldownKey);
  if (last !== undefined && now - last < ALERT_COOLDOWN) return;
  S.metrics.alertCooldowns.set(cooldownKey, now);
  emit({ kind: "warning", key, level: severity, params: { type: service.type } });
}

// Panel accessors.
export function getServiceMetrics(id: string): ServiceSeries | undefined {
  return S.metrics.series.get(id);
}

/** Monotonic sample counter: a panel redraws its charts only when this changes. */
export function getSampleCount(): number {
  return S.metrics.sampleCount;
}

export interface RunReport {
  peaks: Array<{ id: string; type: string; util: number; atSec: number }>;
  topReasons: Array<{ key: string; count: number }>;
  processed: number;
  late: number;
  onTime: number;
  failures: number;
}

/**
 * The post-run report. Everything here is data the simulation already collected and
 * would otherwise throw away at the run boundary. Deliberately NOT gated on owning a
 * Monitoring node: a post-mortem is not live observability, and the buy-the-eyes
 * lesson depends on the LIVE dashboard being purchasable, not on the player never
 * learning what happened afterwards. A mid-run caller would silently refund a
 * purchase the game charges for, so a view should call it from the debrief only.
 */
export function getRunReport(topN = 3): RunReport {
  const peaks = [...S.metrics.peaks.entries()]
    .map(([id, p]) => ({ id, type: p.type, util: p.util, atSec: p.atSec }))
    .sort((a, b) => b.util - a.util);

  const topReasons = Object.entries(S.failuresByReason)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, topN);

  const processed = S.requestsProcessed;
  const late = S.lateCompletions;
  const failures = Object.values(S.failures).reduce((a, n) => a + n, 0);

  return { peaks, topReasons, processed, late, onTime: Math.max(0, processed - late), failures };
}
