import type { Cue } from "./sound-cues";

// Web Audio scheduling for Super Voltorb Flip's synthesized cues.
//
// Dependency-injectable: every function takes a context shaped like CtxLike,
// so tests pass a recording fake and a real AudioContext satisfies the same
// shape. Nothing here touches `window` or `AudioContext`; audio.ts owns the
// lazy singleton. The envelope and noise idioms (linear attack, exponential
// release toward a tiny non-zero value, decaying white noise, a limiter on the
// master bus) follow Password Game 2's synth, copied rather than imported
// across games.

export interface ParamLike {
  value: number;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

export interface NodeLike {
  connect(destination: NodeLike): unknown;
}

export interface GainLike extends NodeLike {
  gain: ParamLike;
}

interface SourceLike extends NodeLike {
  start(when: number): void;
  stop(when: number): void;
}

interface OscillatorLike extends SourceLike {
  type: string;
  frequency: ParamLike;
}

interface FilterLike extends NodeLike {
  type: string;
  frequency: ParamLike;
}

interface CompressorLike extends NodeLike {
  threshold: ParamLike;
  knee: ParamLike;
  ratio: ParamLike;
  attack: ParamLike;
  release: ParamLike;
}

interface BufferLike {
  getChannelData(channel: number): Float32Array;
}

interface BufferSourceLike extends SourceLike {
  buffer: BufferLike | null;
}

export interface CtxLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: NodeLike;
  readonly state?: string;
  resume?(): Promise<void>;
  createGain(): GainLike;
  createOscillator(): OscillatorLike;
  createBiquadFilter(): FilterLike;
  createDynamicsCompressor(): CompressorLike;
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike;
  createBufferSource(): BufferSourceLike;
}

export interface Master {
  ctx: CtxLike;
  /** Every cue connects here. Its gain is the mute switch (0 or 1). */
  out: GainLike;
}

export interface CueHandle {
  stop(): void;
}

/** out -> limiter -> destination. The limiter keeps stacked cues from clipping. */
export function createMaster(ctx: CtxLike, muted: boolean): Master {
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const out = ctx.createGain();
  out.gain.value = muted ? 0 : 1;
  out.connect(limiter);
  return { ctx, out };
}

export function setMasterMuted(master: Master, muted: boolean): void {
  master.out.gain.value = muted ? 0 : 1;
}

const FLOOR = 0.0001;

/**
 * Schedule every voice of `cue` starting at context time `startAt` (seconds).
 * Returns a handle whose stop() silences whatever has not finished.
 */
export function scheduleCue(ctx: CtxLike, dest: NodeLike, cue: Cue, startAt: number): CueHandle {
  const sources: SourceLike[] = [];

  for (const n of cue.notes) {
    const t = startAt + n.at / 1000;
    const dur = n.dur / 1000;
    const attack = Math.min(0.01, dur / 4);

    const osc = ctx.createOscillator();
    osc.type = n.wave;
    osc.frequency.setValueAtTime(n.hz, t);
    if (n.toHz !== undefined) osc.frequency.exponentialRampToValueAtTime(n.toHz, t + dur);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(FLOOR, t);
    gain.gain.linearRampToValueAtTime(n.gain, t + attack);
    gain.gain.exponentialRampToValueAtTime(FLOOR, t + dur);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    sources.push(osc);
  }

  for (const hit of cue.noise) {
    const t = startAt + hit.at / 1000;
    const dur = hit.dur / 1000;
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / frames) * 6);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(hit.lowpassHz, t);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(hit.gain, t);
    gain.gain.exponentialRampToValueAtTime(FLOOR, t + dur);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(t);
    src.stop(t + dur);
    sources.push(src);
  }

  return {
    stop() {
      const now = ctx.currentTime;
      for (const s of sources) s.stop(now);
    },
  };
}
