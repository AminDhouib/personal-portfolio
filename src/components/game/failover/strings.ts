// Failover's UI text. Lifted from Server Survival's src/locales/en.js at
// 7804e59 (MIT, see NOTICE) by a one-off script and keyed like upstream, so
// other locales can return: emoji and HTML stripped, punctuation folded to
// ASCII, upstream branding dropped. Lines marked "ours" have no upstream key.
// strings-usage.test.ts keeps this list and the game's T.<key> uses equal.

export const T = {
  apigw_short: "API GW",
  armed_chip: "{name} ${cost}", // ours
  auth_short: "Auth",
  board_label:
    "Failover game board. Keys: 1 select, 2 link, 3 demolish, WASD pan, Q and E turn, Space pause.", // ours
  budget: "BUDGET",
  build: "Build", // ours
  build_a_service: "Build a service", // ours
  build_menu_close: "Hide the build menu", // ours
  build_menu_open: "Open the build menu", // ours
  cache_short: "Cache",
  cancel: "Cancel",
  cat_async: "Async",
  cat_compute: "Compute",
  cat_data: "Data",
  cat_frontdoor: "Front Door",
  cat_ops: "Ops",
  cdn_short: "CDN",
  compute_short: "Compute",
  confirm: "Confirm", // ours
  container_short: "Cluster",
  db_short: "SQL DB",
  demolish: "Demolish",
  disarm: "Disarm", // ours
  dlq_short: "DLQ",
  dns_short: "GeoDNS",
  elapsed_time: "Elapsed Time",
  fw: "FW",
  game_error: "Game Error", // ours
  game_error_text: "This game hit an error and stopped.", // ours
  goodput_label: "GOODPUT (30s)",
  gpu_short: "GPU",
  infgw_short: "Inf GW",
  internet_stays: "The Internet stays", // ours
  lb: "LB",
  link: "Link",
  link_exists: "{from} already sends to {to}", // ours
  link_made: "Linked {from} to {to}", // ours
  link_rejected: "{from} can't send traffic to {to}.",
  link_reverse: "{to} already sends to {from}; a link runs one way", // ours
  load_rps: "LOAD (RPS)",
  monitor_short: "Monitor",
  no_money: "Not enough money", // ours
  nosql_short: "NoSQL",
  not_allowed: "Not allowed", // ours
  not_upgradable: "That cannot be upgraded", // ours
  nothing_there: "Nothing there", // ours
  nothing_to_repair: "Nothing to repair", // ours
  notify_short: "Notify",
  off_board: "That is off the board", // ours
  over_money: "The account is $1,000 in the red. The run is over.", // ours
  over_reputation: "Reputation hit zero. The customers have left.", // ours
  over_retired: "You ended the run.", // ours
  pause: "Pause", // ours
  per_minute: "/min", // ours
  play_again: "Play again", // ours
  power_hud: "{used}/{cap} kW",
  power_label: "Power",
  power_short: "Substation",
  pubsub_short: "Pub/Sub",
  queue: "Queue",
  reload: "Reload", // ours
  replica_short: "Replica",
  reputation: "REPUTATION",
  resume: "Resume", // ours
  run_is_over: "The run is over", // ours
  run_over: "Run over", // ours
  scheduler_short: "Cron",
  search_short: "Search",
  select: "Select",
  serverless_short: "Serverless",
  sound_off: "Sound off", // ours
  sound_on: "Sound on", // ours
  speed_n: "Speed {n}x", // ours
  storage_short: "Storage",
  stream_short: "Stream",
  survived: "Survived {time}", // ours
  tile_taken: "That tile is taken", // ours
  tools: "Tools", // ours
  top_down: "Top-down view", // ours
  top_tier: "Already at the top tier", // ours
  total_score: "TOTAL SCORE",
  turn_left: "Turn left", // ours
  turn_right: "Turn right", // ours
  upgrade: "Upgrade", // ours
  upkeep_label: "Upkeep",
  warehouse_short: "Warehouse",
} as const;

/** Fill a string's {name} placeholders. A placeholder with no value is left as it is. */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}
