import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

// Today's daily record: attempts, the best attempt and what was posted. Its own key, never
// uploaded as a whole and display-only (forgeable, so nothing gates on it). Versioned like
// typing:stats; a newer build's record is left alone rather than downgraded. One record, for
// one UTC day: another day's record loads fresh but keeps the handle.
export const DAILY_KEY = "typing:daily";

/** The handle last used on the board; the server sanitizes it to the same length. */
export const HANDLE_MAX = 12;
const COUNT_CAP = 999_999_999;

export interface DailyBest {
  wpm: number;
  ms: number;
  chars: number;
  acc: number;
}

export interface DailyRecord {
  v: 1;
  /** UTC day, YYYY-MM-DD. */
  day: string;
  handle: string;
  attempts: number;
  best: DailyBest | null;
  /** The WPM last accepted by the board, or null when nothing was posted today. */
  posted: number | null;
}

export function emptyDaily(day: string, handle = ""): DailyRecord {
  return { v: 1, day, handle, attempts: 0, best: null, posted: null };
}

const count = z.number().int().min(0).max(COUNT_CAP);
const bestSchema = z.object({
  wpm: count,
  ms: count.min(1),
  chars: count.min(1),
  acc: count.max(100),
});

// Each field falls back on its own, so one bad field never costs the rest.
const recordSchema = z.object({
  v: z.literal(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  handle: z
    .string()
    .transform((text) => text.slice(0, HANDLE_MAX))
    .catch(""),
  attempts: count.catch(0),
  best: bestSchema.nullable().catch(null),
  posted: count.nullable().catch(null),
});

/** Today's record, or a fresh one (keeping the handle) for any other day or unreadable data. */
export function loadDaily(today: string): DailyRecord {
  let text: string | null;
  try {
    text = window.localStorage.getItem(DAILY_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means a fresh record
    return emptyDaily(today);
  }
  if (text === null) return emptyDaily(today);
  const parsed = recordSchema.safeParse(safeJsonParse<unknown>(text, "typing:daily"));
  if (!parsed.success) return emptyDaily(today);
  const rec = parsed.data;
  return rec.day === today ? rec : emptyDaily(today, rec.handle);
}

/** True when the stored value was written by a newer build; saving over it would downgrade it. */
function storedVersionIsNewer(): boolean {
  let text: string | null;
  try {
    text = window.localStorage.getItem(DAILY_KEY);
  } catch {
    // silent-ok: blocked storage cannot hold a newer value, and the save will fail on its own
    return false;
  }
  if (text === null) return false;
  const value = safeJsonParse(text, "typing-daily-version");
  if (typeof value !== "object" || value === null) return false;
  const v = (value as { v?: unknown }).v;
  return typeof v === "number" && v > 1;
}

export function saveDaily(rec: DailyRecord): void {
  if (storedVersionIsNewer()) return;
  safeLocalSet(DAILY_KEY, JSON.stringify(rec));
}

export interface Attempt extends DailyBest {
  /** The run took input that inserted several letters at once; it never becomes the best. */
  bulk: boolean;
}

/**
 * Folds one finished attempt in. Every attempt counts; the best rises only on a strictly
 * higher WPM (a tie keeps the earlier attempt), and a bulk attempt never becomes the best.
 */
export function recordAttempt(rec: DailyRecord, a: Attempt): DailyRecord {
  const next = structuredClone(rec);
  next.attempts = Math.min(COUNT_CAP, next.attempts + 1);
  if (a.bulk || a.wpm <= 0) return next;
  if (next.best === null || a.wpm > next.best.wpm) {
    next.best = { wpm: a.wpm, ms: a.ms, chars: a.chars, acc: a.acc };
  }
  return next;
}

export function markPosted(rec: DailyRecord, wpm: number): DailyRecord {
  return { ...rec, posted: wpm };
}

/** Remembers the handle last used on the board; returns the same object when unchanged. */
export function setHandle(rec: DailyRecord, handle: string): DailyRecord {
  const next = handle.slice(0, HANDLE_MAX);
  return rec.handle === next ? rec : { ...rec, handle: next };
}
