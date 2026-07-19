// Procedural Web Audio core for Password Game 2.
//
// Engine-agnostic and dependency-injectable: the synthesis helpers take an
// AudioBus, so tests pass a plain fake context/bus and assert on the recorded
// node graph without a real AudioContext or jsdom audio. Nothing in this module
// touches `window` or `AudioContext` at import time -- every browser reference
// is lazily reached inside a function, so the file stays importable under
// vitest/node. The idioms (limiter bus, setValueAtTime/linearRamp/exponentialRamp
// envelopes, white-noise buffers) mirror the space-shooter audio overhaul
// (commit 06dec3a); small helpers are copied here rather than imported across
// games.

// --- Minimal structural interfaces -----------------------------------------
// Local "-like" shapes so a real DOM AudioContext AND a plain test fake both
// satisfy them. We deliberately avoid depending on the DOM lib types directly
// so the fakes can be trivial recording objects.

export type ToneType = "sine" | "square" | "sawtooth" | "triangle";

interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

interface AudioNodeLike {
  connect(destination: AudioNodeLike): unknown;
}

interface GainNodeLike extends AudioNodeLike {
  gain: AudioParamLike;
}

interface OscillatorNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
  detune?: AudioParamLike;
  start(when: number): void;
  stop(when: number): void;
}

interface BiquadFilterNodeLike extends AudioNodeLike {
  type: string;
  frequency: AudioParamLike;
}

interface CompressorNodeLike extends AudioNodeLike {
  threshold: AudioParamLike;
  knee: AudioParamLike;
  ratio: AudioParamLike;
  attack: AudioParamLike;
  release: AudioParamLike;
}

interface AudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

interface BufferSourceNodeLike extends AudioNodeLike {
  buffer: AudioBufferLike | null;
  start(when: number): void;
  stop(when: number): void;
}

export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: AudioNodeLike;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  createBiquadFilter(): BiquadFilterNodeLike;
  createDynamicsCompressor(): CompressorNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBufferLike;
  createBufferSource(): BufferSourceNodeLike;
}

/** The routing surface every cue draws on: a context plus two named buses. */
export interface AudioBus {
  ctx: AudioContextLike;
  /** One-shot sound effects (0.9). */
  sfx: GainNodeLike;
  /** Sustained musical material -- fanfares, the finale theme (0.5). */
  music: GainNodeLike;
}

// --- Bus construction -------------------------------------------------------

/**
 * Build the master chain: everything routes through one DynamicsCompressor
 * configured as a brick-wall limiter so stacked cues never clip the output,
 * then two gain buses (sfx / music) feed the limiter. Mirrors the
 * space-shooter bus graph, retuned for this game's mix.
 */
export function createBus(ctx: AudioContextLike): AudioBus {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(limiter);

  const music = ctx.createGain();
  music.gain.value = 0.5;
  music.connect(limiter);

  return { ctx, sfx, music };
}

// --- Lazy singleton + enabled state ----------------------------------------

const STORAGE_KEY = "pg2-sound";

let bus: AudioBus | null = null;
let enabled: boolean | null = null;

function browserWindow(): (Window & typeof globalThis) | null {
  return typeof window === "undefined" ? null : window;
}

function readStore(): Storage | null {
  const w = browserWindow();
  if (!w) return null;
  try {
    return w.localStorage;
  } catch {
    // silent-ok: some privacy modes throw on localStorage access; treat as absent.
    return null;
  }
}

function hydrateEnabled(): boolean {
  const store = readStore();
  if (!store) return false;
  try {
    return store.getItem(STORAGE_KEY) === "1";
  } catch {
    // silent-ok: read failures fall back to the muted default.
    return false;
  }
}

/** Playback gate. Sound is OFF by default until the player opts in. */
export function isEnabled(): boolean {
  if (enabled === null) enabled = hydrateEnabled();
  return enabled;
}

/** Toggle playback and persist the choice when localStorage is available. */
export function setEnabled(on: boolean): void {
  enabled = on;
  const store = readStore();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, on ? "1" : "0");
  } catch {
    // silent-ok: persistence is best-effort; a blocked write must not break audio.
  }
}

/**
 * Lazy AudioContext + bus singleton. Returns null outside the browser (so the
 * module stays safe under vitest/node) and null if the platform has no usable
 * AudioContext. The `window`/AudioContext references live entirely inside this
 * function -- never at module scope.
 */
export function getAudio(): AudioBus | null {
  if (bus) return bus;
  const w = browserWindow();
  if (!w) return null;
  try {
    const Ctor =
      w.AudioContext || (w as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    const ctx: AudioContextLike = new Ctor();
    bus = createBus(ctx);
    return bus;
  } catch {
    // silent-ok: a blocked/unsupported AudioContext must not throw into callers.
    return null;
  }
}

// --- Synthesis helpers ------------------------------------------------------

export interface ToneOptions {
  freq: number;
  durMs: number;
  type?: ToneType;
  gainPeak: number;
  attackMs?: number;
  releaseMs?: number;
  detune?: number;
}

/**
 * One enveloped oscillator into the sfx bus: a linear attack ramp to the peak
 * followed by an exponential release toward silence. The exponential target is
 * a tiny non-zero value because Web Audio's exponentialRamp cannot reach 0.
 */
export function playTone(bus: AudioBus, opts: ToneOptions): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const attack = (opts.attackMs ?? 8) / 1000;
  const release = (opts.releaseMs ?? Math.max(opts.durMs - (opts.attackMs ?? 8), 20)) / 1000;

  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, t);
  if (opts.detune !== undefined && osc.detune) osc.detune.setValueAtTime(opts.detune, t);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(opts.gainPeak, t + attack); // attack
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release); // release

  osc.connect(gain);
  gain.connect(bus.sfx);
  osc.start(t);
  osc.stop(t + attack + release + 0.02);
}

export interface NoiseOptions {
  durMs: number;
  gainPeak: number;
  filterHz?: number;
}

/**
 * A white-noise burst with an exponential decay, optionally lowpass-filtered.
 * Used for shredding, crackle, thuds and impacts.
 */
export function playNoise(bus: AudioBus, opts: NoiseOptions): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const dur = opts.durMs / 1000;
  const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / frames) * 6);
  }

  const src = ctx.createBufferSource();
  src.buffer = buffer;

  let tail: AudioNodeLike = src;
  if (opts.filterHz !== undefined) {
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(opts.filterHz, t);
    src.connect(filt);
    tail = filt;
  }

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(opts.gainPeak, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  tail.connect(gain);
  gain.connect(bus.sfx);
  src.start(t);
  src.stop(t + dur);
}
