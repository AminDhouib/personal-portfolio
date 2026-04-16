/**
 * Lightweight Web Audio SFX manager for Password Game 2.
 * No external audio files — all sounds are synthesized procedurally so they
 * ship with zero network cost. Opt-in: the player toggles audio on via a
 * button in the UI; until then, nothing plays.
 */

type SfxKind = "rule-complete" | "rule-fail" | "rule-reveal" | "win" | "chaos" | "crack" | "rumble" | "unsatisfy" | "keypress";

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
    case "crack":
      // Glass-breaking impression: sharp initial click, then tinkling high burst.
      tone(ctx, 2800, 0.04, "square", 0.15);
      setTimeout(() => filteredNoise(ctx, 0.22, 0.18, 4500), 15);
      setTimeout(() => tone(ctx, 3200 + Math.random() * 400, 0.05, "triangle", 0.06), 80);
      setTimeout(() => tone(ctx, 2600 + Math.random() * 300, 0.05, "triangle", 0.05), 140);
      setTimeout(() => tone(ctx, 3800 + Math.random() * 200, 0.04, "triangle", 0.04), 200);
      break;
    case "rumble":
      // Deep low-frequency rumble — felt more than heard. Used to mark a
      // new chaos tier unlocking, under the crack SFX.
      tone(ctx, 55, 0.8, "sine", 0.2);
      setTimeout(() => tone(ctx, 42, 0.9, "sine", 0.18), 100);
      setTimeout(() => tone(ctx, 70, 0.6, "sine", 0.1), 250);
      break;
    case "unsatisfy":
      // Descending two-tone "wrong" alert. Fires when a cleared rule becomes
      // unsatisfied again (player typed over a constraint).
      tone(ctx, 420, 0.12, "sawtooth", 0.14);
      setTimeout(() => tone(ctx, 260, 0.2, "sawtooth", 0.12), 80);
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

/** High-pass filtered noise burst — for tinkling-glass character. */
function filteredNoise(
  ctx: AudioContext,
  duration: number,
  volume: number,
  cutoffHz: number
): void {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * volume;
  }
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = cutoffHz;
  hp.Q.value = 0.7;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  src.connect(hp);
  hp.connect(gain);
  gain.connect(ctx.destination);
  src.start();
}
