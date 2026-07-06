// 6-letter common words. Kept short so anagram-guessing is tractable.
export const ANAGRAM_WORDS: readonly string[] = Object.freeze([
  "candle",
  "bridge",
  "guitar",
  "monkey",
  "rocket",
  "turtle",
  "winter",
  "silver",
  "garden",
  "pencil",
  "window",
  "forest",
  "galaxy",
  "planet",
  "purple",
  "cookie",
  "button",
  "hammer",
  "orange",
  "potato",
]);

export function scramble(word: string, rng: () => number): string {
  const chars = [...word];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const ci = chars[i];
    const cj = chars[j];
    if (ci === undefined || cj === undefined) continue;
    chars[i] = cj;
    chars[j] = ci;
  }
  const scrambled = chars.join("");
  // If we happened to not scramble at all, just reverse as fallback.
  return scrambled === word ? [...word].reverse().join("") : scrambled;
}
