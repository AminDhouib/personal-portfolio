import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CUES, LEVEL_WIN_MS, RISK_WARNING_MS } from "../sound-cues";
import { makeFakeCtx, type FakeCtx } from "./fake-ctx";

class FakeAudio {
  static all: FakeAudio[] = [];
  src: string;
  loop = false;
  volume = 1;
  muted = false;
  paused = true;
  constructor(src: string) {
    this.src = src;
    FakeAudio.all.push(this);
  }
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
}

let ctx: FakeCtx;

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
    expect(ctx.gains[0]!.gain.value).toBe(1);
    setMusicMuted(true);
    expect(ctx.gains[0]!.gain.value).toBe(0);
    setMusicMuted(false);
    expect(ctx.gains[0]!.gain.value).toBe(1);
  });

  it("resumes a suspended context on the first cue", async () => {
    ctx.state = "suspended";
    const { sfx } = await load();
    void sfx.flip();
    expect(ctx.resumed).toBe(1);
  });
});

describe("level-clear fanfare", () => {
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

  it("does not call onEnded after stopLevelWin, and halts the voices", async () => {
    const { playLevelWin, stopLevelWin } = await load();
    const onEnded = vi.fn();
    playLevelWin(onEnded);
    ctx.currentTime = 0.5;
    stopLevelWin();
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS * 2);
    expect(onEnded).not.toHaveBeenCalled();
    expect(ctx.oscillators[0]!.stopped[ctx.oscillators[0]!.stopped.length - 1]).toBe(0.5);
  });

  it("still calls onEnded on time when there is no AudioContext", async () => {
    installContext(undefined);
    const { playLevelWin } = await load();
    const onEnded = vi.fn();
    playLevelWin(onEnded);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS + 1);
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it("restarting the fanfare cancels the first one's callback", async () => {
    const { playLevelWin } = await load();
    const first = vi.fn();
    const second = vi.fn();
    playLevelWin(first);
    await vi.advanceTimersByTimeAsync(500);
    playLevelWin(second);
    await vi.advanceTimersByTimeAsync(LEVEL_WIN_MS + 1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("game-over jingle", () => {
  it("plays once and stopGameOver halts it", async () => {
    const { playGameOver, stopGameOver } = await load();
    playGameOver();
    const count = ctx.oscillators.length;
    expect(count).toBe(CUES.gameOver.notes.length);
    ctx.currentTime = 1;
    stopGameOver();
    expect(ctx.oscillators[0]!.stopped[ctx.oscillators[0]!.stopped.length - 1]).toBe(1);
  });
});

describe("background music", () => {
  it("starts the band's track looping at its trimmed volume", async () => {
    const { playMusic } = await load();
    playMusic(1);
    expect(FakeAudio.all).toHaveLength(1);
    const el = FakeAudio.all[0]!;
    expect(el.src).toBe("/games/super-voltorb-flip/music/rookie.mp3");
    expect(el.loop).toBe(true);
    expect(el.volume).toBeCloseTo(0.29, 6);
    expect(el.paused).toBe(false);
  });

  it("keeps the same element while the band is unchanged", async () => {
    const { playMusic } = await load();
    playMusic(1);
    playMusic(3);
    expect(FakeAudio.all).toHaveLength(1);
  });

  it("swaps the element when the band changes", async () => {
    const { playMusic } = await load();
    playMusic(3);
    playMusic(4);
    expect(FakeAudio.all).toHaveLength(2);
    expect(FakeAudio.all[0]!.paused).toBe(true);
    expect(FakeAudio.all[1]!.src).toBe("/games/super-voltorb-flip/music/veteran.mp3");
  });

  it("mutes the playing element and any element started while muted", async () => {
    const { playMusic, setMusicMuted } = await load();
    playMusic(1);
    setMusicMuted(true);
    expect(FakeAudio.all[0]!.muted).toBe(true);
    playMusic(5);
    expect(FakeAudio.all[1]!.muted).toBe(true);
    setMusicMuted(false);
    expect(FakeAudio.all[1]!.muted).toBe(false);
  });

  it("stopMusic pauses and lets the next playMusic start a fresh element", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    stopMusic();
    expect(FakeAudio.all[0]!.paused).toBe(true);
    playMusic(1);
    expect(FakeAudio.all).toHaveLength(2);
  });

  it("fadeOutMusic pauses the old element and frees the slot", async () => {
    const { playMusic, fadeOutMusic } = await load();
    playMusic(1);
    fadeOutMusic(100);
    await vi.advanceTimersByTimeAsync(300);
    expect(FakeAudio.all[0]!.paused).toBe(true);
    playMusic(1);
    expect(FakeAudio.all).toHaveLength(2);
  });
});
