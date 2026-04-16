/**
 * Wordle support. The authoritative answer comes from NYT via our server-side
 * proxy at /api/password-game/wordle (cached by Next). This module keeps a
 * local in-memory cache plus a deterministic offline fallback so rule
 * creation stays synchronous.
 */
export const WORDLE_WORDS: readonly string[] = Object.freeze([
  "FLAME", "GLINT", "BRAVE", "CHORD", "DWELL",
  "EMBER", "FROST", "GRAIN", "HAZEL", "IVORY",
  "JOLLY", "KNEEL", "LEMON", "MERRY", "NOBLE",
  "OLIVE", "PRIDE", "QUIRK", "RAVEN", "SPARK",
  "TONIC", "UNITE", "VIVID", "WRATH", "YIELD",
  "ZEBRA", "AMBER", "BLOOM", "CRAFT", "DREAM",
  "EAGER", "FABLE", "GLEAM", "HOVER", "IDEAL",
  "JOUST", "KARMA", "LUCID", "MIRTH", "NYMPH",
  "OASIS", "PLUMB", "QUILT", "REALM", "STORM",
  "THYME", "UMBRA", "VOUCH", "WINCE", "XENON",
  "YACHT", "ZONAL", "ABYSS", "BLAZE", "CRISP",
  "DELTA", "EPOCH", "FJORD", "GLYPH", "HAVEN",
  "INLET", "JAZZY", "KAYAK", "LOUPE", "MAPLE",
  "NICHE", "OAKEN", "PIXEL", "QUEST", "RIVER",
  "SNOWY", "TIDAL", "ULCER", "VAPOR", "WHELP",
  "XYLEM", "YIPPY", "ZESTY", "ALLOY", "BINGO",
  "CACAO", "DOWRY", "ENEMY", "FLING", "GRAVY",
  "HOUND", "IGLOO", "JUMPY", "KNACK", "LEVER",
  "MIRTH", "NADIR", "ONSET", "PIOUS", "QUAIL",
  "ROUGE", "SHARD", "TRIAD", "UPSET", "VAULT",
  "WOVEN", "YODEL", "ZAPPY", "BANJO", "CHIRP",
]);

let _todayWord: string | null = null;

/** Inject the authoritative answer (typically from the /api/password-game/wordle fetch). */
export function setTodayWord(word: string | null): void {
  _todayWord = word && /^[A-Z]{5}$/.test(word) ? word : null;
}

/** Deterministic fallback — same for everyone on the same UTC date. */
function fallbackOfTheDay(date: Date): string {
  const y = date.getUTCFullYear();
  const start = Date.UTC(y, 0, 0);
  const diff = date.getTime() - start;
  const day = Math.floor(diff / (1000 * 60 * 60 * 24));
  const idx = (day + y) % WORDLE_WORDS.length;
  return WORDLE_WORDS[idx];
}

/** Today's word — real NYT answer when available, fallback otherwise. */
export function wordleOfTheDay(date: Date = new Date()): string {
  return _todayWord ?? fallbackOfTheDay(date);
}
