import { CUES, type CueName } from "./sound-cues";
import {
  GAME_OVER_JINGLE,
  LEVEL_WIN_JINGLE,
  MUSIC_INTRO,
  MUSIC_LOOP,
  type MusicTrack,
} from "./music";
import { isTextEntryTarget } from "../text-entry";
import {
  createMaster,
  scheduleCue,
  setMasterMuted,
  type CtxLike,
  type CueHandle,
  type Master,
} from "./synth";

// Super Voltorb Flip's audio facade. Sound effects and the risk-warning fanfare
// are synthesized from the tables in sound-cues.ts; the background music (intro,
// then loop) and the round-cleared and round-lost jingles are the original
// recordings (music.ts). Every function here is safe to call during SSR and when
// the browser has no AudioContext: cues and jingles then still "end" at their
// nominal cue length, so the round flow's timing does not depend on audio.

let globalMuted = false;
let master: Master | null = null;
let music: HTMLAudioElement | null = null;
// Loops being faded out; they have left the `music` slot but still sound.
const fading = new Set<HTMLAudioElement>();

// Cancels the pending "retry the loop on the next gesture" listeners, if armed,
// and the function that runs that retry now (used when the player unmutes).
let cancelGestureRetry: (() => void) | null = null;
let runGestureRetry: (() => void) | null = null;

// A browser can reject play() until the page has had a user gesture. Instead of
// waiting for the next round change, retry on the first gesture: a pointer press
// or release, a touch end (on touch the activation arrives with the release, so
// the press alone can still be rejected) or a key. A key typed in a text field
// is not a game gesture and a muted game stays silent; both leave the retry
// armed. A rejection of the retry itself re-arms it for the next gesture.
function retryMusicOnGesture(el: HTMLAudioElement): void {
  if (typeof document === "undefined") return;
  cancelGestureRetry?.();
  const events = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
  const cancel = () => {
    for (const name of events) document.removeEventListener(name, onGesture, true);
    if (cancelGestureRetry === cancel) {
      cancelGestureRetry = null;
      runGestureRetry = null;
    }
  };
  function attempt() {
    if (music !== el) {
      cancel();
      return;
    }
    if (globalMuted) return;
    cancel();
    // silent-ok: still blocked; re-armed for the next gesture
    el.play().catch(() => {
      if (music === el) retryMusicOnGesture(el);
    });
  }
  function onGesture(event: Event) {
    if (event.type === "keydown" && isTextEntryTarget(event)) return;
    attempt();
  }
  for (const name of events) document.addEventListener(name, onGesture, true);
  cancelGestureRetry = cancel;
  runGestureRetry = attempt;
}

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
 * The game's teardown for cues and gesture listeners: silence every one-shot cue still sounding,
 * drop its end timer and remove the armed jingle-unlock listeners. A cancelled
 * cue's promise never resolves: its only awaiter is the component being torn
 * down, and resolving it would release a lock on a board nobody sees.
 */
export function stopAllCues(): void {
  disarmUnlockListeners?.();
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

// ---- Jingles: the original recording, one persistent element each, plus an end-of-cue timer. ----

// The timer runs for the cue's nominal length (LEVEL_WIN_MS), which is the round flow's timing
// contract, not for the recording's own length: the lost-round jingle is longer than its cue and
// simply plays out under the next screen until stopGameOver() (or a restart) silences it. Nothing
// awaits the lost-round jingle, so it arms no timer at all.
//
// Each jingle has ONE element, created with the first music or jingle and reused every round. A
// jingle starts from a timer long after the last gesture, and iOS Safari only lets an element
// play without a gesture once that same element has been played from one; so the elements are
// unlocked with a muted play-then-pause on the first gesture (right away if the call that creates
// them is itself a gesture, otherwise on the first gesture after it), then replayed from 0.
interface JingleSlot {
  track: MusicTrack;
  el: HTMLAudioElement | null;
  timer: number | null;
}

const levelWinSlot: JingleSlot = { track: LEVEL_WIN_JINGLE, el: null, timer: null };
const gameOverSlot: JingleSlot = { track: GAME_OVER_JINGLE, el: null, timer: null };
const jingleSlots = [levelWinSlot, gameOverSlot];

// Jingle elements whose muted unlock play() is still in flight, and ones already unlocked.
const unlocking = new Set<HTMLAudioElement>();
const unlocked = new Set<HTMLAudioElement>();
let jingleUnlockArmed = false;
let disarmUnlockListeners: (() => void) | null = null;

// A browser that blocks the unlock (no gesture yet) gets ONE retry on the first gesture; a retry
// the browser rejects too (a 404, a decode error) is not re-armed, so a broken file cannot make
// every later gesture replay it.
function armJingleUnlock(): void {
  if (jingleUnlockArmed || typeof document === "undefined") return;
  jingleUnlockArmed = true;
  const events = ["pointerdown", "pointerup", "touchend", "keydown"] as const;
  const disarm = () => {
    for (const name of events) document.removeEventListener(name, onGesture, true);
    jingleUnlockArmed = false;
    if (disarmUnlockListeners === disarm) disarmUnlockListeners = null;
  };
  function onGesture() {
    disarm();
    for (const slot of jingleSlots) if (slot.el) unlockJingle(slot.el, true);
  }
  for (const name of events) document.addEventListener(name, onGesture, true);
  disarmUnlockListeners = disarm;
}

function unlockJingle(el: HTMLAudioElement, isRetry = false): void {
  // A jingle sounding right now has played from a gesture-free timer fine, or is not ours to cut.
  if (unlocked.has(el) || !el.paused) return;
  unlocking.add(el);
  el.muted = true;
  Promise.resolve(el.play()).then(
    () => {
      // startJingle drops the element from `unlocking` when it takes it over and plays it
      // itself: leave it playing, but it has now played, so it counts as unlocked.
      if (!unlocking.delete(el)) {
        unlocked.add(el);
        return;
      }
      el.pause();
      el.currentTime = 0;
      el.muted = globalMuted;
      unlocked.add(el);
    },
    () => {
      if (unlocking.delete(el)) el.muted = globalMuted;
      if (!isRetry) armJingleUnlock();
    },
  );
}

function ensureJingles(): void {
  if (typeof window === "undefined" || levelWinSlot.el) return;
  for (const slot of jingleSlots) {
    const el = new Audio(slot.track.src);
    el.preload = "auto";
    el.volume = slot.track.volume;
    el.muted = globalMuted;
    slot.el = el;
    unlockJingle(el);
  }
}

function stopJingle(slot: JingleSlot): void {
  if (typeof window === "undefined") return;
  if (slot.timer !== null) window.clearTimeout(slot.timer);
  slot.timer = null;
  // An element in the middle of its unlock is paused by the unlock itself.
  if (slot.el && !unlocking.has(slot.el)) slot.el.pause();
}

function startJingle(slot: JingleSlot, ms: number, onEnded?: () => void): void {
  stopJingle(slot);
  if (typeof window === "undefined") return;
  ensureJingles();
  const el = slot.el;
  if (el && !globalMuted) {
    unlocking.delete(el);
    el.muted = false;
    el.currentTime = 0;
    el.volume = slot.track.volume;
    // silent-ok: a blocked or failed jingle stays silent; the round flow runs on the timer below.
    Promise.resolve(el.play()).catch(() => undefined);
  }
  if (onEnded) {
    slot.timer = window.setTimeout(() => {
      slot.timer = null;
      onEnded();
    }, ms);
  }
}

/** Round-lost jingle. */
export function playGameOver(): void {
  startJingle(gameOverSlot, CUES.gameOver.ms);
}

export function stopGameOver(): void {
  stopJingle(gameOverSlot);
}

/** Round-cleared jingle. `onEnded` fires once at LEVEL_WIN_MS unless stopLevelWin() cancels it. */
export function playLevelWin(onEnded?: () => void): void {
  startJingle(levelWinSlot, CUES.levelClear.ms, onEnded);
}

export function stopLevelWin(): void {
  stopJingle(levelWinSlot);
}

// ---- Background music --------------------------------------------------------

// Whether the intro has played since the last real stop. A fade between rounds does not reset
// it, so the next round goes straight to the loop, as the original game's music carries on.
let introPlayed = false;
let loopWarmScheduled = false;
const LOOP_WARM_DELAY_MS = 3000;
const LOOP_WARM_TIMEOUT_MS = 60_000;

// The loop is ~1.4 MB. Fetch it into the HTTP cache once, a few seconds after the intro starts
// playing (the element's `playing` event, not the play attempt), so the
// hand-over does not go silent on a slow link. Once per session; a failed warm-up costs nothing.
function warmLoopSoon(): void {
  if (loopWarmScheduled || typeof fetch !== "function") return;
  loopWarmScheduled = true;
  window.setTimeout(() => {
    // silent-ok: a failed warm-up only means the loop loads when the hand-over needs it.
    fetch(MUSIC_LOOP.src, { signal: AbortSignal.timeout(LOOP_WARM_TIMEOUT_MS) })
      .then((res) => res.arrayBuffer())
      .catch(() => undefined);
  }, LOOP_WARM_DELAY_MS);
}

/**
 * Start the background music, or keep it if it is already playing. The first start after a real
 * stop (the page opening, a hidden tab, an unmount) plays the original intro once and then the
 * original loop; a restart after a fade goes straight to the loop. It is the same at every
 * level. One element plays both so the loop starts without a fresh user gesture (a browser that
 * let the intro start lets the same element carry on).
 */
export function playMusic(_level: number): void {
  if (typeof window === "undefined") return;
  if (music) return;
  cancelGestureRetry?.();
  const first = introPlayed ? MUSIC_LOOP : MUSIC_INTRO;
  introPlayed = true;
  const el = new Audio(first.src);
  music = el;
  el.loop = first === MUSIC_LOOP;
  el.volume = first.volume;
  el.muted = globalMuted;
  if (first === MUSIC_INTRO) {
    el.addEventListener("ended", () => {
      // A stopped or fading intro has left the slot: nothing may start the loop for it.
      if (music !== el) return;
      el.src = MUSIC_LOOP.src;
      el.loop = true;
      el.volume = MUSIC_LOOP.volume;
      startPlaying(el);
    });
    // Only a started intro earns the 1.4 MB fetch: autoplay may be blocked and never retried.
    el.addEventListener("playing", warmLoopSoon, { once: true });
  }
  startPlaying(el);
  ensureJingles();
}

// silent-ok: autoplay is commonly blocked until a user gesture; a rejected play() must not
// surface. Only the element still in the slot may arm the retry: a swapped-out element's
// late rejection (pause() before play() settled) must not cancel the new one's.
function startPlaying(el: HTMLAudioElement): void {
  el.play().catch(() => {
    if (music === el) retryMusicOnGesture(el);
  });
}

export function stopMusic(): void {
  cancelGestureRetry?.();
  music?.pause();
  music = null;
  introPlayed = false;
}

export function fadeOutMusic(ms = 400): void {
  if (!music) return;
  cancelGestureRetry?.();
  const m = music;
  music = null;
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

/** Mutes the music and jingle elements and zeroes the master gain, silencing cues in flight. */
export function setMusicMuted(muted: boolean): void {
  globalMuted = muted;
  if (music) music.muted = muted;
  for (const m of fading) m.muted = muted;
  for (const slot of jingleSlots) if (slot.el && !unlocking.has(slot.el)) slot.el.muted = muted;
  if (master) setMasterMuted(master, muted);
  // A loop that was waiting for a gesture while muted starts now: unmuting is one.
  if (!muted) runGestureRetry?.();
}
