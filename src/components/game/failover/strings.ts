// Failover's UI text. Lifted from Server Survival's src/locales/en.js at
// 7804e59 (MIT, see NOTICE) by a one-off script and keyed like upstream, so
// other locales can return: emoji and HTML stripped, punctuation folded to
// ASCII, upstream branding dropped. Lines marked "ours" have no upstream key.
// strings-usage.test.ts keeps this list and the game's T.<key> uses equal.

export const T = {
  alert_breaker_closed: "Circuit breaker recovered: {type}",
  alert_breaker_open: "Circuit breaker OPEN: {type}",
  alert_error_rate: "Error rate critical: {type}",
  alert_high_load: "High load: {type}",
  alert_queue_capacity: "Queue near capacity: {type}",
  apigw_short: "API GW",
  armed_chip: "{name} ${cost}", // ours
  asg_disable_tip: "Disable auto-scaling (collapses back to one instance)",
  asg_enable_tip: "Enable auto-scaling for this Compute node",
  asg_label: "AUTO",
  asg_off: "OFF",
  asg_warming: "+{n} warming",
  auth_short: "Auth",
  auto_scaling: "Auto-scaling", // ours
  best_line: "Best on this device: {time}, {score}", // ours
  board_label:
    "Failover game board. Keys: 1 select, 2 link, 3 demolish, WASD pan, Q and E turn, Space pause.", // ours
  breaches: "Breaches", // ours
  budget: "BUDGET",
  build: "Build", // ours
  build_a_service: "Build a service", // ours
  build_menu_close: "Hide the build menu", // ours
  build_menu_open: "Open the build menu", // ours
  cache_short: "Cache",
  cancel: "Cancel",
  capacity_drop_warning: "RESOURCE THROTTLING! Capacity reduced for 30s",
  cat_async: "Async",
  cat_compute: "Compute",
  cat_data: "Data",
  cat_frontdoor: "Front Door",
  cat_ops: "Ops",
  cdn_short: "CDN",
  close: "Close", // ours
  coach_step: "Step {n} of {total}", // ours
  compute_short: "Compute",
  confirm: "Confirm", // ours
  container_short: "Cluster",
  cost_spike_warning: "CLOUD COST SPIKE! Upkeep doubled for 30s",
  db_short: "SQL DB",
  ddos_incoming: "DDoS INCOMING",
  demolish: "Demolish",
  demolish_ask: "Demolish for a {refund} refund?", // ours
  demolish_refund: "Demolish (refund {refund})", // ours
  disarm: "Disarm", // ours
  dlq_short: "DLQ",
  dns_short: "GeoDNS",
  elapsed_time: "Elapsed Time",
  event_ended: "Event ended",
  exit_full_screen: "Exit full screen", // ours
  fail_analytics_store: "Analytics store, not for reads",
  fail_breach: "Breach!",
  fail_circuit_open: "Circuit open",
  fail_gpu_only: "GPUs serve inference only",
  fail_no_master: "No master",
  fail_no_origin: "No origin",
  fail_no_route: "No route",
  fail_no_subscriber: "No subscriber",
  fail_not_indexed: "No search index",
  fail_overloaded: "Overloaded",
  fail_partition_stalled: "Partition stalled",
  fail_queue_full: "Queue full",
  fail_read_only_replica: "Read-only replica",
  fail_region_down: "Region offline",
  fail_retry_failed: "Retry failed",
  fail_search_only: "Search index only",
  fail_slo_timeout: "Deadline exceeded",
  fail_throttled: "Throttled",
  fail_wrong_store: "Wrong store type",
  final_score: "Final Score: {score}",
  finances: "Finances",
  full_screen: "Full screen", // ours
  fw: "FW",
  game_error: "Game Error", // ours
  game_error_text: "This game hit an error and stopped.", // ours
  gfx_auto: "Auto", // ours
  gfx_high: "High", // ours
  gfx_low: "Low", // ours
  gfx_now_high: "Drawing at full detail.", // ours
  gfx_now_low: "Drawing at reduced detail (30 fps, fewer requests shown).", // ours
  goodput_label: "GOODPUT (30s)",
  gpu_short: "GPU",
  graphics: "Graphics", // ours
  hardware: "Hardware", // ours
  hp_display: "{hp}% HP",
  income: "Income", // ours
  infgw_short: "Inf GW",
  inspector_label: "{name} details", // ours
  instances_n: "{n} running", // ours
  internet_stays: "The Internet stays", // ours
  lb: "LB",
  link: "Link",
  link_exists: "{from} already sends to {to}", // ours
  link_made: "Linked {from} to {to}", // ours
  link_rejected: "{from} can't send traffic to {to}.",
  link_reverse: "{to} already sends to {from}; a link runs one way", // ours
  load_rps: "LOAD (RPS)",
  max_tier: "Max Tier",
  metrics: "Metrics",
  metrics_col_err: "Err",
  metrics_col_lat: "Lat",
  metrics_col_queue: "Queue",
  metrics_col_util: "Util",
  metrics_locked: "Place a Monitoring service to unlock live metrics.",
  metrics_locked_teach: "You can't fix what you can't see.",
  mitigation: "DDoS mitigation", // ours
  monitor_short: "Monitor",
  net_profit: "Net Profit",
  no_money: "Not enough money", // ours
  nosql_short: "NoSQL",
  not_allowed: "Not allowed", // ours
  not_upgradable: "That cannot be upgraded", // ours
  nothing_there: "Nothing there", // ours
  nothing_to_repair: "Nothing to repair", // ours
  notify_short: "Notify",
  off_board: "That is off the board", // ours
  offline: "Offline", // ours
  over_money: "The account is $1,000 in the red. The run is over.", // ours
  over_reputation: "Reputation hit zero. The customers have left.", // ours
  over_retired: "You ended the run.", // ours
  pause: "Pause", // ours
  pending_demolish: "Demolish {name}?", // ours
  pending_place: "Build {name} here?", // ours
  per_minute: "/min", // ours
  play_again: "Play again", // ours
  power_delete_blocked: "Substation in use - unplug GPUs first",
  power_gate_blocked: "Not enough power - build a Substation first",
  power_hud: "{used}/{cap} kW",
  power_label: "Power",
  power_short: "Substation",
  pubsub_short: "Pub/Sub",
  queue: "Queue",
  reduced_motion_note:
    "Reduced motion: like the site's other games, Failover keeps its motion when your system asks for less. The moving traffic is the game.", // ours
  region_outage_restored: "Region restored - traffic is spreading back across both regions",
  region_outage_warning: "REGION OUTAGE! The {type} stack went dark - {count} services offline",
  reload: "Reload", // ours
  repair: "Repair",
  repair_for: "Repair {cost}", // ours
  repair_need_money: "Need ${cost} for repair",
  replay_coach: "Show the tour again (starts a new run)", // ours
  replica_short: "Replica",
  report_late: "{n} late",
  report_none: "none",
  report_peak_load: "Peak load",
  report_served: "Served {onTime} of {total} on time ({pct}%)",
  report_title: "What happened",
  report_top_failures: "Top failures",
  reputation: "REPUTATION",
  resume: "Resume", // ours
  rps_surge_warning: "RPS SURGE! Traffic x{multiplier}",
  run_is_over: "The run is over", // ours
  run_over: "Run over", // ours
  scheduler_short: "Cron",
  search_short: "Search",
  select: "Select",
  serverless_short: "Serverless",
  service: "Service",
  service_outage_warning: "{type} OUTAGE! Service offline for 30s",
  settings: "Settings", // ours
  skip_tutorial: "Skip Tutorial",
  soft_bad_answer: "Bad answer",
  soft_slow: "Slow",
  sound: "Sound",
  sound_off: "Sound off", // ours
  sound_on: "Sound on", // ours
  speed_n: "Speed {n}x", // ours
  storage_short: "Storage",
  stream_short: "Stream",
  survived: "Survived {time}", // ours
  tier_of: "Tier {tier} of {max}", // ours
  tile_taken: "That tile is taken", // ours
  tools: "Tools", // ours
  top_down: "Top-down view", // ours
  top_tier: "Already at the top tier", // ours
  total_score: "TOTAL SCORE",
  traffic_burst_warning: "TRAFFIC BURST! 3x requests for 30s",
  traffic_surging: "{name} traffic surge incoming!",
  turn_left: "Turn left", // ours
  turn_right: "Turn right", // ours
  tut_connect_fw_hint:
    "All traffic enters through the Internet node. Without this connection, no traffic will reach your infrastructure.",
  tut_connect_fw_text:
    "Great! Now connect the Internet to your Firewall. Select the Link tool, click on Internet first, then click on the Firewall.",
  tut_connect_fw_title: "Connect to Internet",
  tut_place_compute_hint:
    "You can upgrade Compute later to handle more traffic (Tier 1 -> 2 -> 3). Heavy requests like UPLOAD and SEARCH take longer to process.",
  tut_place_compute_text:
    "Compute processes all requests. It routes traffic to the correct destination: Storage for STATIC/UPLOAD, Database for READ/WRITE/SEARCH.",
  tut_place_compute_title: "Deploy Compute Server",
  tut_place_db_hint:
    "READ = data fetch (40% cache). WRITE = database updates (never cached). SEARCH = complex queries (15% cache, heavy).",
  tut_place_db_text:
    "SQL Database handles READ, WRITE, and SEARCH traffic. APIs need database storage.",
  tut_place_db_title: "Deploy SQL Database",
  tut_place_fw_hint:
    "Place it near the Internet node, the cyan ball on the left, for an easy link.",
  tut_place_fw_text:
    "The Firewall is your first line of defense. It blocks MALICIOUS traffic (red) that can destroy your reputation. Pick FW in the Front Door tab, then click a tile to place it.",
  tut_place_fw_title: "Deploy Firewall",
  tut_ready_hint:
    "Monitor the colored rings around services - green is good, red means overload. Upgrade or add more services as needed!",
  tut_ready_text:
    "Your basic infrastructure is complete! Press the Play button to start the simulation. Watch as traffic flows through your system!",
  tut_ready_title: "Infrastructure Ready!",
  tut_welcome_title: "Welcome, Architect!",
  upgrade_for: "Upgrade {cost}", // ours
  upkeep_label: "Upkeep",
  upkeep_toggle: "Upkeep",
  warehouse_short: "Warehouse",
} as const;

/** Fill a string's {name} placeholders. A placeholder with no value is left as it is. */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}
