/**
 * Lightweight Web Audio SFX manager for Password Game 2.
 * No external audio files — all sounds are synthesized procedurally so they
 * ship with zero network cost. Opt-in: the player toggles audio on via a
 * button in the UI; until then, nothing plays.
 */

type SfxKind = "rule-complete" | "rule-fail" | "rule-reveal" | "win" | "chaos" | "keypress";

let audioCtx: AudioContext | null = null;
let enabled = false;

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  } catch {
    return null;
  }
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (on) ensureCtx();
}

export function isSoundEnabled(): boolean {
  return enabled;
}

/** Play a synthesized sound for the given kind. Silent when disabled. */
export function play(kind: SfxKind): void {
  if (!enabled) return;
  const ctx = ensureCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume().catch(() => undefined);

  switch (kind) {
    case "rule-complete":
      tone(ctx, 880, 0.12, "sine", 0.12);
      setTimeout(() => tone(ctx, 1320, 0.12, "sine", 0.1), 60);
      break;
    case "rule-fail":
      tone(ctx, 180, 0.2, "sawtooth", 0.08);
      break;
    case "rule-reveal":
      tone(ctx, 520, 0.08, "triangle", 0.08);
      break;
    case "win":
      tone(ctx, 660, 0.12, "sine", 0.12);
      setTimeout(() => tone(ctx, 880, 0.12, "sine", 0.12), 80);
      setTimeout(() => tone(ctx, 1100, 0.18, "sine", 0.14), 160);
      setTimeout(() => tone(ctx, 1320, 0.26, "sine", 0.18), 280);
      break;
    case "chaos":
      noise(ctx, 0.25, 0.08);
      break;
    case "keypress":
      tone(ctx, 1400 + Math.random() * 200, 0.02, "square", 0.02);
      break;
  }
}

function tone(
  ctx: AudioContext,
  freq: number,
  duration: number,
  type: OscillatorType,
  volume: number
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + duration);
}

function noise(ctx: AudioContext, duration: number, volume: number): void {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * volume;
  }
  const src = ctx.createBufferSource();
  const gain = ctx.createGain();
  src.buffer = buffer;
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);
  src.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}
