import { safeJsonParse } from "@/lib/safe-json";
import { safeLocalSet } from "@/lib/safe-storage";
import { storedVersionIsNewer } from "./stored-version";

// How the player plays: by hand (tap an action each turn) or by code. Display-only and local, like
// every knight:* key. Nothing is stored until the player picks one; until then the pointer decides.
export const MODE_KEY = "knight:mode";

export type PlayMode = "hand" | "code";

/** A phone plays by hand; a desktop pointer writes code. */
export function defaultMode(coarsePointer: boolean): PlayMode {
  return coarsePointer ? "hand" : "code";
}

/** The stored mode, or null for anything that is not exactly a version-1 record of one. */
export function parseMode(raw: unknown): PlayMode | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const { v, mode } = raw as { v?: unknown; mode?: unknown };
  if (v !== 1) return null;
  return mode === "hand" || mode === "code" ? mode : null;
}

export function loadMode(coarsePointer: boolean): PlayMode {
  let text: string | null;
  try {
    text = window.localStorage.getItem(MODE_KEY);
  } catch {
    // silent-ok: blocked storage (private mode, SecurityError) just means the pointer's default
    return defaultMode(coarsePointer);
  }
  if (text === null) return defaultMode(coarsePointer);
  return parseMode(safeJsonParse<unknown>(text, "knight:mode")) ?? defaultMode(coarsePointer);
}

export function saveMode(mode: PlayMode): void {
  // A newer build wrote this: leave it alone rather than downgrade it.
  if (storedVersionIsNewer(MODE_KEY)) return;
  safeLocalSet(MODE_KEY, JSON.stringify({ v: 1, mode }));
}
