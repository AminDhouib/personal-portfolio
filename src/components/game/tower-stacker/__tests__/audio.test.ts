import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTowerAudio, SOUND_KEY } from "../audio";
import { CUES } from "../sound-cues";
import { makeFakeCtx, type FakeCtx } from "./fake-ctx";

let created: FakeCtx[] = [];

function stubAudioContext() {
  created = [];
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        const ctx = makeFakeCtx();
        created.push(ctx);
        return ctx;
      }
    },
  );
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("createTowerAudio", () => {
  it("creates no AudioContext before unlock()", () => {
    stubAudioContext();
    const audio = createTowerAudio();
    audio.play(CUES.drop);
    expect(created).toHaveLength(0);
  });

  it("schedules a cue once unlocked", () => {
    stubAudioContext();
    const audio = createTowerAudio();
    audio.unlock();
    audio.play(CUES.drop);
    expect(created).toHaveLength(1);
    expect(created[0]?.oscillators.length).toBeGreaterThan(0);
    expect(created[0]?.noiseSources.length).toBeGreaterThan(0);
  });

  it("wakes a suspended context", () => {
    stubAudioContext();
    const audio = createTowerAudio();
    audio.unlock();
    const ctx = created[0];
    if (!ctx) throw new Error("no context");
    ctx.state = "suspended";
    audio.play(CUES.drop);
    expect(ctx.resumed).toBeGreaterThan(0);
  });

  it("defaults to sound on, and a muted game schedules nothing", () => {
    stubAudioContext();
    const audio = createTowerAudio();
    expect(audio.isMuted()).toBe(false);
    audio.unlock();
    audio.setMuted(true);
    expect(localStorage.getItem(SOUND_KEY)).toBe("0");
    const before = created[0]?.oscillators.length ?? 0;
    audio.play(CUES.drop);
    expect(created[0]?.oscillators.length).toBe(before);
  });

  it("reads a stored mute and writes the unmute", () => {
    stubAudioContext();
    localStorage.setItem(SOUND_KEY, "0");
    const audio = createTowerAudio();
    expect(audio.isMuted()).toBe(true);
    audio.setMuted(false);
    expect(localStorage.getItem(SOUND_KEY)).toBe("1");
  });

  it("never throws without an AudioContext", () => {
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);
    const audio = createTowerAudio();
    expect(() => {
      audio.unlock();
      audio.play(CUES.miss);
      audio.stop();
    }).not.toThrow();
  });
});

describe("close", () => {
  it("closes the AudioContext it created and is safe to repeat", () => {
    stubAudioContext();
    const audio = createTowerAudio();
    audio.unlock();
    audio.close();
    audio.close();
    expect(created[0]?.closed).toBe(1);
  });

  it("does nothing before unlock()", () => {
    stubAudioContext();
    const audio = createTowerAudio();
    expect(() => audio.close()).not.toThrow();
    expect(created).toHaveLength(0);
  });
});
