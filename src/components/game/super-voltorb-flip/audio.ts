import { CUES, type CueName } from "./sound-cues";
import { musicTrackForLevel } from "./music";
import {
  createMaster,
  scheduleCue,
  setMasterMuted,
  type CtxLike,
  type CueHandle,
  type Master,
} from "./synth";

// Super Voltorb Flip's audio facade. Sound effects and fanfares are synthesized
// from the tables in sound-cues.ts; the background loop is one of three CC0
// tracks picked by level band (music.ts). Every function here is safe to call
// during SSR and when the browser has no AudioContext: cues then still "play"
// for their nominal length, so the round flow's timing does not depend on audio.

let globalMuted = false;
let master: Master | null = null;
let music: HTMLAudioElement | null = null;
let musicSrc: string | null = null;
// Loops being faded out; they have left the `music` slot but still sound.
const fading = new Set<HTMLAudioElement>();

function getMaster(): Master | null {
  if (master) return master;
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ||
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx: CtxLike = new Ctor();
    master = createMaster(ctx, globalMuted);
    return master;
  } catch {
    // silent-ok: a blocked or unsupported AudioContext must not throw into the game loop.
    return null;
  }
}

// An AudioContext created before a user gesture starts suspended (iOS Safari
// also reports "interrupted" after a call or a tab switch); every cue is
// triggered by (or soon after) a gesture, so wake it each time.
function wake(m: Master): void {
  if (m.ctx.state !== "suspended" && m.ctx.state !== "interrupted") return;
  // silent-ok: resume() rejects while the browser still blocks audio; the next gesture retries.
  m.ctx.resume?.().catch(() => undefined);
}

interface LiveCue {
  timer: number;
  handle: CueHandle | null;
}

// One-shot cues still sounding, so stopAllCues() can silence them on unmount.
const liveCues = new Set<LiveCue>();

function playCue(name: CueName): Promise<void> {
  const cue = CUES[name];
  return new Promise((resolve) => {
    if (globalMuted || typeof window === "undefined") return resolve();
    const m = getMaster();
    let handle: CueHandle | null = null;
    if (m) {
      wake(m);
      handle = scheduleCue(m.ctx, m.out, cue, m.ctx.currentTime);
    }
    // Resolve at the cue's end even without audio, so gameplay that awaits a
    // cue (the risk fanfare gating the board) keeps the same pacing.
    const live: LiveCue = {
      handle,
      timer: window.setTimeout(() => {
        liveCues.delete(live);
        resolve();
      }, cue.ms),
    };
    liveCues.add(live);
  });
}

/**
 * Silence every one-shot cue still sounding and drop its end timer. A cancelled
 * cue's promise never resolves: its only awaiter is the component being torn
 * down, and resolving it would release a lock on a board nobody sees.
 */
export function stopAllCues(): void {
  if (typeof window === "undefined") return;
  for (const live of liveCues) {
    window.clearTimeout(live.timer);
    live.handle?.stop();
  }
  liveCues.clear();
}

// One-shot effects. Each returns a promise that resolves when the cue ends;
// existing fire-and-forget callers ignore it, riskWarning's caller awaits it.
export const sfx = {
  /** Tile flip start, every tile including Voltorbs. */
  flip: () => playCue("flip"),
  /** Voltorb hit; fires shortly after `flip`. */
  voltorbPop: () => playCue("voltorbPop"),
  /** Earn counter tick, every 4th rollup step. */
  payoutTickEarn: () => playCue("payoutTickEarn"),
  /** Wallet drain tick, every 4th drain step. */
  payoutTickBank: () => playCue("payoutTickBank"),
  /** Closing chime of the payout chain. */
  payoutFinal: () => playCue("payoutFinal"),
  /** Memo drawer open and close. */
  memoSlide: () => playCue("memoSlide"),
  /** Memo flag toggled on a tile. */
  memoToggle: () => playCue("memoToggle"),
  /** Cursor moved between memo buttons or board cells. */
  cursorMove: () => playCue("cursorMove"),
  /** Tap on a revealed tile or a disallowed action. */
  invalidTap: () => playCue("invalidTap"),
  /** Confirmation tone. */
  decide: () => playCue("decide"),
  /** Memo Back / Clear. */
  backButton: () => playCue("backButton"),
  /** Round start: the level went up. */
  levelUp: () => playCue("levelUp"),
  /** Round start: the level went down. */
  levelDown: () => playCue("levelDown"),
  /** High-risk flip warning; resolves when the fanfare ends. */
  riskWarning: () => playCue("riskWarning"),
};

// ---- Fanfares: a cue plus an end-of-cue timer, cancellable as one. ----------

interface FanfareSlot {
  timer: number | null;
  handle: CueHandle | null;
}

const levelWinSlot: FanfareSlot = { timer: null, handle: null };
const gameOverSlot: FanfareSlot = { timer: null, handle: null };

function stopFanfare(slot: FanfareSlot): void {
  if (typeof window === "undefined") return;
  if (slot.timer !== null) window.clearTimeout(slot.timer);
  slot.timer = null;
  slot.handle?.stop();
  slot.handle = null;
}

function startFanfare(slot: FanfareSlot, name: CueName, onEnded?: () => void): void {
  stopFanfare(slot);
  if (typeof window === "undefined") return;
  const cue = CUES[name];
  if (!globalMuted) {
    const m = getMaster();
    if (m) {
      wake(m);
      slot.handle = scheduleCue(m.ctx, m.out, cue, m.ctx.currentTime);
    }
  }
  slot.timer = window.setTimeout(() => {
    slot.timer = null;
    slot.handle = null;
    onEnded?.();
  }, cue.ms);
}

/** Round-lost jingle. */
export function playGameOver(): void {
  startFanfare(gameOverSlot, "gameOver");
}

export function stopGameOver(): void {
  stopFanfare(gameOverSlot);
}

/** Round-cleared fanfare. `onEnded` fires once at its end unless stopLevelWin() cancels it. */
export function playLevelWin(onEnded?: () => void): void {
  startFanfare(levelWinSlot, "levelClear", onEnded);
}

export function stopLevelWin(): void {
  stopFanfare(levelWinSlot);
}

// ---- Background music --------------------------------------------------------

/** Start (or keep) the loop for `level`'s band; a different band swaps the element. */
export function playMusic(level: number): void {
  if (typeof window === "undefined") return;
  const track = musicTrackForLevel(level);
  if (music && musicSrc === track.src) return;
  music?.pause();
  music = new Audio(track.src);
  musicSrc = track.src;
  music.loop = true;
  music.volume = track.volume;
  music.muted = globalMuted;
  // silent-ok: autoplay is commonly blocked until a user gesture; a rejected play() must not surface
  music.play().catch(() => undefined);
}

export function stopMusic(): void {
  music?.pause();
  music = null;
  musicSrc = null;
}

export function fadeOutMusic(ms = 400): void {
  if (!music) return;
  const m = music;
  music = null;
  musicSrc = null;
  // The slot is already free, but a mute during the fade must still reach it.
  fading.add(m);
  const startVol = m.volume;
  const startTime = performance.now();
  const tick = () => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / ms);
    m.volume = Math.max(0, startVol * (1 - t));
    if (t < 1) requestAnimationFrame(tick);
    else {
      m.pause();
      fading.delete(m);
    }
  };
  requestAnimationFrame(tick);
}

/** Mutes the music element and zeroes the master gain, silencing fanfares in flight. */
export function setMusicMuted(muted: boolean): void {
  globalMuted = muted;
  if (music) music.muted = muted;
  for (const m of fading) m.muted = muted;
  if (master) setMasterMuted(master, muted);
}
