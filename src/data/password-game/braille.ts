/**
 * Grade-1 English Braille — Unicode braille patterns block (U+2800–U+28FF).
 * Each letter maps to the single-cell braille character.
 */
export const BRAILLE: Record<string, string> = {
  a: "\u2801", b: "\u2803", c: "\u2809", d: "\u2819", e: "\u2811",
  f: "\u280B", g: "\u281B", h: "\u2813", i: "\u280A", j: "\u281A",
  k: "\u2805", l: "\u2807", m: "\u280D", n: "\u281D", o: "\u2815",
  p: "\u280F", q: "\u281F", r: "\u2817", s: "\u280E", t: "\u281E",
  u: "\u2825", v: "\u2827", w: "\u283A", x: "\u282D", y: "\u283D", z: "\u2835",
};

export function toBraille(word: string): string {
  return [...word.toLowerCase()]
    .map((c) => BRAILLE[c] ?? " ")
    .join(" ");
}

export const BRAILLE_WORDS: readonly string[] = [
  "cat", "dog", "sun", "moon", "star", "fish", "lion", "bird",
  "pizza", "apple", "grape", "lemon", "cloud", "river", "piano",
  "robot", "tiger", "wolf", "frog", "quiet",
];
