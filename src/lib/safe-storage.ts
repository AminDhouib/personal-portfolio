/**
 * Client-side storage normalization helpers used by game components (RC-4
 * residue: DD4-004 highscores shape guard, DD4-001 bare localStorage writes).
 *
 * `asNumberArray` turns an `unknown` value (typically straight out of
 * `safeJsonParse<unknown>`) into a `number[]`, dropping anything that isn't
 * a number instead of trusting an unchecked cast. A corrupt or hand-edited
 * highscores payload must become an empty list, not a runtime shape
 * violation deep inside a render loop.
 *
 * `safeLocalSet` is a best-effort `localStorage.setItem` that never throws
 * (private mode, quota limits, blocked storage, or an absent `window` all
 * just fail silently); callers that need to know whether the write landed
 * can check the boolean return.
 */

export function asNumberArray(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === "number");
}

export function safeLocalSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // silent-ok: best-effort write; private mode, quota limits, blocked storage, or an absent window must not crash the caller
    return false;
  }
}
