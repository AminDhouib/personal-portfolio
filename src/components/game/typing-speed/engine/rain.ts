import { COMMON_WORDS } from "../corpus/words";

export const RAIN_LIVES = 3;
/** A new wave every this many cleared words. */
export const WAVE_EVERY = 10;

const X_MIN = 0.05;
const X_SPAN = 0.7;
const MIN_LEN = 2;
const REROLLS = 24;

export interface RainWord {
  id: number;
  text: string;
  /** Fraction of the play area width, 0.05 to 0.75. */
  x: number;
  /** Fraction of its height: 0 at the top, 1 on the floor. */
  y: number;
}

export interface RainState {
  status: "running" | "over";
  lives: number;
  /** Letters cleared. */
  score: number;
  /** Words cleared. */
  cleared: number;
  wave: number;
  words: RainWord[];
  /** ms the run has been ticked for; paused time is never ticked, so never counted. */
  elapsedMs: number;
  /** Letters typed against the falling words, and those that matched none. */
  typed: number;
  missed: number;
  // Internal: plain numbers, so the whole state compares with toEqual.
  rng: number;
  nextId: number;
  sinceSpawnMs: number;
}

export interface WaveParams {
  spawnMs: number;
  /** Play-area heights per second. */
  speed: number;
  maxLen: number;
}

export function waveParams(wave: number): WaveParams {
  return {
    spawnMs: Math.max(700, 2400 - 150 * (wave - 1)),
    speed: 0.08 + 0.012 * (wave - 1),
    maxLen: wave === 1 ? 4 : wave <= 3 ? 6 : 12,
  };
}

/** One mulberry32 step on a plain number state. */
function next(state: number): { value: number; state: number } {
  const a = (state + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state: a };
}

export function createRain(seed: number): RainState {
  return {
    status: "running",
    lives: RAIN_LIVES,
    score: 0,
    cleared: 0,
    wave: 1,
    words: [],
    elapsedMs: 0,
    typed: 0,
    missed: 0,
    rng: seed >>> 0,
    nextId: 1,
    // Due at once: the first word falls on the first tick.
    sinceSpawnMs: waveParams(1).spawnMs,
  };
}

/** A word that is a copy of a live word, or the start of one, or started by one. */
function clashes(words: readonly RainWord[], text: string): boolean {
  return words.some((w) => w.text.startsWith(text) || text.startsWith(w.text));
}

function spawn(r: RainState): void {
  const { maxLen } = waveParams(r.wave);
  const pool = COMMON_WORDS.filter((w) => w.length >= MIN_LEN && w.length <= maxLen);
  for (let i = 0; i < REROLLS; i++) {
    const a = next(r.rng);
    r.rng = a.state;
    const text = pool[Math.floor(a.value * pool.length)];
    if (text === undefined || clashes(r.words, text)) continue;
    const b = next(r.rng);
    r.rng = b.state;
    r.words.push({ id: r.nextId++, text, x: X_MIN + b.value * X_SPAN, y: 0 });
    return;
  }
}

/** Advances the rain by `dtMs`: spawns on the wave interval, falls, and takes lives at the floor. */
export function tickRain(r: RainState, dtMs: number): void {
  if (r.status === "over") return;
  const { spawnMs, speed } = waveParams(r.wave);
  r.elapsedMs += dtMs;
  r.sinceSpawnMs += dtMs;
  while (r.sinceSpawnMs >= spawnMs) {
    r.sinceSpawnMs -= spawnMs;
    spawn(r);
  }
  const fall = (speed * dtMs) / 1000;
  const alive: RainWord[] = [];
  for (const w of r.words) {
    w.y += fall;
    if (w.y >= 1) r.lives--;
    else alive.push(w);
  }
  r.words = alive;
  if (r.lives <= 0) {
    r.lives = 0;
    r.status = "over";
  }
}

/**
 * Takes the buffer after a letter was added to it. The lowest falling word that starts with
 * it is the target, and a buffer equal to that whole word clears it. A buffer no word starts
 * with is a miss.
 */
export function typeRain(r: RainState, buffer: string): { cleared: boolean; valid: boolean } {
  if (r.status === "over" || buffer === "") return { cleared: false, valid: true };
  r.typed++;
  let target: RainWord | null = null;
  for (const w of r.words) {
    if (w.text.startsWith(buffer) && (target === null || w.y > target.y)) target = w;
  }
  if (target === null) {
    r.missed++;
    return { cleared: false, valid: false };
  }
  if (target.text !== buffer) return { cleared: false, valid: true };
  const id = target.id;
  r.words = r.words.filter((w) => w.id !== id);
  r.score += buffer.length;
  r.cleared++;
  r.wave = 1 + Math.floor(r.cleared / WAVE_EVERY);
  return { cleared: true, valid: true };
}

/** Letters cleared as five-letter words per minute of rain time. */
export function rainWpm(r: RainState): number {
  if (r.elapsedMs <= 0) return 0;
  return Math.round(r.score / 5 / (r.elapsedMs / 60_000));
}

export function rainAccuracy(r: RainState): number {
  if (r.typed === 0) return 100;
  return Math.round(((r.typed - r.missed) / r.typed) * 100);
}
