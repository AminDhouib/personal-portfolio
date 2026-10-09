// Failover's UI text. Lifted from Server Survival's src/locales/en.js at
// 7804e59 (MIT, see NOTICE) by a one-off script and keyed like upstream, so
// other locales can return: emoji and HTML stripped, punctuation folded to
// ASCII, upstream branding dropped. Lines marked "ours" have no upstream key.
// strings-usage.test.ts keeps this list and the game's T.<key> uses equal.

export const T = {
  board_label:
    "Failover game board. Keys: 1 select, 2 link, 3 demolish, WASD pan, Q and E turn, Space pause.", // ours
  build_a_service: "Build a service", // ours
  build_menu: "Build...", // ours
  cancel: "Cancel",
  confirm: "Confirm", // ours
  demolish: "Demolish",
  game_error: "Game Error", // ours
  game_error_text: "This game hit an error and stopped.", // ours
  internet_stays: "The Internet stays", // ours
  link: "Link",
  link_exists: "{from} already sends to {to}", // ours
  link_made: "Linked {from} to {to}", // ours
  link_rejected: "{from} can't send traffic to {to}.",
  link_reverse: "{to} already sends to {from}; a link runs one way", // ours
  no_money: "Not enough money", // ours
  not_allowed: "Not allowed", // ours
  not_upgradable: "That cannot be upgraded", // ours
  nothing_there: "Nothing there", // ours
  nothing_to_repair: "Nothing to repair", // ours
  off_board: "That is off the board", // ours
  over_money: "The account is $1,000 in the red. The run is over.", // ours
  over_reputation: "Reputation hit zero. The customers have left.", // ours
  over_retired: "You ended the run.", // ours
  pause: "Pause", // ours
  play_again: "Play again", // ours
  reload: "Reload", // ours
  rep_short: "Rep", // ours
  reqs_per_second: "req/s", // ours
  resume: "Resume", // ours
  run_is_over: "The run is over", // ours
  run_over: "Run over", // ours
  select: "Select",
  sound_off: "Sound off", // ours
  sound_on: "Sound on", // ours
  speed_n: "Speed {n}x", // ours
  survived: "Survived {time}", // ours
  tile_taken: "That tile is taken", // ours
  top_down: "Top-down view", // ours
  top_tier: "Already at the top tier", // ours
  turn_left: "Turn left", // ours
  turn_right: "Turn right", // ours
  upgrade: "Upgrade", // ours
} as const;

/** Fill a string's {name} placeholders. A placeholder with no value is left as it is. */
export function fmt(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : whole,
  );
}
