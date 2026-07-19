// Named procedural cues for Password Game 2.
//
// One function per cue, gathered into the MOTIFS registry the shell drains
// engine `sound` effects through. Every cue is synthesised on the fly (no audio
// files) and takes an AudioBus so tests can drive them against a fake context.
// The finale `victory` theme is scheduled ahead via ctx.currentTime offsets so
// its four chords land in time rather than all at once.

import {
  type AudioBus,
  type AudioContextLike,
  playNoise,
  playTone,
  getAudio,
  isEnabled,
} from "./audio";

type Destination = AudioBus["sfx"];

// Scheduled enveloped tone at an absolute context time -- the building block for
// the multi-note sequences (fanfare, victory) that playTone (always "now")
// cannot express.
function toneAt(
  ctx: AudioContextLike,
  dest: Destination,
  o: {
    freq: number;
    at: number;
    durMs: number;
    peak: number;
    type?: "sine" | "square" | "sawtooth" | "triangle";
    attackMs?: number;
  },
): void {
  const dur = o.durMs / 1000;
  const attack = (o.attackMs ?? 6) / 1000;
  const osc = ctx.createOscillator();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(o.freq, o.at);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, o.at);
  gain.gain.linearRampToValueAtTime(o.peak, o.at + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, o.at + dur);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(o.at);
  osc.stop(o.at + dur + 0.02);
}

// --- Telegraphs -------------------------------------------------------------

// Low riser: a sawtooth sweeping up under a swelling envelope -- the "something
// is coming" warning before a Director onset.
function telegraphDoom(bus: AudioBus): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(38, t);
  osc.frequency.exponentialRampToValueAtTime(150, t + 1.4);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.32, t + 1.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.7);
  osc.connect(gain);
  gain.connect(bus.sfx);
  osc.start(t);
  osc.stop(t + 1.75);
}

// --- Family stingers --------------------------------------------------------

// Warm major third: a friendly triangle dyad -- an inhabitant settling in.
function inhabitantArrive(bus: AudioBus): void {
  playTone(bus, { freq: 440, durMs: 420, type: "triangle", gainPeak: 0.22, attackMs: 24 });
  playTone(bus, { freq: 554.37, durMs: 480, type: "triangle", gainPeak: 0.18, attackMs: 24 });
}

// Dissonant cluster: three sawtooths a semitone / tritone apart -- a hostile
// Force materialising.
function forceOnset(bus: AudioBus): void {
  playTone(bus, { freq: 300, durMs: 520, type: "sawtooth", gainPeak: 0.16, attackMs: 6 });
  playTone(bus, { freq: 317.5, durMs: 520, type: "sawtooth", gainPeak: 0.15, attackMs: 6 });
  playTone(bus, { freq: 424.3, durMs: 560, type: "sawtooth", gainPeak: 0.14, attackMs: 6 });
}

// Descending alarm: a two-tone klaxon sweeping downward -- an invasion inbound.
function invasionOnset(bus: AudioBus): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  for (let i = 0; i < 3; i++) {
    const at = t + i * 0.22;
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(660, at);
    osc.frequency.exponentialRampToValueAtTime(330, at + 0.18);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.linearRampToValueAtTime(0.16, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.2);
    osc.connect(gain);
    gain.connect(bus.sfx);
    osc.start(at);
    osc.stop(at + 0.22);
  }
}

// Bland corporate UI "ding": a clean, boring two-note sine chime -- the joke,
// deliberately the least interesting sound in the set.
function chromeOnset(bus: AudioBus): void {
  playTone(bus, { freq: 987.77, durMs: 140, type: "sine", gainPeak: 0.16, attackMs: 4 });
  playTone(bus, { freq: 659.25, durMs: 220, type: "sine", gainPeak: 0.14, attackMs: 4 });
}

// --- Creature / interaction cues -------------------------------------------

// Gerald feed: a low satisfied "gulp" -- a sine dropping in pitch with a soft
// noise body.
function geraldFeed(bus: AudioBus): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, t);
  osc.frequency.exponentialRampToValueAtTime(70, t + 0.18);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.24, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(gain);
  gain.connect(bus.sfx);
  osc.start(t);
  osc.stop(t + 0.24);
  playNoise(bus, { durMs: 90, gainPeak: 0.08, filterHz: 700 });
}

// Snake chomp: a fast noise snap with a short pitched click -- a bite.
function snakeChomp(bus: AudioBus): void {
  playNoise(bus, { durMs: 70, gainPeak: 0.22, filterHz: 3200 });
  playTone(bus, { freq: 180, durMs: 60, type: "square", gainPeak: 0.12, attackMs: 1 });
}

// Paper shred: a longer band-limited noise tear.
function paperShred(bus: AudioBus): void {
  playNoise(bus, { durMs: 260, gainPeak: 0.18, filterHz: 5200 });
}

// Parasite wiggle: a barely-audible high tick -- almost subliminal.
function parasiteWiggle(bus: AudioBus): void {
  playTone(bus, { freq: 2100, durMs: 28, type: "sine", gainPeak: 0.02, attackMs: 1 });
}

// --- Progression ------------------------------------------------------------

// Act fanfare: a bright rising four-note triangle figure -- an act cleared.
function actFanfare(bus: AudioBus): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((freq, i) => {
    toneAt(ctx, bus.music, {
      freq,
      at: t + i * 0.12,
      durMs: 220,
      peak: 0.2,
      type: "triangle",
      attackMs: 8,
    });
  });
}

// --- Missile subgame --------------------------------------------------------

// Missile launch: a rising whoosh -- noise plus an upward-sweeping tone.
function missileLaunch(bus: AudioBus): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(720, t + 0.3);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.18, t + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
  osc.connect(gain);
  gain.connect(bus.sfx);
  osc.start(t);
  osc.stop(t + 0.36);
  playNoise(bus, { durMs: 300, gainPeak: 0.1, filterHz: 1800 });
}

// Missile intercept: a sharp metallic clash -- dissonant tone plus bright noise.
function missileIntercept(bus: AudioBus): void {
  playTone(bus, { freq: 1320, durMs: 120, type: "square", gainPeak: 0.16, attackMs: 1 });
  playTone(bus, { freq: 1245, durMs: 140, type: "square", gainPeak: 0.12, attackMs: 1 });
  playNoise(bus, { durMs: 160, gainPeak: 0.2, filterHz: 6000 });
}

// Missile land: a low thud impact.
function missileLand(bus: AudioBus): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
  osc.connect(gain);
  gain.connect(bus.sfx);
  osc.start(t);
  osc.stop(t + 0.4);
  playNoise(bus, { durMs: 220, gainPeak: 0.16, filterHz: 900 });
}

// --- Misc effects -----------------------------------------------------------

// EULA burn: a sustained crackling fire -- filtered noise with a long decay.
function eulaBurn(bus: AudioBus): void {
  playNoise(bus, { durMs: 800, gainPeak: 0.16, filterHz: 3400 });
  playNoise(bus, { durMs: 620, gainPeak: 0.1, filterHz: 1200 });
}

// Knockback: a blunt impact -- low tone drop plus a muffled noise punch.
function knockback(bus: AudioBus): void {
  const { ctx } = bus;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(60, t + 0.16);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(0.26, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(gain);
  gain.connect(bus.sfx);
  osc.start(t);
  osc.stop(t + 0.22);
  playNoise(bus, { durMs: 140, gainPeak: 0.14, filterHz: 600 });
}

// --- Finale -----------------------------------------------------------------

// Victory: a genuinely triumphant four-chord theme (I - V - vi - IV in C),
// scheduled ahead on the music bus so the chords play in sequence, capped by a
// sustained tonic sparkle.
function victory(bus: AudioBus): void {
  const { ctx } = bus;
  const t0 = ctx.currentTime;
  const beat = 0.46;
  const chords: number[][] = [
    [261.63, 329.63, 392.0], // C major
    [392.0, 493.88, 587.33], // G major
    [440.0, 523.25, 659.25], // A minor
    [349.23, 440.0, 523.25], // F major
  ];
  chords.forEach((chord, ci) => {
    const at = t0 + ci * beat;
    chord.forEach((freq) => {
      toneAt(ctx, bus.music, {
        freq,
        at,
        durMs: beat * 1000 * 0.95,
        peak: 0.16,
        type: "triangle",
        attackMs: 12,
      });
    });
  });
  // Final tonic sparkle two octaves up, landing on the last chord.
  const end = t0 + chords.length * beat;
  toneAt(ctx, bus.music, {
    freq: 1046.5,
    at: end,
    durMs: 900,
    peak: 0.14,
    type: "sine",
    attackMs: 10,
  });
  toneAt(ctx, bus.music, {
    freq: 1567.98,
    at: end,
    durMs: 900,
    peak: 0.1,
    type: "sine",
    attackMs: 10,
  });
}

/**
 * Registry of every named cue. Keys are the `sound` effect identifiers the
 * engine emits; the shell drain looks a cue up here and calls it.
 */
export const MOTIFS: Record<string, (bus: AudioBus) => void> = {
  "telegraph-doom": telegraphDoom,
  "inhabitant-arrive": inhabitantArrive,
  "force-onset": forceOnset,
  "invasion-onset": invasionOnset,
  "chrome-onset": chromeOnset,
  "gerald-feed": geraldFeed,
  "snake-chomp": snakeChomp,
  "paper-shred": paperShred,
  "parasite-wiggle": parasiteWiggle,
  "act-fanfare": actFanfare,
  "missile-launch": missileLaunch,
  "missile-intercept": missileIntercept,
  "missile-land": missileLand,
  "eula-burn": eulaBurn,
  knockback,
  victory,
};

/**
 * Play a named cue. No-ops silently when sound is disabled, when there is no
 * browser AudioContext, or when the key is unknown -- unknown keys never throw
 * and never log, so the shell can forward arbitrary engine effect names.
 */
export function playCue(name: string): void {
  if (!isEnabled()) return;
  const cue = MOTIFS[name];
  if (!cue) return;
  const bus = getAudio();
  if (!bus) return;
  try {
    cue(bus);
  } catch {
    // silent-ok: a synthesis failure must never break the render/effect loop.
  }
}
