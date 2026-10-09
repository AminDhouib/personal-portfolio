// Failure taxonomy. One constant per reason a request can die, whose value is
// the key of the short label the UI shows over the node. A reason is
// ATTRIBUTION ONLY: it rides along the existing fail path as an extra argument
// and never decides anything, so adding one cannot change which requests fail,
// in what order, or how they are scored.

export const FAIL_REASONS = {
  // Capacity / health
  QUEUE_FULL: "fail_queue_full",
  OVERLOADED: "fail_overloaded",
  RETRY_FAILED: "fail_retry_failed",

  // Topology dead ends
  NO_ROUTE: "fail_no_route",
  NO_ORIGIN: "fail_no_origin",
  NO_SUBSCRIBER: "fail_no_subscriber",
  NO_MASTER: "fail_no_master",

  // Wrong destination for this traffic
  READ_ONLY_REPLICA: "fail_read_only_replica",
  ANALYTICS_STORE: "fail_analytics_store",
  WRONG_STORE: "fail_wrong_store",
  NOT_INDEXED: "fail_not_indexed",
  SEARCH_ONLY: "fail_search_only",

  // Resilience mechanics
  CIRCUIT_OPEN: "fail_circuit_open",
  PARTITION_STALLED: "fail_partition_stalled",
  REGION_DOWN: "fail_region_down",

  // GPU inference
  SLO_TIMEOUT: "fail_slo_timeout",
  GPU_ONLY: "fail_gpu_only",

  // Security / load shedding
  BREACH: "fail_breach",
  THROTTLED: "fail_throttled",
} as const;

export type FailReason = (typeof FAIL_REASONS)[keyof typeof FAIL_REASONS];
