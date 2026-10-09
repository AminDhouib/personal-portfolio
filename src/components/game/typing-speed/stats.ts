import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { DEFAULT_MODE, isModeId, type ModeId } from "./engine/modes";
import { mergeKeyStats, type KeyStats } from "./engine/series";

// Local statistics: their own key, never uploaded, display-only (forgeable, so
// nothing reads them to gate anything). The daily and rain fields exist from
// the first version (zero) so the Daily (T4-4) and Word Rain (T4-6) PRs never
// change the shape; see DESIGN.md's Typing Speed section.
export const STATS_KEY = "typing:stats";

const COUNT_CAP = 999_999_999;

export interface Best {
  wpm: number;
  raw: number;
  acc: number;
  day: string;
}

export interface Stats {
  v: 1;
  runs: number;
  lastMode: ModeId;
  bests: Partial<Record<ModeId, Best>>;
  keys: KeyStats;
  daily: { streak: number; bestStreak: number; lastDay: string | null; days: number };
  rain: { best: number; bestWave: number };
  prefs: { ghost: boolean };
}

export function emptyStats(): Stats {
  return {
    v: 1,
    runs: 0,
    lastMode: DEFAULT_MODE,
    bests: {},
    keys: {},
    daily: { streak: 0, bestStreak: 0, lastDay: null, days: 0 },
    rain: { best: 0, bestWave: 0 },
    prefs: { ghost: true },
  };
}

const count = z.number().int().min(0).max(COUNT_CAP);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bestSchema = z.object({ wpm: count, raw: count, acc: count.max(100), day });
const keySchema = z.object({ hits: count, misses: count });

const statsSchema = z.object({
  v: z.literal(1),
  // Each field falls back on its own, so one bad field never costs the rest.
  runs: count.catch(0),
  lastMode: z.unknown(),
  bests: z.record(z.string(), z.unknown()).catch({}),
  keys: z.record(z.string(), z.unknown()).catch({}),
  daily: z
    .object({ streak: count, bestStreak: count, lastDay: day.nullable(), days: count })
    .catch(emptyStats().daily),
  rain: z.object({ best: count, bestWave: count }).catch(emptyStats().rain),
  prefs: z.object({ ghost: z.boolean() }).catch(emptyStats().prefs),
});

export function parseStats(raw: unknown): Stats {
  const result = statsSchema.safeParse(raw);
  if (!result.success) return emptyStats();
  const d = result.data;
  const bests: Stats["bests"] = {};
  for (const [mode, value] of Object.entries(d.bests)) {
    const parsed = bestSchema.safeParse(value);
    if (isModeId(mode) && parsed.success) bests[mode] = parsed.data;
  }
  const keys: KeyStats = {};
  for (const [ch, value] of Object.entries(d.keys)) {
    const parsed = keySchema.safeParse(value);
    if ([...ch].length === 1 && parsed.success) keys[ch] = parsed.data;
  }
  return {
    v: 1,
    runs: d.runs,
    lastMode: isModeId(d.lastMode) ? d.lastMode : DEFAULT_MODE,
    bests,
    keys,
    daily: d.daily,
    rain: d.rain,
    prefs: d.prefs,
  };
}

export function loadStats(): Stats {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means empty statistics
    return emptyStats();
  }
  if (text === null) return emptyStats();
  return parseStats(safeJsonParse<unknown>(text, "typing:stats"));
}

/** True when the stored value was written by a newer build; saving over it would downgrade it. */
function storedVersionIsNewer(): boolean {
  let text: string | null;
  try {
    text = window.localStorage.getItem(STATS_KEY);
  } catch {
    // silent-ok: blocked storage cannot hold a newer value, and the save will fail on its own
    return false;
  }
  if (text === null) return false;
  const value = safeJsonParse(text, "typing-stats");
  if (typeof value !== "object" || value === null) return false;
  const v = (value as { v?: unknown }).v;
  return typeof v === "number" && v > 1;
}

export function saveStats(stats: Stats): void {
  if (storedVersionIsNewer()) return;
  safeLocalSet(STATS_KEY, JSON.stringify(stats));
}

export interface RunRecord {
  mode: ModeId;
  netWpm: number;
  rawWpm: number;
  accuracy: number;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  keys: KeyStats;
  /** Input events that inserted several letters at once; such a run never counts. */
  bulk: number;
}

/**
 * Folds a finished Word Rain run into its local best (the reserved `rain` fields). The best
 * score and the best wave are kept apart, and a run typed with suggestions never counts.
 */
export function recordRain(stats: Stats, r: { score: number; wave: number; bulk: boolean }): Stats {
  if (r.bulk) return stats;
  const next = structuredClone(stats);
  next.rain.best = Math.min(COUNT_CAP, Math.max(next.rain.best, r.score));
  next.rain.bestWave = Math.min(COUNT_CAP, Math.max(next.rain.bestWave, r.wave));
  return next;
}

/** The UTC day before `dayKey` ("2026-10-09" -> "2026-10-08"). */
function previousDay(dayKey: string): string {
  const date = new Date(`${dayKey}T00:00:00Z`);
  return new Date(date.getTime() - 86_400_000).toISOString().slice(0, 10);
}

/**
 * Folds a finished daily attempt into the streak (the reserved `daily` fields). A repeat of
 * the same day changes nothing, the next UTC day extends it, and a gap, or a last day ahead
 * of this one (a wrong clock once), restarts it at one.
 */
export function recordDay(stats: Stats, today: string): Stats {
  const last = stats.daily.lastDay;
  if (last === today) return stats;
  const next = structuredClone(stats);
  const d = next.daily;
  d.streak = last === previousDay(today) ? Math.min(COUNT_CAP, d.streak + 1) : 1;
  d.bestStreak = Math.max(d.bestStreak, d.streak);
  d.lastDay = today;
  d.days = Math.min(COUNT_CAP, d.days + 1);
  return next;
}

/** The streak as it stands today: it lapses once a whole UTC day passes with no daily attempt. */
export function streakAsOf(stats: Stats, today: string): number {
  const { lastDay, streak } = stats.daily;
  return lastDay === today || lastDay === previousDay(today) ? streak : 0;
}

/**
 * Folds one finished run in. A bulk run counts as played and as the last mode
 * and nothing else, so bests and key totals stay honest.
 */
export function recordRun(stats: Stats, r: RunRecord): Stats {
  const next = structuredClone(stats);
  next.runs = Math.min(COUNT_CAP, next.runs + 1);
  // The page never opens on the Daily view: it is a date-bound mode, not a preference.
  if (r.mode !== "daily") next.lastMode = r.mode;
  if (r.bulk > 0) return next;
  const best = next.bests[r.mode];
  // A zero-WPM run is played, but it is not a best to beat.
  if (r.netWpm > 0 && (!best || r.netWpm > best.wpm)) {
    next.bests[r.mode] = { wpm: r.netWpm, raw: r.rawWpm, acc: r.accuracy, day: r.day };
  }
  next.keys = mergeKeyStats(next.keys, r.keys);
  return next;
}
