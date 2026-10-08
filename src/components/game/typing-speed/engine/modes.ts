import { dailyText } from "./daily";
import { passageAt } from "./text";
import type { Content, RunConfig, Seconds } from "./types";

export const MODE_IDS = [
  "words-15",
  "words-30",
  "words-60",
  "words-120",
  "quotes-15",
  "quotes-30",
  "quotes-60",
  "quotes-120",
  "quote",
  "daily",
] as const;

export type ModeId = (typeof MODE_IDS)[number];

export const DEFAULT_MODE: ModeId = "words-30";

export const DURATIONS: readonly Seconds[] = [15, 30, 60, 120];

export function isModeId(x: unknown): x is ModeId {
  return typeof x === "string" && (MODE_IDS as readonly string[]).includes(x);
}

/** Splits a timed mode id into its content and length; null for the quote and the daily. */
export function parseMode(mode: ModeId): { content: Content; seconds: Seconds } | null {
  if (mode === "quote" || mode === "daily") return null;
  const [content, secs] = mode.split("-");
  return { content: content as Content, seconds: Number(secs) as Seconds };
}

export function modeId(content: Content, seconds: Seconds): ModeId {
  return `${content}-${seconds}` as ModeId;
}

/** `dayKey` (UTC, YYYY-MM-DD) picks the daily text; the seed and passage number do not matter to it. */
export function configFor(mode: ModeId, seed: number, passageNo = 0, dayKey = ""): RunConfig {
  if (mode === "daily") return { kind: "text", text: dailyText(dayKey).text };
  const timed = parseMode(mode);
  if (!timed) return { kind: "text", text: passageAt(seed, passageNo).text };
  return { kind: "time", seconds: timed.seconds, content: timed.content, seed };
}

export function modeLabel(mode: ModeId): string {
  const timed = parseMode(mode);
  if (!timed) return mode === "daily" ? "Daily" : "Quote";
  return `${timed.seconds}s ${timed.content}`;
}
