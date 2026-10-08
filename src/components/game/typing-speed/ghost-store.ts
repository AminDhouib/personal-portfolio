import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { MAX_SAMPLES, sampleRun } from "./engine/ghost";
import { isModeId, type ModeId } from "./engine/modes";
import type { TypingRun } from "./engine/types";
import { runMetrics } from "./metrics";

// The ghost of your own best run in each mode: its net characters sampled every 250 ms. Its own
// key, never uploaded, so a large or corrupt ghost can never cost typing:stats. Versioned like
// the other keys; a newer build's value is left alone rather than downgraded. One ghost per
// mode, and the daily one belongs to a single UTC day. The on/off pref lives in typing:stats.
export const GHOSTS_KEY = "typing:ghosts";

const COUNT_CAP = 999_999_999;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface Ghost {
  /** Net WPM of the run the ghost came from. */
  wpm: number;
  /** Net characters every 250 ms from the first keystroke. */
  samples: number[];
  /** UTC day, YYYY-MM-DD: required for the daily ghost and absent on the others. */
  day?: string;
}

export interface GhostStore {
  v: 1;
  ghosts: Partial<Record<ModeId, Ghost>>;
}

export function emptyGhosts(): GhostStore {
  return { v: 1, ghosts: {} };
}

const count = z.number().int().min(0).max(COUNT_CAP);
const ghostSchema = z.object({
  wpm: count,
  samples: z.array(count).min(1).max(MAX_SAMPLES),
  day: z.string().regex(DAY).optional(),
});

const storeSchema = z.object({
  v: z.literal(1),
  ghosts: z.record(z.string(), z.unknown()).catch({}),
});

/**
 * The stored ghosts, or none for missing, corrupt or newer-version data. One bad entry is
 * dropped on its own, and a daily ghost from any day but `today` is dropped with it.
 */
export function loadGhosts(today: string): GhostStore {
  let text: string | null;
  try {
    text = window.localStorage.getItem(GHOSTS_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no ghosts
    return emptyGhosts();
  }
  if (text === null) return emptyGhosts();
  const parsed = storeSchema.safeParse(safeJsonParse<unknown>(text, "typing:ghosts"));
  if (!parsed.success) return emptyGhosts();
  const ghosts: GhostStore["ghosts"] = {};
  for (const [mode, value] of Object.entries(parsed.data.ghosts)) {
    const entry = ghostSchema.safeParse(value);
    if (!isModeId(mode) || !entry.success) continue;
    if (mode === "daily" && entry.data.day !== today) continue;
    ghosts[mode] = entry.data;
  }
  return { v: 1, ghosts };
}

/** True when the stored value was written by a newer build; saving over it would downgrade it. */
function storedVersionIsNewer(): boolean {
  let text: string | null;
  try {
    text = window.localStorage.getItem(GHOSTS_KEY);
  } catch {
    // silent-ok: blocked storage cannot hold a newer value, and the save will fail on its own
    return false;
  }
  if (text === null) return false;
  const value = safeJsonParse(text, "typing-ghosts-version");
  if (typeof value !== "object" || value === null) return false;
  const v = (value as { v?: unknown }).v;
  return typeof v === "number" && v > 1;
}

export function saveGhosts(store: GhostStore): void {
  if (storedVersionIsNewer()) return;
  safeLocalSet(GHOSTS_KEY, JSON.stringify(store));
}

/** The ghost to race in a mode; the daily one only on its own day. */
export function ghostFor(store: GhostStore, mode: ModeId, day?: string): Ghost | null {
  const ghost = store.ghosts[mode];
  if (!ghost) return null;
  if (mode === "daily" && ghost.day !== day) return null;
  return ghost;
}

/**
 * Offers a finished run as the mode ghost. It replaces the stored one only on a strictly
 * higher net WPM (a tie keeps the earlier run), and never when the run used phone suggestions,
 * scored nothing, or ran past the 120 s a ghost can hold. Returns the same object when
 * nothing changed, so the caller can skip the save. `day` is required for the daily.
 */
export function offerGhost(
  store: GhostStore,
  mode: ModeId,
  run: TypingRun,
  day?: string,
): GhostStore {
  if (run.bulk > 0 || (mode === "daily" && !day)) return store;
  const wpm = runMetrics(run).netWpm;
  if (wpm <= 0) return store;
  const current = ghostFor(store, mode, day);
  if (current && wpm <= current.wpm) return store;
  const samples = sampleRun(run);
  if (samples.length > MAX_SAMPLES) return store;
  const ghost: Ghost = mode === "daily" ? { wpm, samples, day } : { wpm, samples };
  return { v: 1, ghosts: { ...store.ghosts, [mode]: ghost } };
}
