/**
 * Rotating pool of 5-letter words used by the "today's Wordle" rule. The
 * actual Wordle of the day would need an external API; instead we derive a
 * deterministic word from the current UTC date so every player on the same
 * day gets the same answer. Word pool excludes obscurities and slurs.
 */
export const WORDLE_WORDS: readonly string[] = Object.freeze([
  "FLAME", "GLINT", "BRAVE", "CHORD", "DWELL",
  "EMBER", "FROST", "GRAIN", "HAZEL", "IVORY",
  "JOLLY", "KNEEL", "LEMON", "MERRY", "NOBLE",
  "OLIVE", "PRIDE", "QUIRK", "RAVEN", "SPARK",
  "TONIC", "UNITE", "VIVID", "WRATH", "YIELD",
  "ZEBRA", "AMBER", "BLOOM", "CRAFT", "DREAM",
  "EAGER", "FABLE", "GLEAM", "HOVER", "IDEAL",
]);

/** Today's word, derived from UTC date. Same for everyone on the same day. */
export function wordleOfTheDay(date: Date = new Date()): string {
  // Index by day-of-year + year modulo so it rotates daily.
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 0);
  const diff = date.getTime() - start;
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  const idx = (day + y) % WORDLE_WORDS.length;
  return WORDLE_WORDS[idx];
}
