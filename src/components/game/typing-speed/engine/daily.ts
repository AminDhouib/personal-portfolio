// The daily text: one passage per UTC day, the same for everyone. PURE and DOM-free: the
// server's arcade check imports this module (daily.test.ts runs in node). Seeded from
// utcDayKey (src/lib/arcade/boards.ts) so the text and the daily board turn over together
// (DESIGN.md "Daily-seed convention").
import { fnv1a, mulberry32 } from "@/components/game/password-game-2/engine/rng";
import { PASSAGES, type Passage } from "../corpus/passages";

/** Bump the version if the recipe ever changes; an old day's text must not shift. */
export const DAILY_SEED_PREFIX = "typing-daily-v1-";

export const DAILY_MIN_CHARS = 180;
export const DAILY_MAX_CHARS = 360;

const POOL: readonly Passage[] = PASSAGES.filter(
  (p) => p.text.length >= DAILY_MIN_CHARS && p.text.length <= DAILY_MAX_CHARS,
);

export interface DailyText {
  dayKey: string;
  passageId: string;
  text: string;
  sourceId: string;
}

export function dailyText(dayKey: string): DailyText {
  const pick = Math.floor(mulberry32(fnv1a(`${DAILY_SEED_PREFIX}${dayKey}`))() * POOL.length);
  const passage = POOL[pick] as Passage;
  return { dayKey, passageId: passage.id, text: passage.text, sourceId: passage.source };
}

/** "2026-10-08" -> 20261008. */
export function dayNumber(dayKey: string): number {
  return Number(dayKey.replace(/-/g, ""));
}

/** The fastest anyone is credited: 300 WPM, which is 40 ms per character. */
export const WPM_CEILING = 300;
export const MS_PER_CHAR_FLOOR = 12_000 / WPM_CEILING;

/** Net WPM as a whole number, the figure the run card shows: chars / 5 per minute. */
export function dailyScore(chars: number, ms: number): number {
  return Math.round((chars * 12_000) / ms);
}

/**
 * Why a claimed daily result is impossible, or null. `textLength` is today's text. A
 * completed run types every character at least once, so even with uncorrected mistakes it
 * cannot take less than the whole text at the ceiling; with chars <= textLength that bounds
 * the score at 300. A ceiling on client numbers, not proof of an honest run.
 */
export function checkTypingDaily(
  textLength: number,
  score: number,
  detail: { ms: number; chars: number; acc: number },
): string | null {
  if (detail.ms < textLength * MS_PER_CHAR_FLOOR) return "run shorter than the text allows";
  if (detail.chars > textLength) return "more characters than the text has";
  if (score !== dailyScore(detail.chars, detail.ms)) return "score does not match the run";
  return null;
}
