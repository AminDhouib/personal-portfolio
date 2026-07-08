/**
 * Display-name sanitizer for player-submitted leaderboard names. Strips the
 * character classes that let a name break rendering or spoof the board
 * (P2-DATA-011): C0/C1 controls and DEL, zero-width characters, and bidi
 * direction controls (an RTL override can visually rearrange the whole row).
 */
const STRIPPED = new RegExp(
  "[" +
    "\\u0000-\\u001f" + // C0 controls
    "\\u007f-\\u009f" + // DEL + C1 controls
    "\\u200b-\\u200f" + // zero-width space/joiners + LRM/RLM
    "\\u202a-\\u202e" + // bidi embedding/override controls
    "\\u2060-\\u2064" + // word joiner + invisible operators
    "\\u2066-\\u2069" + // bidi isolate controls
    "\\ufeff" + // BOM / zero-width no-break space
    "]",
  "g",
);

export function sanitizePlayerName(
  raw: unknown,
  opts: { maxLength: number; fallback: string },
): string {
  if (typeof raw !== "string") return opts.fallback;
  const cleaned = raw.replace(STRIPPED, "").trim().slice(0, opts.maxLength);
  return cleaned.length > 0 ? cleaned : opts.fallback;
}
