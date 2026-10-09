import { SITE_ORIGIN } from "@/data/profile";

export const HEXTRIS_URL = `${SITE_ORIGIN}/games/hextris`;

/** The line a player shares. ASCII only; the link travels beside it. */
export function shareText(score: number): string {
  return `I scored ${score} in Hextris`;
}

export type ShareOutcome = "shared" | "copied" | "dismissed" | "failed";

/**
 * Opens the share sheet (title, line and link) when the browser has one, else copies the line
 * and the link. A sheet the player dismissed, or one already open (InvalidStateError), is left
 * alone (no surprise copy); any other share error falls back to the clipboard.
 */
export async function shareRun(score: number): Promise<ShareOutcome> {
  const text = shareText(score);
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "Hextris", text, url: HEXTRIS_URL });
      return "shared";
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === "AbortError" || err.name === "InvalidStateError")
      ) {
        return "dismissed";
      }
      // silent-ok: a broken share sheet falls through to the clipboard below
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${HEXTRIS_URL}`);
    return "copied";
  } catch {
    // silent-ok: no clipboard (or it was refused); the sheet says "Could not copy"
    return "failed";
  }
}
