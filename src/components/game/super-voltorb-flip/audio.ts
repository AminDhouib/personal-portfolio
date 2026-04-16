export type Note = {
  freq: number;
  duration: number;
  type?: OscillatorType;
  volume?: number;
  detune?: number;
};

export type StingerKind =
  | "win"
  | "lose"
  | "levelUp"
  | "tileFlip"
  | "explosion"
  | "coinTick"
  | "shieldAbsorb"
  | "voltorbReveal"
  | "streakMilestone"
  | "checkpoint";

/**
 * Short original musical phrases generated via Web Audio oscillators.
 * Frequencies follow equal-tempered tuning.
 */
export const STINGERS: Record<StingerKind, Note[]> = {
  // Ascending major arpeggio: C5 E5 G5 C6
  win: [
    { freq: 523.25, duration: 0.10, type: "square", volume: 0.22 },
    { freq: 659.25, duration: 0.10, type: "square", volume: 0.22 },
    { freq: 783.99, duration: 0.10, type: "square", volume: 0.22 },
    { freq: 1046.5, duration: 0.28, type: "square", volume: 0.26 },
  ],
  // Descending minor: G4 Eb4 C4
  lose: [
    { freq: 392.0, duration: 0.18, type: "sawtooth", volume: 0.22 },
    { freq: 311.13, duration: 0.18, type: "sawtooth", volume: 0.2 },
    { freq: 261.63, duration: 0.4, type: "sawtooth", volume: 0.18 },
  ],
  levelUp: [
    { freq: 1174.66, duration: 0.08, type: "sine", volume: 0.24 },
    { freq: 880.0, duration: 0.08, type: "square", volume: 0.18 },
    { freq: 1046.5, duration: 0.08, type: "square", volume: 0.18 },
    { freq: 1318.51, duration: 0.2, type: "square", volume: 0.2 },
  ],
  tileFlip: [
    { freq: 1800, duration: 0.025, type: "square", volume: 0.12 },
    { freq: 600, duration: 0.04, type: "triangle", volume: 0.15 },
  ],
  explosion: [
    { freq: 260, duration: 0.05, type: "sawtooth", volume: 0.3 },
    { freq: 180, duration: 0.07, type: "sawtooth", volume: 0.28 },
    { freq: 120, duration: 0.09, type: "sawtooth", volume: 0.26 },
    { freq: 60, duration: 0.2, type: "sawtooth", volume: 0.22 },
  ],
  coinTick: [{ freq: 1760, duration: 0.025, type: "square", volume: 0.14 }],
  shieldAbsorb: [
    { freq: 1108.73, duration: 0.08, type: "square", volume: 0.22 },
    { freq: 880.0, duration: 0.12, type: "triangle", volume: 0.18 },
    { freq: 1318.51, duration: 0.3, type: "sine", volume: 0.14 },
  ],
  voltorbReveal: [
    { freq: 523.25, duration: 0.08, type: "triangle", volume: 0.18 },
    { freq: 659.25, duration: 0.08, type: "triangle", volume: 0.18 },
    { freq: 783.99, duration: 0.2, type: "triangle", volume: 0.2 },
  ],
  streakMilestone: [
    { freq: 880, duration: 0.04, type: "square", volume: 0.18 },
    { freq: 1320, duration: 0.1, type: "square", volume: 0.2 },
  ],
  checkpoint: [
    { freq: 659.25, duration: 0.12, type: "square", volume: 0.22 },
    { freq: 880.0, duration: 0.12, type: "square", volume: 0.22 },
    { freq: 1046.5, duration: 0.3, type: "square", volume: 0.24 },
  ],
};

export function synthStinger(
  ctx: AudioContext,
  kind: StingerKind,
  masterGain = 1
): Promise<void> {
  const notes = STINGERS[kind];
  let t = ctx.currentTime;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    osc.type = note.type ?? "square";
    osc.frequency.setValueAtTime(note.freq, t);
    if (note.detune) osc.detune.setValueAtTime(note.detune, t);

    const gain = ctx.createGain();
    const vol = (note.volume ?? 0.2) * masterGain;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.005);
    gain.gain.linearRampToValueAtTime(0.0001, t + note.duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + note.duration);

    t += note.duration;
  }

  return new Promise((resolve) => setTimeout(resolve, (t - ctx.currentTime) * 1000));
}

/**
 * Voltorb explosion = noise burst + the descending pitch stinger.
 */
export function synthExplosion(ctx: AudioContext, masterGain = 1): void {
  const t = ctx.currentTime;

  const noiseDuration = 0.4;
  const sampleRate = ctx.sampleRate;
  const bufferSize = Math.floor(sampleRate * noiseDuration);
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.35 * masterGain, t);
  noiseGain.gain.linearRampToValueAtTime(0.0001, t + noiseDuration);
  noiseSrc.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noiseSrc.start(t);

  synthStinger(ctx, "explosion", masterGain);
}

export class BgmPlayer {
  private ctx: AudioContext;
  private current: { src: AudioBufferSourceNode; gain: GainNode; url: string } | null = null;
  private masterGain: GainNode;
  private buffers = new Map<string, AudioBuffer>();

  constructor(ctx: AudioContext, masterVolume = 0.5) {
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = masterVolume;
    this.masterGain.connect(ctx.destination);
  }

  setVolume(v: number) {
    this.masterGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  private async loadBuffer(url: string): Promise<AudioBuffer> {
    const cached = this.buffers.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await this.ctx.decodeAudioData(arr);
    this.buffers.set(url, buf);
    return buf;
  }

  async crossfadeTo(url: string, fadeDuration = 1.0): Promise<void> {
    if (this.current?.url === url) return;
    const buf = await this.loadBuffer(url);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(this.masterGain);
    src.start(this.ctx.currentTime);

    const now = this.ctx.currentTime;
    gain.gain.linearRampToValueAtTime(1, now + fadeDuration);

    const old = this.current;
    if (old) {
      old.gain.gain.linearRampToValueAtTime(0, now + fadeDuration);
      setTimeout(() => {
        try {
          old.src.stop();
        } catch {
          // Already stopped
        }
      }, (fadeDuration + 0.1) * 1000);
    }

    this.current = { src, gain, url };
  }

  stop() {
    if (this.current) {
      try {
        this.current.src.stop();
      } catch {
        // Already stopped
      }
      this.current = null;
    }
  }
}
