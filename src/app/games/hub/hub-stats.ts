import { GAMES_BY_SLUG, type GameSlug } from "@/app/games/games-meta";
import { ACHIEVEMENTS } from "@/components/game/achievements";
import { safeJsonParse } from "@/lib/safe-json";
import { isRecord } from "./guards";

/**
 * The visitor's own bests, read from this browser and shown as a display-only glance.
 * Everything here is forgeable by design (anyone can edit their own localStorage), so none
 * of it is ever sent anywhere, written, or used for a decision. The hub reads exactly these
 * five keys: never Password Game 2 storage, never `walletCoins`, never `arcade:player:v1`.
 * hub-stats.test.ts pins the allowlist.
 */
export const HUB_STAT_KEYS = [
  "space-shooter-hs",
  "orbital-dodge-profile",
  "hextris_highscores",
  "svf:progress",
  "typing-high-score",
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

const BEST_LABEL = "Best on this device";
const SAVED_LABEL = "Saved progress";

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

export function buildDeviceStats(stored: RawStats): DeviceStatsData {
  const profile = parseOrbitalProfile(stored["orbital-dodge-profile"]);
  return {
    orbitalBest: parseScoreString(stored["space-shooter-hs"]),
    orbitalRuns: profile?.runs ?? null,
    orbitalAchievements: profile?.achievements ?? null,
    hextrisBest: parseHextrisBest(stored.hextris_highscores),
    voltorb: parseVoltorbProgress(stored["svf:progress"]),
    typingBest: parseScoreString(stored["typing-high-score"]),
  };
}

export function hasAnyStats(stats: DeviceStatsData): boolean {
  return (
    stats.orbitalBest !== null ||
    stats.orbitalRuns !== null ||
    stats.hextrisBest !== null ||
    stats.voltorb !== null ||
    stats.typingBest !== null
  );
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

/** The four chips, in display order. `null` stats (server, or not read yet) gives placeholders. */
export function statChips(stats: DeviceStatsData | null): StatChip[] {
  const runs = stats?.orbitalRuns ?? null;
  const orbitalDetail =
    runs === null
      ? ""
      : `${formatCount(runs)} ${runs === 1 ? "run" : "runs"}, ${stats?.orbitalAchievements ?? 0}/${ACHIEVEMENT_TOTAL} achievements`;
  const voltorb = stats?.voltorb ?? null;
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
