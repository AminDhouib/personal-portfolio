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
    "\\u061c" + // Arabic letter mark: a bidi control like LRM/RLM below (T-6452)
    "\\u115f\\u1160" + // Hangul choseong / jungseong fillers
    "\\u200b-\\u200f" + // zero-width space/joiners + LRM/RLM
    "\\u202a-\\u202e" + // bidi embedding/override controls
    "\\u2060-\\u2064" + // word joiner + invisible operators
    "\\u2066-\\u2069" + // bidi isolate controls
    "\\ufeff" + // BOM / zero-width no-break space
    "]",
  "g",
);

/**
 * The fillers that take up a blank cell of text rather than no width at all: the braille blank, the
 * Hangul filler and its halfwidth form. They become one space, so "A<filler>B" reads as "A B" and
 * not "AB" (T-6452); the trim and the emptiness check below then treat them like any other space.
 */
const SPACE_FILLERS = /[\u{2800}\u{3164}\u{ffa0}]/gu;

/**
 * Marks that draw nothing on their own but belong inside real words, so they are kept and only
 * count as empty when nothing else is left: whitespace, the variation selectors (VS1-16 and the
 * supplement: VS16 is what makes a heart or a keycap an emoji), U+034F (combining grapheme joiner,
 * used in sequences of combining marks), the Khmer inherent vowels U+17B4/U+17B5 and the Mongolian
 * free variation selectors and vowel separator U+180B-U+180F (needed to spell Mongolian words).
 */
const BLANK_OR_SELECTOR =
  /[\s\u{34f}\u{17b4}\u{17b5}\u{180b}-\u{180f}\u{fe00}-\u{fe0f}\u{e0100}-\u{e01ef}]/gu;

export function sanitizePlayerName(
  raw: unknown,
  opts: { maxLength: number; fallback: string },
): string {
  if (typeof raw !== "string") return opts.fallback;
  // Cut on characters, not UTF-16 units: a unit cut through the middle of an emoji left a lone
  // surrogate (T-6452). For a name with no astral characters this is the same cut as before.
  const cleaned = Array.from(raw.replace(STRIPPED, "").replace(SPACE_FILLERS, " ").trim())
    .slice(0, opts.maxLength)
    .join("");
  // Decided after the cut, so padding cannot push the visible letters out of the name.
  return cleaned.replace(BLANK_OR_SELECTOR, "").length > 0 ? cleaned : opts.fallback;
}
