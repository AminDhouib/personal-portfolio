import { SITE_ORIGIN } from "@/data/profile";

export interface ShareRun {
  /** The UTC day of the tower, "YYYY-MM-DD". */
  dayKey: string;
  floors: number;
  score: number;
  bestStreak: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The one-line result a player pastes or sends. ASCII only. */
export function shareText({ dayKey, floors, score, bestStreak }: ShareRun): string {
  return (
    `Tower Stacker, ${dayKey}: ${plural(floors, "floor", "floors")}, ` +
    `${plural(score, "point", "points")}, best streak ${bestStreak}. ` +
    `${SITE_ORIGIN}/games/tower-stacker`
  );
}

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

/**
 * Opens the share sheet when the browser has one, else copies to the clipboard. A sheet the
 * player dismissed is left alone (no surprise copy); any other share error falls back to
 * the clipboard.
 */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "dismissed";
      // silent-ok: a broken share sheet falls through to the clipboard below
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch {
    // silent-ok: no clipboard (or it was refused); the caller says "Could not copy"
    return "failed";
  }
}
