import type { Alert } from "../controller";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "../sim/config";
import type { FailReason, SoftBadge } from "../sim/failure-reasons";
import { T, fmt } from "../strings";

// The sim speaks in string keys (a failure reason, a soft badge, a warning);
// these maps turn them into words. messages.test.ts holds them to every key
// the sim can emit.

export const BADGE_TEXT: Record<FailReason | SoftBadge, string> = {
  fail_queue_full: T.fail_queue_full,
  fail_overloaded: T.fail_overloaded,
  fail_retry_failed: T.fail_retry_failed,
  fail_no_route: T.fail_no_route,
  fail_no_origin: T.fail_no_origin,
  fail_no_subscriber: T.fail_no_subscriber,
  fail_no_master: T.fail_no_master,
  fail_read_only_replica: T.fail_read_only_replica,
  fail_analytics_store: T.fail_analytics_store,
  fail_wrong_store: T.fail_wrong_store,
  fail_not_indexed: T.fail_not_indexed,
  fail_search_only: T.fail_search_only,
  fail_circuit_open: T.fail_circuit_open,
  fail_partition_stalled: T.fail_partition_stalled,
  fail_region_down: T.fail_region_down,
  fail_slo_timeout: T.fail_slo_timeout,
  fail_gpu_only: T.fail_gpu_only,
  fail_breach: T.fail_breach,
  fail_throttled: T.fail_throttled,
  soft_bad_answer: T.soft_bad_answer,
  soft_slow: T.soft_slow,
};

/** Soft badges mark a completed request worth a second look, not a failure. */
export const SOFT = new Set<string>(["soft_bad_answer", "soft_slow"]);

export const WARNING_TEXT: Record<string, string> = {
  alert_breaker_closed: T.alert_breaker_closed,
  alert_breaker_open: T.alert_breaker_open,
  alert_error_rate: T.alert_error_rate,
  alert_high_load: T.alert_high_load,
  alert_queue_capacity: T.alert_queue_capacity,
  capacity_drop_warning: T.capacity_drop_warning,
  cost_spike_warning: T.cost_spike_warning,
  ddos_incoming: T.ddos_incoming,
  event_ended: T.event_ended,
  power_delete_blocked: T.power_delete_blocked,
  power_gate_blocked: T.power_gate_blocked,
  region_outage_restored: T.region_outage_restored,
  region_outage_warning: T.region_outage_warning,
  repair_need_money: T.repair_need_money,
  rps_surge_warning: T.rps_surge_warning,
  service_outage_warning: T.service_outage_warning,
  traffic_burst_warning: T.traffic_burst_warning,
  traffic_surging: T.traffic_surging,
};

export function badgeText(key: string): string {
  return (BADGE_TEXT as Record<string, string>)[key] ?? key;
}

const isServiceType = (v: unknown): v is ServiceType =>
  typeof v === "string" && (SERVICE_TYPES as readonly string[]).includes(v);

/** A warning in words; a {type} parameter that names a service type reads as its name. */
export function alertText(alert: Alert): string | null {
  const template = WARNING_TEXT[alert.key];
  if (!template) return null;
  const params: Record<string, string | number> = { ...alert.params };
  if (isServiceType(params.type)) params.type = CONFIG.services[params.type].name;
  return fmt(template, params);
}
