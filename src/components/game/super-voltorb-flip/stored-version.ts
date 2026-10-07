import { safeJsonParse } from "@/lib/safe-json";

/**
 * True when `key` holds a JSON object whose `v` is a number above 1: written by
 * a newer build. Saving over it would silently downgrade it, so callers skip.
 */
export function storedVersionIsNewer(key: string): boolean {
  let text: string | null;
  try {
    text = window.localStorage.getItem(key);
  } catch {
    // silent-ok: blocked storage cannot hold a newer value, and the save will fail on its own
    return false;
  }
  if (text === null) return false;
  const value = safeJsonParse(text, "svf-stored-version");
  if (typeof value !== "object" || value === null) return false;
  const v = (value as { v?: unknown }).v;
  return typeof v === "number" && v > 1;
}
