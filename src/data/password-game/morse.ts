export const MORSE: Readonly<Record<string, string>> = Object.freeze({
  A: ".-", B: "-...", C: "-.-.", D: "-..", E: ".", F: "..-.", G: "--.",
  H: "....", I: "..", J: ".---", K: "-.-", L: ".-..", M: "--", N: "-.",
  O: "---", P: ".--.", Q: "--.-", R: ".-.", S: "...", T: "-", U: "..-",
  V: "...-", W: ".--", X: "-..-", Y: "-.--", Z: "--..",
});

export function toMorse(word: string): string {
  return [...word.toUpperCase()]
    .map((c) => MORSE[c] ?? "")
    .filter(Boolean)
    .join(" ");
}

export const MORSE_WORDS: readonly string[] = Object.freeze([
  "SOS", "HI", "YES", "NO", "HELP", "CAT", "DOG", "RUN", "WIN", "LOVE",
]);
