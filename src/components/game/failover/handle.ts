import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";

// The name last typed on the Daily Incident board, under failover:handle. Versioned JSON,
// checked by hand (no zod in the game's chunks). The server keeps at most 12 characters.

export const HANDLE_KEY = "failover:handle";
export const HANDLE_MAX = 12;

function readRaw(): unknown {
  let text: string | null;
  try {
    text = window.localStorage.getItem(HANDLE_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means no saved name
    return null;
  }
  return text === null ? null : safeJsonParse<unknown>(text, "failover:handle");
}

/** The name in a stored record, or null when it is not exactly a version-1 record. */
export function parseHandle(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1 || typeof r.handle !== "string") return null;
  return r.handle.slice(0, HANDLE_MAX);
}

export function loadHandle(): string {
  return parseHandle(readRaw()) ?? "";
}

/** Remember the name, unless a newer build already wrote a later version. True when written. */
export function saveHandle(handle: string): boolean {
  const stored = readRaw();
  if (typeof stored === "object" && stored !== null) {
    const v = (stored as { v?: unknown }).v;
    if (typeof v === "number" && v > 1) return false;
  }
  return safeLocalSet(HANDLE_KEY, JSON.stringify({ v: 1, handle: handle.slice(0, HANDLE_MAX) }));
}
