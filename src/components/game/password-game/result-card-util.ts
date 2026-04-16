export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}

/**
 * 1-5 rating based on tier mix. Each rule contributes its tier value;
 * average divided by 1.0, clamped to [1, 5].
 */
export function computeDifficultyRating(tiers: number[]): number {
  if (tiers.length === 0) return 1;
  const avg = tiers.reduce((a, b) => a + b, 0) / tiers.length;
  return Math.max(1, Math.min(5, Math.round(avg)));
}

interface TitleInput {
  timeSeconds: number;
  rulesCleared: number;
  tiers: number[];
}

const FAST_TITLES = ["The Unbreakable", "Speed Demon", "Machine-Fast"];
const AVERAGE_TITLES = ["Survivor", "Password Adept", "Chaos Tamer"];
const SLOW_TITLES = ["Persistent", "Barely Survived", "Methodical"];

export function pickResultTitle(input: TitleInput): string {
  const avgPerRule = input.timeSeconds / Math.max(1, input.rulesCleared);
  // Simple deterministic pick based on the input so the same run always
  // gets the same title (not true randomness here; avoids PRNG dependency).
  const bucket = avgPerRule < 6 ? FAST_TITLES
    : avgPerRule < 30 ? AVERAGE_TITLES
    : SLOW_TITLES;
  const idx = (input.tiers.reduce((a, b) => a + b, 0) + input.rulesCleared) % bucket.length;
  return bucket[idx];
}
