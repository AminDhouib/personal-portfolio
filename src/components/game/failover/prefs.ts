import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

// Failover's two device preferences, each under its own key: whether sound is
// on (off until the player turns it on) and the graphics tier override. Both
// are versioned JSON so a later shape can be told apart from this one.

export const AUDIO_KEY = "failover:audio";
// Only the game's own chunk carries this string: scripts/check-bundle-budget.mjs
// finds the game in the build output by it. Rename it there too.
export const GFX_KEY = "failover:gfx";

/** Auto picks a tier from the device and frame times; High and Low pin it. */
export type GfxPref = "auto" | "high" | "low";

// Checked by hand, not with zod: zod would put about 1 MB (dev) into the game's
// chunk group for two tiny shapes. The prefs tests pin what is accepted.
const GFX_PREFS: readonly GfxPref[] = ["auto", "high", "low"];

/** A version-1 record: a plain object with v === 1 (extra fields are ignored). */
function v1(raw: unknown): Record<string, unknown> | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  return record.v === 1 ? record : null;
}

function read(key: string, scope: string): unknown {
  let text: string | null;
  try {
    text = window.localStorage.getItem(key);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means the default
    return null;
  }
  return text === null ? null : safeJsonParse<unknown>(text, scope);
}

/** True when `key` holds an object whose `v` is above 1: a newer build wrote it, so leave it. */
function newerVersionStored(key: string): boolean {
  const value = read(key, "failover:prefs-version");
  if (typeof value !== "object" || value === null) return false;
  const v = (value as { v?: number }).v;
  return typeof v === "number" && v > 1;
}

export function parseAudioOn(raw: unknown): boolean {
  const on = v1(raw)?.on;
  return typeof on === "boolean" ? on : false;
}

export function loadAudioOn(): boolean {
  return parseAudioOn(read(AUDIO_KEY, "failover:audio"));
}

export function saveAudioOn(on: boolean): void {
  if (newerVersionStored(AUDIO_KEY)) return;
  safeLocalSet(AUDIO_KEY, JSON.stringify({ v: 1, on }));
}

export function parseGfxPref(raw: unknown): GfxPref {
  const tier = v1(raw)?.tier;
  return GFX_PREFS.find((pref) => pref === tier) ?? "auto";
}

export function loadGfxPref(): GfxPref {
  return parseGfxPref(read(GFX_KEY, "failover:gfx"));
}

export function saveGfxPref(tier: GfxPref): void {
  if (newerVersionStored(GFX_KEY)) return;
  safeLocalSet(GFX_KEY, JSON.stringify({ v: 1, tier }));
}
