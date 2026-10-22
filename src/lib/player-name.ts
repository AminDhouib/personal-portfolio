/**
 * Display-name sanitizer for player-submitted leaderboard names. Strips the
 * character classes that let a name break rendering or spoof the board
 * (P2-DATA-011): C0/C1 controls and DEL, zero-width characters, and bidi
 * direction controls (an RTL override can visually rearrange the whole row),
 * and the fillers that draw nothing yet are not whitespace to `trim` (T-6413):
 * a name made only of them used to be stored and shown as an empty-looking row.
 */
const STRIPPED = new RegExp(
  "[" +
    "\\u0000-\\u001f" + // C0 controls
    "\\u007f-\\u009f" + // DEL + C1 controls
    "\\u00ad" + // soft hyphen
    "\\u115f\\u1160" + // Hangul choseong / jungseong fillers
    "\\u200b-\\u200f" + // zero-width space/joiners + LRM/RLM
    "\\u202a-\\u202e" + // bidi embedding/override controls
    "\\u2060-\\u2064" + // word joiner + invisible operators
    "\\u2066-\\u2069" + // bidi isolate controls
    "\\u2800" + // braille pattern blank (the other braille patterns are visible and stay)
    "\\u3164" + // Hangul filler
    "\\ufeff" + // BOM / zero-width no-break space
    "\\uffa0" + // halfwidth Hangul filler
    "]",
  "g",
);

/**
 * Variation selectors (VS1-16 and the supplement) are not stripped: VS16 is what makes a heart or a
 * keycap an emoji, and dropping it would change how a real name looks. They only matter when
 * nothing else is left, so they and whitespace are ignored by the emptiness check alone.
 */
const BLANK_OR_SELECTOR = /[\s\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]/gu;

export function sanitizePlayerName(
  raw: unknown,
  opts: { maxLength: number; fallback: string },
): string {
  if (typeof raw !== "string") return opts.fallback;
  const cleaned = raw.replace(STRIPPED, "").trim().slice(0, opts.maxLength);
  // Decided after the cut, so selector padding cannot push the visible letters out of the name.
  return cleaned.replace(BLANK_OR_SELECTOR, "").length > 0 ? cleaned : opts.fallback;
}
