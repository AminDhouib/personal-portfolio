import { GAMES_BY_SLUG, type GameSlug } from "@/app/games/games-meta";
import { ACHIEVEMENTS } from "@/components/game/achievements";
import { safeJsonParse } from "@/lib/safe-json";
import { isRecord } from "./guards";

/**
 * The visitor's own bests, read from this browser and shown as a display-only glance.
 * Everything here is forgeable by design (anyone can edit their own localStorage), so none
 * of it is ever sent anywhere, written, or used for a decision. The hub reads exactly these
 * nine keys: never Password Game 2 storage, never `walletCoins`, never `arcade:player:v1`.
 * hub-stats.test.ts pins the allowlist.
 */
export const HUB_STAT_KEYS = [
  "space-shooter-hs",
  "orbital-dodge-profile",
  "hextris_highscores",
  "svf:progress",
  "typing-high-score",
  "tower:stats",
  "knight:progress",
  "knight:stats",
  "failover:stats",
] as const;

type HubStatKey = (typeof HUB_STAT_KEYS)[number];

/** The raw string (or null) stored under each key. */
export type RawStats = Readonly<Record<HubStatKey, string | null>>;

export interface DeviceStatsData {
  orbitalBest: number | null;
  orbitalRuns: number | null;
  orbitalAchievements: number | null;
  hextrisBest: number | null;
  voltorb: { level: number; coins: number } | null;
  typingBest: number | null;
  towerDaily: number | null;
  towerFree: number | null;
  /** Script Knight: floors cleared across both towers, and the best daily score. */
  knight: { floors: number; daily: number | null } | null;
  /** Failover: the best survival score and the longest survival, in whole game seconds. */
  failover: { score: number; seconds: number } | null;
}

/** One chip of the "On this device" strip. `value` null means "nothing yet". */
export interface StatChip {
  slug: GameSlug;
  title: string;
  label: string;
  value: string | null;
  detail: string;
}

export const DASH = "\u2014";

const MAX_STAT = 10_000_000;
// Mirror MAX_LEVEL and MAX_TOTAL_SCORE in super-voltorb-flip/progress.ts. That module
// imports zod, which this client island must not pull in; hub-stats.test.ts pins the two
// together, case by case, against the game's own schema.
const SVF_MAX_LEVEL = 8;
const SVF_MAX_COINS = 99_999;
// Mirror FLOORS_PER_TOWER (nine) in script-knight/progress.ts, which imports zod and a storage
// writer, and TOWER_IDS in its engine/towers, which pulls in every floor's level data.
// hub-stats.test.ts pins the total to TOWER_IDS.length * FLOORS_PER_TOWER, reads a record with
// every floor of every TOWER_IDS tower cleared, and checks the parser against the game's own
// parseProgress, case by case.
const KNIGHT_TOWERS = ["narrow-path", "powder-keep"] as const;
const KNIGHT_FLOORS_PER_TOWER = 9;
export const KNIGHT_FLOOR_TOTAL = KNIGHT_TOWERS.length * KNIGHT_FLOORS_PER_TOWER;
const KNIGHT_MAX_TURNS = 200;
const KNIGHT_DAY = /^\d{4}-\d{2}-\d{2}$/;

// Mirror the failover:stats record in failover/stats.ts (a versioned record, v 1). That module
// writes, so the hub does not import it; hub-stats.test.ts pins parseFailoverBest against the
// game's own parseStats, case by case.
const FAILOVER_DAY = /^\d{4}-\d{2}-\d{2}$/;

const BEST_LABEL = "Best on this device";
const SAVED_LABEL = "Saved progress";
const FLOORS_LABEL = "Floors cleared";

export const ACHIEVEMENT_TOTAL = ACHIEVEMENTS.length;
const KNOWN_ACHIEVEMENT_IDS: ReadonlySet<string> = new Set(
  ACHIEVEMENTS.map((achievement) => achievement.id),
);

// Corrupt local data is the player's, not a fault worth a Sentry event on every visit.
const quietReport = () => {};

function parseJson(text: string | null, scope: string): unknown {
  if (text === null) return null;
  return safeJsonParse<unknown>(text, scope, null, quietReport);
}

function isCount(value: unknown): value is number {
  return (
    typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= MAX_STAT
  );
}

/** A score the games store as String(n): digits only, 1..10,000,000. */
export function parseScoreString(text: string | null): number | null {
  if (text === null || !/^\d{1,8}$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= MAX_STAT ? value : null;
}

/** Hextris stores its top three, best first, as a JSON array. */
export function parseHextrisBest(text: string | null): number | null {
  const parsed = parseJson(text, "hub:hextris");
  if (!Array.isArray(parsed)) return null;
  const first: unknown = parsed[0];
  return isCount(first) && first > 0 ? first : null;
}

/** Runs played (at least one) and how many known achievements are unlocked. */
export function parseOrbitalProfile(
  text: string | null,
): { runs: number; achievements: number } | null {
  const parsed = parseJson(text, "hub:orbital-profile");
  if (!isRecord(parsed)) return null;
  const runs = parsed.totalRunsPlayed;
  if (!isCount(runs) || runs === 0) return null;
  const unlocked: unknown[] = Array.isArray(parsed.unlockedAchievements)
    ? parsed.unlockedAchievements
    : [];
  const known = new Set<string>();
  for (const id of unlocked) {
    if (typeof id === "string" && KNOWN_ACHIEVEMENT_IDS.has(id)) known.add(id);
  }
  return { runs, achievements: known.size };
}

/** Super Voltorb Flip's saved level and coin total, clamped as the game clamps them. */
export function parseVoltorbProgress(text: string | null): { level: number; coins: number } | null {
  const parsed = parseJson(text, "hub:voltorb");
  if (!isRecord(parsed)) return null;
  const { currentLevel, totalScore } = parsed;
  if (typeof currentLevel !== "number" || !Number.isSafeInteger(currentLevel)) return null;
  if (typeof totalScore !== "number" || !Number.isSafeInteger(totalScore) || totalScore < 0) {
    return null;
  }
  return {
    level: Math.max(1, Math.min(SVF_MAX_LEVEL, currentLevel)),
    coins: Math.min(SVF_MAX_COINS, totalScore),
  };
}

/**
 * Tower Stacker's best daily score and best free score from `tower:stats` (a versioned
 * record, v 1). Read-only and forgiving: a foreign version or a bad field is just none.
 * Mirrors tower-stacker/stats.ts without importing it (that module writes).
 */
export function parseTowerStats(
  text: string | null,
): { daily: number | null; free: number | null } | null {
  const parsed = parseJson(text, "hub:tower");
  if (!isRecord(parsed) || parsed.v !== 1) return null;
  const free = isCount(parsed.bestFree) && parsed.bestFree > 0 ? parsed.bestFree : null;
  const best = parsed.bestDaily;
  const dailyScore = isRecord(best) ? best.score : null;
  const daily = isCount(dailyScore) && dailyScore > 0 ? dailyScore : null;
  return daily === null && free === null ? null : { daily, free };
}

function isNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Script Knight's cleared floors across both towers, from `knight:progress` (a versioned
 * record, v 1). A floor counts when its best has the shape the game's own schema accepts (a
 * floor key 1..9 with a finite score and grade and 1..200 turns); anything else is skipped, as
 * the game skips it. Null when the record is missing, foreign-version or not an object. Read-only:
 * mirrors script-knight/progress.ts without importing it (that module writes).
 */
export function parseKnightFloors(text: string | null): number | null {
  const parsed = parseJson(text, "hub:knight-progress");
  if (!isRecord(parsed) || parsed.v !== 1) return null;
  const towers = parsed.towers;
  if (!isRecord(towers)) return 0;
  let floors = 0;
  for (const id of KNIGHT_TOWERS) {
    const tower = towers[id];
    const best = isRecord(tower) ? tower.best : null;
    if (!isRecord(best)) continue;
    for (const [key, entry] of Object.entries(best)) {
      if (!/^[1-9]$/.test(key) || !isRecord(entry)) continue;
      const { score, grade, turns } = entry;
      const turnsOk =
        typeof turns === "number" &&
        Number.isInteger(turns) &&
        turns >= 1 &&
        turns <= KNIGHT_MAX_TURNS;
      if (isNonNegative(score) && isNonNegative(grade) && turnsOk) floors += 1;
    }
  }
  return floors;
}

/**
 * Script Knight's best daily score from `knight:stats` (v 1), floored and clamped like the
 * other scores here. Null for no best, a zero best, a bad day or score, or a foreign version.
 */
export function parseKnightBestDaily(text: string | null): number | null {
  const parsed = parseJson(text, "hub:knight-stats");
  if (!isRecord(parsed) || parsed.v !== 1) return null;
  const best = parsed.bestDaily;
  if (!isRecord(best) || typeof best.day !== "string" || !KNIGHT_DAY.test(best.day)) return null;
  if (!isNonNegative(best.score)) return null;
  const score = Math.min(MAX_STAT, Math.floor(best.score));
  return score > 0 ? score : null;
}

/**
 * Failover's best survival score and longest survival from `failover:stats` (v 1), checked as
 * the game checks it: every count a non-negative safe integer and the daily day null or a day
 * string, else the whole record is ignored. The score is clamped like the other scores here.
 * Null for no best score, a foreign version or an unreadable record. Read-only.
 */
export function parseFailoverBest(text: string | null): { score: number; seconds: number } | null {
  const parsed = parseJson(text, "hub:failover-stats");
  if (!isRecord(parsed) || parsed.v !== 1) return null;
  const { bestScore, bestSeconds, runs, lastDailyDay } = parsed;
  const counts = [bestScore, bestSeconds, runs];
  if (!counts.every((n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return null;
  if (
    lastDailyDay !== null &&
    (typeof lastDailyDay !== "string" || !FAILOVER_DAY.test(lastDailyDay))
  ) {
    return null;
  }
  const score = Math.min(MAX_STAT, bestScore as number);
  return score > 0 ? { score, seconds: bestSeconds as number } : null;
}

export function buildDeviceStats(stored: RawStats): DeviceStatsData {
  const tower = parseTowerStats(stored["tower:stats"]);
  const profile = parseOrbitalProfile(stored["orbital-dodge-profile"]);
  const floors = parseKnightFloors(stored["knight:progress"]) ?? 0;
  const knightDaily = parseKnightBestDaily(stored["knight:stats"]);
  return {
    orbitalBest: parseScoreString(stored["space-shooter-hs"]),
    orbitalRuns: profile?.runs ?? null,
    orbitalAchievements: profile?.achievements ?? null,
    hextrisBest: parseHextrisBest(stored.hextris_highscores),
    voltorb: parseVoltorbProgress(stored["svf:progress"]),
    typingBest: parseScoreString(stored["typing-high-score"]),
    towerDaily: tower?.daily ?? null,
    towerFree: tower?.free ?? null,
    knight: floors === 0 && knightDaily === null ? null : { floors, daily: knightDaily },
    failover: parseFailoverBest(stored["failover:stats"]),
  };
}

export function hasAnyStats(stats: DeviceStatsData): boolean {
  return (
    stats.orbitalBest !== null ||
    stats.orbitalRuns !== null ||
    stats.hextrisBest !== null ||
    stats.voltorb !== null ||
    stats.typingBest !== null ||
    stats.towerDaily !== null ||
    stats.towerFree !== null ||
    stats.knight !== null ||
    stats.failover !== null
  );
}

/** Whole seconds as m:ss, like the game's own HUD clock. */
function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

function bestValue(value: number | null): string | null {
  return value === null ? null : formatCount(value);
}

function chip(slug: GameSlug, label: string, value: string | null, detail = ""): StatChip {
  return { slug, title: GAMES_BY_SLUG[slug].title, label, value, detail };
}

/** The seven chips, in display order. `null` stats (server, or not read yet) gives placeholders. */
export function statChips(stats: DeviceStatsData | null): StatChip[] {
  const runs = stats?.orbitalRuns ?? null;
  const orbitalDetail =
    runs === null
      ? ""
      : `${formatCount(runs)} ${runs === 1 ? "run" : "runs"}, ${stats?.orbitalAchievements ?? 0}/${ACHIEVEMENT_TOTAL} achievements`;
  const voltorb = stats?.voltorb ?? null;
  const towerDaily = stats?.towerDaily ?? null;
  const towerFree = stats?.towerFree ?? null;
  const towerBest = Math.max(towerDaily ?? 0, towerFree ?? 0);
  const towerDetail = [
    towerDaily === null ? null : `Daily ${formatCount(towerDaily)}`,
    towerFree === null
      ? null
      : `${towerDaily === null ? "Free" : "free"} ${formatCount(towerFree)}`,
  ]
    .filter(Boolean)
    .join(", ");
  const knight = stats?.knight ?? null;
  const knightDaily = knight?.daily ?? null;
  const failover = stats?.failover ?? null;
  return [
    chip("space-shooter", BEST_LABEL, bestValue(stats?.orbitalBest ?? null), orbitalDetail),
    chip("hextris", BEST_LABEL, bestValue(stats?.hextrisBest ?? null)),
    chip(
      "super-voltorb-flip",
      SAVED_LABEL,
      voltorb === null ? null : `Level ${voltorb.level}`,
      voltorb === null
        ? ""
        : `${formatCount(voltorb.coins)} ${voltorb.coins === 1 ? "coin" : "coins"}`,
    ),
    chip("typing-speed", BEST_LABEL, bestValue(stats?.typingBest ?? null)),
    chip("tower-stacker", BEST_LABEL, towerBest > 0 ? formatCount(towerBest) : null, towerDetail),
    chip(
      "script-knight",
      FLOORS_LABEL,
      knight === null ? null : `${formatCount(knight.floors)} of ${KNIGHT_FLOOR_TOTAL}`,
      knightDaily === null ? "" : `Best daily ${formatCount(knightDaily)}`,
    ),
    chip(
      "failover",
      BEST_LABEL,
      bestValue(failover?.score ?? null),
      failover === null ? "" : `Survived ${clock(failover.seconds)}`,
    ),
  ];
}

function readRawStats(): RawStats {
  const read = (key: HubStatKey): string | null => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      // silent-ok: blocked or throwing storage (private mode, SecurityError) just means no stats.
      return null;
    }
  };
  return {
    "space-shooter-hs": read("space-shooter-hs"),
    "orbital-dodge-profile": read("orbital-dodge-profile"),
    hextris_highscores: read("hextris_highscores"),
    "svf:progress": read("svf:progress"),
    "typing-high-score": read("typing-high-score"),
    "tower:stats": read("tower:stats"),
    "knight:progress": read("knight:progress"),
    "knight:stats": read("knight:stats"),
    "failover:stats": read("failover:stats"),
  };
}

let cache: { key: string; stats: DeviceStatsData } | null = null;

/**
 * The current stats, as the same object for as long as the raw strings are unchanged
 * (useSyncExternalStore compares snapshots by identity, so a fresh object per call would
 * loop). Reads only; there is no write path in this module.
 */
export function readDeviceStatsSnapshot(): DeviceStatsData {
  const stored = readRawStats();
  const key = JSON.stringify(stored);
  if (cache?.key === key) return cache.stats;
  const stats = buildDeviceStats(stored);
  cache = { key, stats };
  return stats;
}

/** Re-read when another tab changes storage. */
export function subscribeToDeviceStats(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}
