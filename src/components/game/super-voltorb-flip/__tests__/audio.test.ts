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
    expect(lastStop(ctx.oscillators[0]!)).toBeCloseTo(0.512, 6);
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
    expect(lastStop(ctx.oscillators[0]!)).toBeCloseTo(1.012, 6);
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

  it("a mute during fadeOutMusic reaches the element that is still fading", async () => {
    const { playMusic, fadeOutMusic, setMusicMuted } = await load();
    playMusic(1);
    fadeOutMusic(1000);
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeAudio.all[0]!.paused).toBe(false);
    setMusicMuted(true);
    expect(FakeAudio.all[0]!.muted).toBe(true);
    await vi.advanceTimersByTimeAsync(1200);
    expect(FakeAudio.all[0]!.paused).toBe(true);
    // Done fading: a later unmute no longer touches it.
    setMusicMuted(false);
    expect(FakeAudio.all[0]!.muted).toBe(true);
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

// Every element created while `remaining` is above zero has its first play() rejected,
// as a browser does before the page has had a user gesture.
class BlockedOnceAudio extends FakeAudio {
  static remaining = 1;
  plays = 0;
  override play() {
    this.plays += 1;
    if (BlockedOnceAudio.remaining > 0) {
      BlockedOnceAudio.remaining -= 1;
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
    playMusic(8);
    await vi.advanceTimersByTimeAsync(0);
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);
    stopMusic();
  });

  it("retries the loop on the first gesture after the browser rejected play()", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = FakeAudio.all[0] as BlockedOnceAudio;
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
      const el = FakeAudio.all[0] as BlockedOnceAudio;

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
    const el = FakeAudio.all[0] as BlockedOnceAudio;

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
    const el = FakeAudio.all[0] as BlockedOnceAudio;
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
    const el = FakeAudio.all[0] as BlockedOnceAudio;
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
    const first = FakeAudio.all[0] as BlockedOnceAudio;
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

    const first = FakeAudio.all[0] as BlockedOnceAudio;
    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
  });

  it("a track swap cancels the old retry; a swapped-out late rejection does not arm one", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    playMusic(8); // a different band swaps the element before the first rejection lands
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeAudio.all[0] as BlockedOnceAudio;
    const second = FakeAudio.all[1] as BlockedOnceAudio;
    expect(second.plays).toBe(1);
    expect(second.paused).toBe(false); // the single block was spent on the first element
    expect(listeners.armed()).toBe(0);

    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
    expect(second.plays).toBe(1);
    stopMusic();
  });

  it("a swap to a track that plays fine leaves no retry armed for the old one", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeAudio.all[0] as BlockedOnceAudio;
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    playMusic(8); // the block is spent: this element plays at once
    await vi.advanceTimersByTimeAsync(0);
    expect(listeners.armed()).toBe(0);

    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
    stopMusic();
  });

  it("a swap away from a blocked track cancels its retry, and the new track retries on its own", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const first = FakeAudio.all[0] as BlockedOnceAudio;
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    BlockedOnceAudio.remaining = 1;
    playMusic(8);
    await vi.advanceTimersByTimeAsync(0);
    const second = FakeAudio.all[1] as BlockedOnceAudio;
    expect(listeners.armed()).toBe(RETRY_EVENTS.length);

    await gesture(new Event("pointerdown"));
    expect(first.plays).toBe(1);
    expect(second.plays).toBe(2);
    expect(second.paused).toBe(false);
    stopMusic();
  });

  it("does not retry once the music was stopped", async () => {
    const { playMusic, stopMusic } = await load();
    playMusic(1);
    await vi.advanceTimersByTimeAsync(0);
    const el = FakeAudio.all[0] as BlockedOnceAudio;
    stopMusic();

    await gesture(new Event("pointerdown"));
    expect(el.plays).toBe(1);
    expect(el.paused).toBe(true);
  });
});
