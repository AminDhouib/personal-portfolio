import { formatClock } from "./stats";

export type ShareInput = {
  day: string;
  ms: number;
  streak: number;
  daily: boolean;
  biggestCrisis?: string;
};

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

/**
 * A spoiler-free, ASCII-only result line. It never carries the password, a rule's
 * text, or a seeded answer: only the time, the UTC day (daily runs), the streak
 * (two days and up) and the game URL.
 */
export function buildShareText(run: ShareInput, url: string): string {
  const head = run.daily
    ? `Password Game 2 daily ${run.day}: ${formatClock(run.ms)}`
    : `Password Game 2: ${formatClock(run.ms)}`;
  const lines = [head];
  if (run.biggestCrisis) lines.push(`Biggest crisis: ${run.biggestCrisis}`);
  if (run.streak >= 2) lines.push(`${run.streak}-day streak`);
  lines.push(url);
  return lines.join("\n");
}

async function copy(text: string): Promise<ShareOutcome> {
  const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clip) return "unavailable";
  try {
    await clip.writeText(text);
    return "copied";
  } catch {
    // silent-ok: a denied clipboard is reported to the caller as "unavailable"
    return "unavailable";
  }
}

/** Native share sheet first, then the clipboard. A dismissed sheet is a quiet no-op. */
export async function shareResult(text: string): Promise<ShareOutcome> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ text });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
      // silent-ok: a share sheet that fails for any other reason falls back to the clipboard
    }
  }
  return copy(text);
}
