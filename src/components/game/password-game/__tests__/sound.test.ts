import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setSoundEnabled, closeSound, play } from "../sound";

/**
 * Minimal fake AudioContext: enough surface for tone()/noise()/filteredNoise()
 * to run, and a createOscillator that throws once "closed" — mirroring the
 * real Web Audio spec (calling createOscillator on a closed AudioContext
 * throws InvalidStateError), so the pinning test below is meaningful.
 */
class FakeAudioContext {
  state: "running" | "closed" = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};

  createOscillator = vi.fn(() => {
    if (this.state === "closed") {
      throw new DOMException("createOscillator on a closed AudioContext", "InvalidStateError");
    }
    return {
      type: "sine" as OscillatorType,
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  });

  createGain = vi.fn(() => ({
    gain: {
      value: 0,
      linearRampToValueAtTime: vi.fn(),
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));

  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(4) }));

  createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() }));

  createBiquadFilter = vi.fn(() => ({
    type: "highpass" as BiquadFilterType,
    frequency: { value: 0 },
    Q: { value: 0 },
    connect: vi.fn(),
  }));

  resume = vi.fn(() => Promise.resolve());

  close = vi.fn(() => {
    this.state = "closed";
    return Promise.resolve();
  });
}

let fakeCtx: FakeAudioContext;

beforeEach(() => {
  vi.useFakeTimers();
  fakeCtx = new FakeAudioContext();
  vi.stubGlobal(
    "AudioContext",
    // `function`, not an arrow: `new Ctor()` requires a constructible function
    // (arrow functions throw "not a constructor"); returning an object from a
    // constructor call substitutes it for `this`, so `new Ctor()` yields fakeCtx.
    vi.fn(function AudioContextStub() {
      return fakeCtx;
    }),
  );
});

afterEach(() => {
  closeSound();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("password-game sound: closeSound clears in-flight SFX timers", () => {
  it("does not throw and does not fire additional createOscillator calls after closeSound", () => {
    setSoundEnabled(true);
    play("win"); // 1 immediate tone() + 3 setTimeout-deferred tones (80/160/280ms)

    const callsBeforeClose = fakeCtx.createOscillator.mock.calls.length;
    expect(callsBeforeClose).toBe(1);

    closeSound();

    expect(() => vi.advanceTimersByTime(300)).not.toThrow();
    expect(fakeCtx.createOscillator.mock.calls.length).toBe(callsBeforeClose);
  });
});
