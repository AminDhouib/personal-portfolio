import { z } from "zod";
import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

// Failover's two device preferences, each under its own key: whether sound is
// on (off until the player turns it on) and the graphics tier override. Both
// are versioned JSON so a later shape can be told apart from this one.

export const AUDIO_KEY = "failover:audio";
// Only the game's own chunks carry this string; scripts/check-bundle-budget.mjs
// uses it to find them in the build output if the manifest keys do not.
export const GFX_KEY = "failover:gfx";

/** Auto picks a tier from the device and frame times; High and Low pin it. */
export type GfxPref = "auto" | "high" | "low";

const audioSchema = z.object({ v: z.literal(1), on: z.boolean() });
const gfxSchema = z.object({ v: z.literal(1), tier: z.enum(["auto", "high", "low"]) });

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
  const result = audioSchema.safeParse(raw);
  return result.success ? result.data.on : false;
}

export function loadAudioOn(): boolean {
  return parseAudioOn(read(AUDIO_KEY, "failover:audio"));
}

export function saveAudioOn(on: boolean): void {
  if (newerVersionStored(AUDIO_KEY)) return;
  safeLocalSet(AUDIO_KEY, JSON.stringify({ v: 1, on }));
}

export function parseGfxPref(raw: unknown): GfxPref {
  const result = gfxSchema.safeParse(raw);
  return result.success ? result.data.tier : "auto";
}

export function loadGfxPref(): GfxPref {
  return parseGfxPref(read(GFX_KEY, "failover:gfx"));
}

export function saveGfxPref(tier: GfxPref): void {
  if (newerVersionStored(GFX_KEY)) return;
  safeLocalSet(GFX_KEY, JSON.stringify({ v: 1, tier }));
}
