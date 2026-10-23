import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUES, LEVEL_WIN_MS, RISK_WARNING_MS } from "../sound-cues";
import { makeFakeCtx, type FakeCtx, type FakeSource } from "./fake-ctx";

class FakeAudio {
  static all: FakeAudio[] = [];
  src: string;
  loop = false;
  volume = 1;
  muted = false;
  paused = true;
  currentTime = 0;
  preload = "";
  /** Number of play() calls, and whether the element was muted at the last one. */
  plays = 0;
  mutedAtPlay = false;
  /** The src it was created with: `src` changes when the intro hands over to the loop. */
  readonly origSrc: string;
  private listeners = new Map<string, (() => void)[]>();
  constructor(src: string) {
    this.src = src;
    this.origSrc = src;
    FakeAudio.all.push(this);
  }
  play() {
    this.plays += 1;
    this.mutedAtPlay = this.muted;
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  addEventListener(type: string, listener: () => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  /** Fire a media event (`playing`, ...) at the listeners, as the browser does. */
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
  /** The file played to its end (never fires for a looping element, as in a browser). */
  finish() {
    if (this.loop) return;
    this.paused = true;
    for (const listener of this.listeners.get("ended") ?? []) listener();
  }
}

let ctx: FakeCtx;

/** The background-music elements, in creation order (the jingle elements are not among them). */
function musicEls(): FakeAudio[] {
  return FakeAudio.all.filter((el) => /music_(intro|loop).mp3$/.test(el.origSrc));
}

/** The persistent jingle element whose file name contains `name`. */
function jingleEl(name: string): FakeAudio {
  const el = FakeAudio.all.find((e) => e.origSrc.includes(name));
  if (!el) throw new Error(`no ${name} element was created`);
  return el;
}

function lastStop(s: FakeSource): number {
  return s.stopped[s.stopped.length - 1]!;
}

function installContext(c: FakeCtx | undefined) {
  if (!c) {
    vi.stubGlobal("AudioContext", undefined);
    return;
  }
  // A constructor that returns the fake, the way `new AudioContext()` is used.
  vi.stubGlobal("AudioContext", function FakeAudioContext() {
    return c;
  });
}

// The facade holds module state (the context, the music element, the mute
// flag), so each test loads a fresh copy.
async function load() {
  vi.resetModules();
  return await import("../audio");
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeAudio.all = [];
  vi.stubGlobal("Audio", FakeAudio);
  ctx = makeFakeCtx();
  installContext(ctx);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("sfx", () => {
  it("schedules the cue's voices and resolves when the cue ends", async () => {
    const { sfx } = await load();
    let done = false;
    void sfx.flip().then(() => {
      done = true;
    });
    expect(ctx.oscillators).toHaveLength(CUES.flip.notes.length);
    await vi.advanceTimersByTimeAsync(CUES.flip.ms - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });

  it("holds the risk warning for exactly RISK_WARNING_MS", async () => {
    const { sfx } = await load();
    let done = false;
    void sfx.riskWarning().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(RISK_WARNING_MS - 1);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(done).toBe(true);
  });

  it("still resolves on time when the browser has no AudioContext", async () => {
    installContext(undefined);
    const { sfx } = await load();
    let done = false;
    void sfx.riskWarning().then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(RISK_WARNING_MS + 1);
    expect(done).toBe(true);
  });

  it("makes no sound and resolves at once while muted", async () => {
    const { sfx, setMusicMuted } = await load();
    setMusicMuted(true);
    await expect(sfx.flip()).resolves.toBeUndefined();
    expect(ctx.oscillators).toHaveLength(0);
  });

  it("silences a cue already in flight when muted, via the master gain", async () => {
    const { sfx, setMusicMuted } = await load();
    void sfx.payoutFinal();
    const calls = ctx.gains[0]!.gain.calls;
    expect(ctx.gains[0]!.gain.value).toBe(1);
    setMusicMuted(true);
    expect(calls[calls.length - 1]).toMatchObject({ m: "lin", v: 0 });
    setMusicMuted(false);
    expect(calls[calls.length - 1]).toMatchObject({ m: "lin", v: 1 });
  });

  it("resumes a suspended context on the first cue", async () => {
    ctx.state = "suspended";
    const { sfx } = await load();
    void sfx.flip();
    expect(ctx.resumed).toBe(1);
  });

  it("resumes an interrupted context too (iOS Safari)", async () => {
    ctx.state = "interrupted";
    const { sfx } = await load();
    void sfx.flip();
    expect(ctx.resumed).toBe(1);
  });

  it("does not resume a running context", async () => {
    const { sfx } = await load();
    void sfx.flip();
    expect(ctx.resumed).toBe(0);
  });
});

describe("stopAllCues", () => {
  it("halts every live one-shot cue and drops its end timer", async () => {
    const { sfx, stopAllCues } = await load();
    let done = false;
    void sfx.riskWarning().then(() => {
      done = true;
    });
    void sfx.flip();
    ctx.currentTime = 0.4;
    stopAllCues();
    for (const o of ctx.oscillators) expect(lastStop(o)).toBeCloseTo(0.412, 6);
    // The end timers are gone: nothing resolves, however long we wait.
    await vi.advanceTimersByTimeAsync(RISK_WARNING_MS * 2);
    expect(done).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves nothing to stop once the cues have ended on their own", async () => {
    const { sfx, stopAllCues } = await load();
    void sfx.flip();
    await vi.advanceTimersByTimeAsync(CUES.flip.ms + 1);
    const stops = ctx.oscillators.map((o) => o.stopped.length);
    stopAllCues();
    expect(ctx.oscillators.map((o) => o.stopped.length)).toEqual(stops);
  });

  it("is safe with no AudioContext", async () => {
    installContext(undefined);
    const { sfx, stopAllCues } = await load();
    void sfx.riskWarning();
    expect(() => stopAllCues()).not.toThrow();
    expect(vi.getTimerCount()).toBe(0);
  });
});

const AUDIO = "/games/super-voltorb-flip/audio";

describe("level-clear fanfare", () => {
  it("plays the original round-cleared jingle once, not the synthesized fanfare", async () => {
    const { playLevelWin } = await load();
    playLevelWin();
    const el = jingleEl("music_level_win");
    expect(el.src).toBe(`${AUDIO}/music_level_win.mp3`);
    expect(el.loop).toBe(false);
    expect(el.volume).toBeCloseTo(0.5, 6);
    expect(el.paused).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(jingleEl("game_over").paused).toBe(true);
  });

  it("calls onEnded once, at LEVEL_WIN_MS", async () => {
    const { playLevelWin } = await load();
    const onEnded = vi.fn();
    playLevelWin(onEnded);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS - 1);
    expect(onEnded).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    expect(onEnded).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("does not call onEnded after stopLevelWin, and silences the jingle", async () => {
    const { playLevelWin, stopLevelWin } = await load();
    const onEnded = vi.fn();
    playLevelWin(onEnded);
    await vi.advanceTimersByTimeAsync(500);
    stopLevelWin();
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS * 2);
    expect(onEnded).not.toHaveBeenCalled();
    expect(jingleEl("music_level_win").paused).toBe(true);
  });

  it("still calls onEnded on time when there is no AudioContext", async () => {
    installContext(undefined);
    const { playLevelWin } = await load();
    const onEnded = vi.fn();
    playLevelWin(onEnded);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS + 1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("restarting the fanfare cancels the first callback and replays the same element from 0", async () => {
    const { playLevelWin } = await load();
    const first = vi.fn();
    const second = vi.fn();
    playLevelWin(first);
    const el = jingleEl("music_level_win");
    const count = FakeAudio.all.length;
    await vi.advanceTimersByTimeAsync(500);
    el.currentTime = 0.5;
    playLevelWin(second);
    expect(FakeAudio.all).toHaveLength(count);
    expect(jingleEl("music_level_win")).toBe(el);
    expect(el.currentTime).toBe(0);
    expect(el.paused).toBe(false);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS + 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("makes no sound while muted but keeps the same pacing", async () => {
    const { playLevelWin, setMusicMuted } = await load();
    setMusicMuted(true);
    const onEnded = vi.fn();
    playLevelWin(onEnded);
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.all.every((el) => el.paused)).toBe(true);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS + 1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("a mute in flight reaches the jingle, and an unmute reaches it again", async () => {
    const { playLevelWin, setMusicMuted } = await load();
    playLevelWin();
    const el = jingleEl("music_level_win");
    setMusicMuted(true);
    expect(el.muted).toBe(true);
    setMusicMuted(false);
    expect(el.muted).toBe(false);
  });

  it("keeps its pacing when the browser rejects the jingle play()", async () => {
    // The first two play() calls of each element are rejected: the unlock, then the jingle itself.
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          if (this.plays < 2) {
            this.plays += 1;
            return Promise.reject(new DOMException("blocked", "NotAllowedError"));
          }
          return super.play();
        }
      },
    );
    const { playLevelWin } = await load();
    const onEnded = vi.fn();
    playLevelWin(onEnded);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS + 1);
    expect(onEnded).toHaveBeenCalledTimes(1);
    // Let the armed unlock retry run, so no document listener outlives this test.
    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
  });
});

describe("game-over jingle", () => {
  it("plays the original round-lost jingle once, not the synthesized one", async () => {
    const { playGameOver } = await load();
    playGameOver();
    const el = jingleEl("game_over");
    expect(el.src).toBe(`${AUDIO}/game_over.mp3`);
    expect(el.loop).toBe(false);
    expect(el.volume).toBeCloseTo(0.5, 6);
    expect(el.paused).toBe(false);
    expect(ctx.oscillators).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(jingleEl("music_level_win").paused).toBe(true);
  });

  it("stopGameOver halts it", async () => {
    const { playGameOver, stopGameOver } = await load();
    playGameOver();
    stopGameOver();
    expect(jingleEl("game_over").paused).toBe(true);
  });

  it("is not cut at the cue nominal length: the file plays out", async () => {
    const { playGameOver } = await load();
    playGameOver();
    await vi.advanceTimersByTimeAsync(CUES.gameOver.ms + 1);
    expect(jingleEl("game_over").paused).toBe(false);
  });

  it("arms no timer: nothing awaits the game-over jingle", async () => {
    const { playGameOver } = await load();
    playGameOver();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("makes no sound while muted", async () => {
    const { playGameOver, setMusicMuted } = await load();
    setMusicMuted(true);
    playGameOver();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeAudio.all.every((el) => el.paused)).toBe(true);
  });

  it("leaves the level-clear jingle alone", async () => {
    const { playGameOver, playLevelWin, stopGameOver } = await load();
    playLevelWin();
    playGameOver();
    stopGameOver();
    expect(jingleEl("music_level_win").paused).toBe(false);
    expect(jingleEl("game_over").paused).toBe(true);
  });

  it("replays the same element from 0 on a restart", async () => {
    const { playGameOver } = await load();
    playGameOver();
    const el = jingleEl("game_over");
    el.currentTime = 2.5;
    playGameOver();
    expect(jingleEl("game_over")).toBe(el);
    expect(el.currentTime).toBe(0);
    expect(el.paused).toBe(false);
  });
});

describe("jingle elements and the iOS unlock", () => {
  it("creates the two jingle elements once, however many rounds end", async () => {
    const { playGameOver, playLevelWin, stopGameOver } = await load();
    playLevelWin();
    playGameOver();
    const count = FakeAudio.all.length;
    stopGameOver();
    playLevelWin();
    playGameOver();
    expect(FakeAudio.all).toHaveLength(count);
    expect(FakeAudio.all.filter((el) => /music_level_win|game_over/.test(el.origSrc))).toHaveLength(
      2,
    );
  });

  it("unlocks both jingle elements when the music first starts: muted play, then pause and rewind", async () => {
    const { playMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    for (const name of ["music_level_win", "game_over"]) {
      const el = jingleEl(name);
      expect(el.plays, name).toBe(1);
      expect(el.mutedAtPlay, `${name} must play muted while unlocking`).toBe(true);
      expect(el.paused, name).toBe(true);
      expect(el.currentTime, name).toBe(0);
      expect(el.muted, `${name} goes back to the player's mute setting`).toBe(false);
    }
  });

  it("restores a mute that was on while it unlocked", async () => {
    const { playMusic, setMusicMuted } = await load();
    setMusicMuted(true);
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(jingleEl("game_over").muted).toBe(true);
    setMusicMuted(false);
    expect(jingleEl("game_over").muted).toBe(false);
  });

  it("a jingle asked for before any music still unlocks the other element", async () => {
    const { playLevelWin } = await load();
    playLevelWin();
    await vi.advanceTimersByTimeAsync(0);
    expect(jingleEl("game_over").plays).toBe(1);
    // The jingle that was asked for plays; the other one is unlocked and parked.
    expect(jingleEl("music_level_win").paused).toBe(false);
    expect(jingleEl("game_over").paused).toBe(true);
  });

  it("a jingle started before its unlock settles is not paused by the unlock", async () => {
    const releases: (() => void)[] = [];
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          this.plays += 1;
          this.mutedAtPlay = this.muted;
          this.paused = false;
          if (!this.origSrc.includes("music_level_win")) return Promise.resolve();
          return new Promise<void>((resolve) => {
            releases.push(resolve);
          });
        }
      },
    );
    const { playMusic, playLevelWin } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    playLevelWin();
    for (const release of releases) release();
    await vi.advanceTimersByTimeAsync(0);
    const el = jingleEl("music_level_win");
    expect(el.paused).toBe(false);
    expect(el.muted).toBe(false);
  });

  it("when the browser blocks the unlock, retries on the first gesture and only once", async () => {
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          if (this.origSrc.includes("game_over") && this.plays === 0) {
            this.plays += 1;
            this.mutedAtPlay = this.muted;
            return Promise.reject(new DOMException("blocked", "NotAllowedError"));
          }
          return super.play();
        }
      },
    );
    const { playMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = jingleEl("game_over");
    expect(el.plays).toBe(1);
    expect(el.muted).toBe(false);

    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(2);
    expect(el.paused).toBe(true);
    expect(el.muted).toBe(false);

    document.dispatchEvent(new Event("pointerup"));
    document.dispatchEvent(new Event("keydown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(2);
  });

  it("a retry the browser rejects again does not re-arm on every gesture", async () => {
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          if (this.origSrc.includes("game_over")) {
            this.plays += 1;
            return Promise.reject(new DOMException("blocked", "NotAllowedError"));
          }
          return super.play();
        }
      },
    );
    const { playMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = jingleEl("game_over");
    expect(el.plays).toBe(1);

    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(2);

    for (const type of ["pointerdown", "pointerup", "touchend", "keydown"]) {
      document.dispatchEvent(new Event(type));
    }
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(2);
  });

  it("disarmJingleUnlock removes the armed gesture listeners, so an unmount leaves none", async () => {
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          if (this.origSrc.includes("game_over")) {
            this.plays += 1;
            return Promise.reject(new DOMException("blocked", "NotAllowedError"));
          }
          return super.play();
        }
      },
    );
    const { playMusic, disarmJingleUnlock } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = jingleEl("game_over");
    expect(el.plays).toBe(1);

    disarmJingleUnlock();
    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(1);
    // Safe to call again, with nothing armed.
    expect(() => disarmJingleUnlock()).not.toThrow();
  });

  it("a jingle that took over a pending unlock leaves the element marked unlocked", async () => {
    const releases: (() => void)[] = [];
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          this.plays += 1;
          this.mutedAtPlay = this.muted;
          this.paused = false;
          if (!this.origSrc.includes("music_level_win")) return Promise.resolve();
          return new Promise<void>((resolve) => {
            releases.push(resolve);
          });
        }
      },
    );
    const { playMusic, playLevelWin, stopLevelWin } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    playLevelWin();
    for (const release of releases) release();
    await vi.advanceTimersByTimeAsync(0);
    const el = jingleEl("music_level_win");
    const plays = el.plays;
    stopLevelWin();
    // Unlocked: a later gesture must not run another muted unlock play.
    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(plays);
  });

  it("a jingle that took over an unlock the browser then rejects stays unmuted and arms one retry", async () => {
    const rejects: ((e: unknown) => void)[] = [];
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          this.plays += 1;
          this.mutedAtPlay = this.muted;
          this.paused = false;
          if (!this.origSrc.includes("music_level_win")) return Promise.resolve();
          // The first play (the unlock) hangs, then rejects; the jingle's own play resolves.
          if (this.plays > 1) return Promise.resolve();
          return new Promise<void>((_resolve, reject) => {
            rejects.push(reject);
          });
        }
      },
    );
    const { playMusic, playLevelWin, stopLevelWin, disarmJingleUnlock } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    playLevelWin();
    const el = jingleEl("music_level_win");
    for (const reject of rejects) reject(new DOMException("blocked", "NotAllowedError"));
    await vi.advanceTimersByTimeAsync(0);
    // The take-over unmuted it; the late rejection must not mute it again.
    expect(el.muted).toBe(false);
    stopLevelWin();
    const plays = el.plays;
    // Not unlocked, so the next gesture retries once.
    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(plays + 1);
    disarmJingleUnlock();
  });
});

describe("background music", () => {
  it("starts the original intro first, played once at its trimmed volume", async () => {
    const { playMusic } = await load();
    playMusic(1);
    expect(musicEls()).toHaveLength(1);
    const el = musicEls()[0]!;
    expect(el.src).toBe(`${AUDIO}/music_intro.mp3`);
    expect(el.loop).toBe(false);
    expect(el.volume).toBeCloseTo(0.3, 6);
    expect(el.paused).toBe(false);
  });

  it("moves on to the original loop when the intro ends, looping on the same element", async () => {
    const { playMusic } = await load();
    playMusic(1);
    const el = musicEls()[0]!;
    el.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(musicEls()).toHaveLength(1);
    expect(el.src).toBe(`${AUDIO}/music_loop.mp3`);
    expect(el.loop).toBe(true);
    expect(el.volume).toBeCloseTo(0.3, 6);
    expect(el.paused).toBe(false);
    // The loop never ends, so it never advances again.
    el.finish();
    expect(el.src).toBe(`${AUDIO}/music_loop.mp3`);
  });

  it("keeps the same element at every level, during the intro and the loop", async () => {
    const { playMusic } = await load();
    playMusic(1);
    playMusic(8);
    expect(musicEls()).toHaveLength(1);
    musicEls()[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    playMusic(4);
    expect(musicEls()).toHaveLength(1);
  });

  it("carries a mute across the intro-to-loop hand-over", async () => {
    const { playMusic, setMusicMuted } = await load();
    playMusic(1);
    setMusicMuted(true);
    musicEls()[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(musicEls()[0]!.muted).toBe(true);
    setMusicMuted(false);
    expect(musicEls()[0]!.muted).toBe(false);
  });

  it("mutes the playing element and any element started while muted", async () => {
    const { playMusic, setMusicMuted, stopMusic } = await load();
    playMusic(1);
    setMusicMuted(true);
    expect(musicEls()[0]!.muted).toBe(true);
    stopMusic();
    playMusic(5);
    expect(musicEls()[1]!.muted).toBe(true);
    setMusicMuted(false);
    expect(musicEls()[1]!.muted).toBe(false);
  });

  it("stopMusic pauses, and the next playMusic starts a fresh intro", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    musicEls()[0]!.finish();
    await vi.advanceTimersByTimeAsync(0);
    stopMusic();
    expect(musicEls()[0]!.paused).toBe(true);
    playMusic(1);
    expect(musicEls()).toHaveLength(2);
    expect(musicEls()[1]!.src).toBe(`${AUDIO}/music_intro.mp3`);
    expect(musicEls()[1]!.loop).toBe(false);
  });

  it("a stopped intro that finishes late does not start the loop", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    const el = musicEls()[0]!;
    stopMusic();
    el.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(el.src).toBe(`${AUDIO}/music_intro.mp3`);
    expect(el.paused).toBe(true);
  });

  it("a mute during fadeOutMusic reaches the element that is still fading", async () => {
    const { playMusic, fadeOutMusic, setMusicMuted } = await load();
    playMusic(1);
    fadeOutMusic(1000);
    await vi.advanceTimersByTimeAsync(100);
    expect(musicEls()[0]!.paused).toBe(false);
    setMusicMuted(true);
    expect(musicEls()[0]!.muted).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(musicEls()[0]!.paused).toBe(true);
    // Done fading: a later unmute no longer touches it.
    setMusicMuted(false);
    expect(musicEls()[0]!.muted).toBe(true);
  });

  it("fadeOutMusic pauses the old element and frees the slot", async () => {
    const { playMusic, fadeOutMusic } = await load();
    playMusic(1);
    fadeOutMusic(100);
    await vi.advanceTimersByTimeAsync(300);
    expect(musicEls()[0]!.paused).toBe(true);
    playMusic(1);
    expect(musicEls()).toHaveLength(2);
  });

  it("an intro that finishes mid-fade does not start the loop", async () => {
    const { playMusic, fadeOutMusic } = await load();
    playMusic(1);
    const el = musicEls()[0]!;
    fadeOutMusic(100);
    el.finish();
    await vi.advanceTimersByTimeAsync(300);
    expect(el.src).toBe(`${AUDIO}/music_intro.mp3`);
    expect(el.paused).toBe(true);
  });
});

describe("the intro plays once per real start, not once per round", () => {
  it("a fade between rounds restarts straight on the loop, looping", async () => {
    const { playMusic, fadeOutMusic } = await load();
    playMusic(1);
    fadeOutMusic(250);
    await vi.advanceTimersByTimeAsync(400);
    playMusic(2);
    expect(musicEls()).toHaveLength(2);
    const next = musicEls()[1]!;
    expect(next.src).toBe(`${AUDIO}/music_loop.mp3`);
    expect(next.loop).toBe(true);
    expect(next.volume).toBeCloseTo(0.3, 6);
    expect(next.paused).toBe(false);
  });

  it("keeps going on the loop through every later round", async () => {
    const { playMusic, fadeOutMusic } = await load();
    playMusic(1);
    for (const level of [2, 3, 4]) {
      fadeOutMusic(100);
      await vi.advanceTimersByTimeAsync(200);
      playMusic(level);
    }
    const srcs = musicEls().map((el) => el.src);
    expect(srcs).toEqual([
      `${AUDIO}/music_intro.mp3`,
      `${AUDIO}/music_loop.mp3`,
      `${AUDIO}/music_loop.mp3`,
      `${AUDIO}/music_loop.mp3`,
    ]);
  });

  it("a restart on the loop honours a mute and has no hand-over to make", async () => {
    const { playMusic, fadeOutMusic, setMusicMuted } = await load();
    playMusic(1);
    fadeOutMusic(100);
    await vi.advanceTimersByTimeAsync(200);
    setMusicMuted(true);
    playMusic(2);
    const next = musicEls()[1]!;
    expect(next.muted).toBe(true);
    next.finish();
    expect(next.src).toBe(`${AUDIO}/music_loop.mp3`);
  });

  it("a real stop makes the next start play the intro again", async () => {
    const { playMusic, fadeOutMusic, stopMusic } = await load();
    playMusic(1);
    fadeOutMusic(100);
    await vi.advanceTimersByTimeAsync(200);
    playMusic(2);
    stopMusic();
    playMusic(1);
    const srcs = musicEls().map((el) => el.src);
    expect(srcs).toEqual([
      `${AUDIO}/music_intro.mp3`,
      `${AUDIO}/music_loop.mp3`,
      `${AUDIO}/music_intro.mp3`,
    ]);
    expect(musicEls()[2]!.loop).toBe(false);
  });

  it("a fade after a real stop does not count as the intro having played", async () => {
    const { playMusic, fadeOutMusic, stopMusic } = await load();
    playMusic(1);
    stopMusic();
    fadeOutMusic(100);
    playMusic(1);
    expect(musicEls()[1]!.src).toBe(`${AUDIO}/music_intro.mp3`);
  });
});

describe("loop preload", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("warms the loop into the HTTP cache shortly after the intro starts playing", async () => {
    const { playMusic } = await load();
    playMusic(1);
    musicEls()[0]!.emit("playing");
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(`${AUDIO}/music_loop.mp3`, {
      signal: expect.any(AbortSignal),
    });
  });

  it("does not fetch the loop while the intro has not started playing", async () => {
    const { playMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not fetch the loop when autoplay is blocked and the visitor never plays", async () => {
    vi.stubGlobal(
      "Audio",
      class extends FakeAudio {
        override play() {
          return Promise.reject(new DOMException("blocked", "NotAllowedError"));
        }
      },
    );
    const { playMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    // Let the armed gesture retry run, so no document listener outlives this test.
    document.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(0);
  });

  it("fetches the loop once, after the playing event, not before", async () => {
    const { playMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).not.toHaveBeenCalled();
    const intro = musicEls()[0]!;
    intro.emit("playing");
    intro.emit("playing");
    expect(fetchMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does it once per session, not once per start", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    musicEls()[0]!.emit("playing");
    await vi.advanceTimersByTimeAsync(3000);
    stopMusic();
    playMusic(1);
    musicEls()[1]!.emit("playing");
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("never warms again after a restart onto the loop", async () => {
    const { playMusic, fadeOutMusic } = await load();
    playMusic(1);
    musicEls()[0]!.emit("playing");
    await vi.advanceTimersByTimeAsync(3000);
    fadeOutMusic(100);
    await vi.advanceTimersByTimeAsync(200);
    playMusic(2);
    musicEls()[1]!.emit("playing");
    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("swallows a failed warm-up", async () => {
    fetchMock.mockRejectedValue(new TypeError("network down"));
    const { playMusic } = await load();
    playMusic(1);
    musicEls()[0]!.emit("playing");
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(musicEls()[0]!.paused).toBe(false);
  });

  it("is a no-op in a browser without fetch", async () => {
    vi.stubGlobal("fetch", undefined);
    const { playMusic } = await load();
    expect(() => playMusic(1)).not.toThrow();
    musicEls()[0]!.emit("playing");
    await vi.advanceTimersByTimeAsync(3000);
    expect(musicEls()[0]!.paused).toBe(false);
  });
});

// Every element created while `remaining` is above zero has its first play() rejected,
// as a browser does before the page has had a user gesture.
class BlockedOnceAudio extends FakeAudio {
  static remaining = 1;
  override play() {
    // Only the music elements are blocked; the jingle elements unlock without a fuss.
    if (/music_(intro|loop)/.test(this.origSrc) && BlockedOnceAudio.remaining > 0) {
      BlockedOnceAudio.remaining -= 1;
      this.plays += 1;
      return Promise.reject(new DOMException("blocked", "NotAllowedError"));
    }
    return super.play();
  }
}

const RETRY_EVENTS = ["pointerdown", "pointerup", "touchend", "keydown"];

// Counts the document listeners the retry has armed right now, so a missing
// cancel is visible even when the retry's own element guard would hide it.
function trackRetryListeners(): { armed: () => number } {
  const live = new Map<string, unknown>();
  const add = document.addEventListener.bind(document) as typeof document.addEventListener;
  const remove = document.removeEventListener.bind(document) as typeof document.removeEventListener;
  vi.spyOn(document, "addEventListener").mockImplementation((type, listener, options) => {
    if (RETRY_EVENTS.includes(type)) live.set(type, listener);
    add(type, listener, options);
  });
  vi.spyOn(document, "removeEventListener").mockImplementation((type, listener, options) => {
    if (live.get(type) === listener) live.delete(type);
    remove(type, listener, options);
  });
  return { armed: () => live.size };
}

async function gesture(event: Event): Promise<void> {
  document.dispatchEvent(event);
  await vi.advanceTimersByTimeAsync(0);
}

describe("blocked autoplay", () => {
  let listeners: { armed: () => number };

  beforeEach(() => {
    BlockedOnceAudio.remaining = 1;
    vi.stubGlobal("Audio", BlockedOnceAudio);
    listeners = trackRetryListeners();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("arms the retry when the browser rejects play(), and not before", async () => {
    const { playMusic, stopMusic } = await load();
    BlockedOnceAudio.remaining = 0;
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(listeners.armed()).toBe(0);
    stopMusic();

    BlockedOnceAudio.remaining = 1;
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);
    stopMusic();
  });

  it("retries the loop on the first gesture after the browser rejected play()", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = musicEls()[0] as BlockedOnceAudio;
    expect(el.paused).toBe(true);
    expect(el.plays).toBe(1);

    await gesture(new Event("pointerdown"));
    expect(el.plays).toBe(2);
    expect(el.paused).toBe(false);
    expect(listeners.armed()).toBe(0);

    // One retry only: later gestures do not call play() again.
    await gesture(new Event("keydown"));
    await gesture(new Event("pointerup"));
    expect(el.plays).toBe(2);
    stopMusic();
  });

  it.each(["pointerup", "touchend"])(
    "a %s alone retries the loop (touch activation)",
    async (name) => {
      const { playMusic, stopMusic } = await load();
      playMusic(1);
      await vi.advanceTimersByTimeAsync(0);
      const el = musicEls()[0] as BlockedOnceAudio;

      await gesture(new Event(name));
      expect(el.plays).toBe(2);
      expect(el.paused).toBe(false);
      stopMusic();
    },
  );

  it("a rejected retry re-arms for the next gesture", async () => {
    const { playMusic, stopMusic } = await load();
    BlockedOnceAudio.remaining = 2;
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = musicEls()[0] as BlockedOnceAudio;

    await gesture(new Event("pointerdown"));
    expect(el.plays).toBe(2);
    expect(el.paused).toBe(true);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    await gesture(new Event("pointerup"));
    expect(el.plays).toBe(3);
    expect(el.paused).toBe(false);
    stopMusic();
  });

  it("a key typed in a text field does not retry and leaves it armed", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = musicEls()[0] as BlockedOnceAudio;
    const input = document.createElement("input");
    document.body.append(input);

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(1);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    await gesture(new Event("pointerdown"));
    expect(el.plays).toBe(2);
    input.remove();
    stopMusic();
  });

  it("does not call play() while muted, stays armed, and an unmute starts the loop", async () => {
    const { playMusic, setMusicMuted, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = musicEls()[0] as BlockedOnceAudio;
    setMusicMuted(true);

    await gesture(new Event("pointerdown"));
    await gesture(new Event("keydown"));
    expect(el.plays).toBe(1);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    setMusicMuted(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.plays).toBe(2);
    expect(el.paused).toBe(false);
    expect(listeners.armed()).toBe(0);
    stopMusic();
  });

  it("stopMusic cancels the pending retry", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);
    stopMusic();
    expect(listeners.armed()).toBe(0);

    BlockedOnceAudio.remaining = 0;
    const first = musicEls()[0] as BlockedOnceAudio;
    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
    expect(first.paused).toBe(true);
  });

  it("fadeOutMusic cancels the pending retry", async () => {
    const { playMusic, fadeOutMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);
    fadeOutMusic(100);
    expect(listeners.armed()).toBe(0);
    await vi.advanceTimersByTimeAsync(300);

    const first = musicEls()[0] as BlockedOnceAudio;
    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
  });

  it("a restart cancels the old retry; a swapped-out late rejection does not arm one", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    stopMusic(); // a restart swaps the element before the first rejection lands
    playMusic(8);
    await vi.advanceTimersByTimeAsync(0);
    const first = musicEls()[0] as BlockedOnceAudio;
    const second = musicEls()[1] as BlockedOnceAudio;
    expect(second.plays).toBe(1);
    expect(second.paused).toBe(false); // the single block was spent on the first element
    expect(listeners.armed()).toBe(0);

    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
    expect(second.plays).toBe(1);
    stopMusic();
  });

  it("a restart onto an element that plays fine leaves no retry armed for the old one", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const first = musicEls()[0] as BlockedOnceAudio;
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    stopMusic();
    playMusic(8); // the block is spent: this element plays at once
    await vi.advanceTimersByTimeAsync(0);
    expect(listeners.armed()).toBe(0);

    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
    stopMusic();
  });

  it("a restart away from a blocked element cancels its retry, and the new element retries on its own", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const first = musicEls()[0] as BlockedOnceAudio;
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    BlockedOnceAudio.remaining = 1;
    stopMusic();
    playMusic(8);
    await vi.advanceTimersByTimeAsync(0);
    const second = musicEls()[1] as BlockedOnceAudio;
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
    expect(second.plays).toBe(2);
    expect(second.paused).toBe(false);
    stopMusic();
  });

  it("retries the loop on the next gesture when the intro-to-loop hand-over is blocked", async () => {
    const { playMusic, stopMusic } = await load();
    BlockedOnceAudio.remaining = 0;
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = musicEls()[0] as BlockedOnceAudio;
    expect(listeners.armed()).toBe(0);

    BlockedOnceAudio.remaining = 1;
    el.finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(el.src).toBe("/games/super-voltorb-flip/audio/music_loop.mp3");
    expect(el.paused).toBe(true);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    await gesture(new Event("pointerdown"));
    expect(el.paused).toBe(false);
    expect(listeners.armed()).toBe(0);
    stopMusic();
  });

  it("does not retry once the music was stopped", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = musicEls()[0] as BlockedOnceAudio;
    stopMusic();

    await gesture(new Event("pointerdown"));
    expect(el.plays).toBe(1);
    expect(el.paused).toBe(true);
  });
});
