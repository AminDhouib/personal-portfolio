import { SITE_ORIGIN } from "@/data/profile";

export interface ShareRun {
  /** What the run was on: the UTC day of a daily ("2026-10-15") or a tower floor's name. */
  title: string;
  score: number;
  turns: number;
  /** The reference bot's score on the floor, or null when the floor has none to show. */
  par: number | null;
  /** The replay link. */
  link: string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The full address of a replay fragment ("#replay=..."). */
export function replayUrl(fragment: string): string {
  return `${SITE_ORIGIN}/games/script-knight${fragment}`;
}

/** The one-line result a player pastes or sends, ending in the replay link. ASCII only. */
export function shareText({ title, score, turns, par, link }: ShareRun): string {
  return (
    `Script Knight, ${title}: ${plural(score, "point", "points")} in ${plural(turns, "turn", "turns")}` +
    `${par === null ? "" : ` (par ${par})`} ${link}`
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
