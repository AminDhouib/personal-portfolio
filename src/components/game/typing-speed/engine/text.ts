import { fnv1a, mulberry32 } from "@/components/game/password-game-2/engine/rng";
import { PASSAGES, type Passage } from "../corpus/passages";
import { COMMON_WORDS } from "../corpus/words";

/** Words split on single spaces; punctuation stays on its word. */
export function splitWords(text: string): string[] {
  return text.split(" ").filter((w) => w.length > 0);
}

const streams = new Map<number, string[]>();

/**
 * The i-th word of a seeded stream. Pure: the same (seed, i) always gives the
 * same word, and a word never repeats the one before it. The stream is built
 * sequentially and memoized per seed so each word can see its predecessor.
 */
export function wordAt(seed: number, i: number): string {
  let stream = streams.get(seed);
  if (!stream) {
    stream = [];
    streams.set(seed, stream);
  }
  for (let k = stream.length; k <= i; k++) {
    let idx = Math.floor(mulberry32(fnv1a(`ts-w-${seed}-${k}`))() * COMMON_WORDS.length);
    if (COMMON_WORDS[idx] === stream[k - 1]) idx = (idx + 1) % COMMON_WORDS.length;
    stream.push(COMMON_WORDS[idx] ?? "the");
  }
  return stream[i] ?? "the";
}

const permutations = new Map<string, readonly Passage[]>();

function permutation(seed: number, cycle: number): readonly Passage[] {
  const key = `${seed}:${cycle}`;
  const hit = permutations.get(key);
  if (hit) return hit;
  const rng = mulberry32(fnv1a(`ts-p-${seed}-${cycle}`));
  const out = [...PASSAGES];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as Passage;
    out[i] = out[j] as Passage;
    out[j] = a;
  }
  permutations.set(key, out);
  return out;
}

/** The i-th passage of a seeded shuffle; no repeat until every passage was used. */
export function passageAt(seed: number, i: number): Passage {
  const n = PASSAGES.length;
  return permutation(seed, Math.floor(i / n))[i % n] as Passage;
}
