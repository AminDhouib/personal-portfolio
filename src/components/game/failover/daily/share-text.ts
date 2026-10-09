import { T, fmt } from "../strings";
import { clock } from "../ui/format";

export interface DailyShare {
  /** The UTC day of the incident, "YYYY-MM-DD". */
  day: string;
  /** Whole game seconds survived. */
  seconds: number;
  score: number;
}

/** The one-line result a player pastes or sends. ASCII only. */
export function dailyShareText({ day, seconds, score }: DailyShare): string {
  return fmt(T.daily_share, { day, time: clock(seconds), score });
}

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

/**
 * Opens the share sheet when the browser has one, else copies to the clipboard. A sheet the
 * player dismissed is left alone (no surprise copy); any other share error falls back to
 * the clipboard.
 */
export async function shareDaily(text: string): Promise<ShareOutcome> {
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
