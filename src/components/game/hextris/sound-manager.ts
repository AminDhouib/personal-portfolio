// ═══════════════════════════════════════════════════════════════
// SOUND — self-contained WebAudio synthesis, no asset files
// ═══════════════════════════════════════════════════════════════

export class HextrisSounds {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private enabled = true;

  // Music state
  private activeTrack: "menu" | "gameplay" | null = null;
  private schedulerTimer: number | null = null;
  private nextNoteTime = 0;
  private currentStep = 0;
  private tempo = 110;
  private static readonly PATTERN_LEN = 64; // 4 bars × 16 sixteenth-notes
  // i - VI - VII - i chord progression in A minor (Am - F - G - Am).
  // Each entry gives the sub-bass octave, bass root, and triad third/fifth
  // for the bar so we can build bass lines + lead lines with harmonic shape.
  private static readonly CHORD_PROGRESSION = [
    { sub: 55, root: 110, third: 130.81, fifth: 164.81 }, // Am (A2, A2, C3, E3)
    { sub: 43.65, root: 87.31, third: 110, fifth: 130.81 }, // F  (F1, F2, A2, C3)
    { sub: 49, root: 98, third: 123.47, fifth: 146.83 }, // G  (G1, G2, B2, D3)
    { sub: 55, root: 110, third: 130.81, fifth: 164.81 }, // Am return
  ];

  setEnabled(v: boolean) {
    this.enabled = v;
    if (this.sfxGain) this.sfxGain.gain.value = v ? 0.55 : 0;
    if (this.musicGain) this.musicGain.gain.value = v ? 0.22 : 0;
  }

  resume() {
    this.ensureCtx();
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  private ensureCtx() {
    if (this.ctx) return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.enabled ? 0.55 : 0;
      this.sfxGain.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.enabled ? 0.22 : 0;
      this.musicGain.connect(this.ctx.destination);
    } catch {
      /* no audio available */
    }
  }

  // ─── SFX ────────────────────────────────────────────────

  private playTone(freq: number, durationMs: number, type: OscillatorType = "sine", gain = 0.25) {
    if (!this.enabled) return;
    this.ensureCtx();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
    osc.connect(env).connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + durationMs / 1000 + 0.02);
  }

  rotate() {
    this.playTone(260, 50, "triangle", 0.12);
  }

  settle() {
    this.playTone(880, 90, "sine", 0.15);
  }

  match(comboLevel: number) {
    // Each combo level raises the pitch by ~1 semitone (×1.06), so even combo
    // 30 has a unique tone. Capped high enough to stay satisfying.
    const steps = Math.min(comboLevel, 36);
    const base = 440 * Math.pow(1.06, steps);
    this.playTone(base, 140, "sine", 0.22);
    this.playTone(base * 1.5, 180, "sine", 0.12);
  }

  combo(n: number) {
    const steps = Math.min(n, 36);
    const base = 660 * Math.pow(1.06, steps);
    this.playTone(base, 80, "triangle", 0.18);
  }

  cleanSweep() {
    if (!this.enabled) return;
    this.ensureCtx();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    // Ascending C major arpeggio + octave shimmer — triumphant fanfare.
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const env = this.ctx!.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const start = now + i * 0.08;
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.22, start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(env).connect(this.sfxGain!);
      osc.start(start);
      osc.stop(start + 0.5);
    });
    // Low-octave shimmer pad for richness.
    const pad = this.ctx.createOscillator();
    const padEnv = this.ctx.createGain();
    pad.type = "sine";
    pad.frequency.value = 261.63;
    padEnv.gain.setValueAtTime(0, now);
    padEnv.gain.linearRampToValueAtTime(0.1, now + 0.05);
    padEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    pad.connect(padEnv).connect(this.sfxGain);
    pad.start(now);
    pad.stop(now + 0.95);
  }

  gameOver() {
    if (!this.enabled) return;
    this.ensureCtx();
    if (!this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    [440, 330, 220].forEach((f, i) => {
      const osc = this.ctx!.createOscillator();
      const env = this.ctx!.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      const start = now + i * 0.12;
      env.gain.setValueAtTime(0, start);
      env.gain.linearRampToValueAtTime(0.18, start + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.connect(env).connect(this.sfxGain!);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  }

  // ─── MUSIC ──────────────────────────────────────────────

  startMenuMusic() {
    if (this.activeTrack === "menu") return;
    this.stopMusic();
    this.ensureCtx();
    if (!this.ctx) return;
    this.activeTrack = "menu";
    this.tempo = 72;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.runScheduler();
  }

  startGameplayMusic() {
    if (this.activeTrack === "gameplay") return;
    this.stopMusic();
    this.ensureCtx();
    if (!this.ctx) return;
    this.activeTrack = "gameplay";
    this.tempo = 110;
    this.currentStep = 0;
    this.nextNoteTime = this.ctx.currentTime + 0.1;
    this.runScheduler();
  }

  stopMusic() {
    this.activeTrack = null;
    if (this.schedulerTimer !== null) {
      window.clearTimeout(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  destroy() {
    this.stopMusic();
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {
        /* ignore */
      }
      this.ctx = null;
    }
  }

  setMusicTempo(bpm: number) {
    this.tempo = Math.max(60, Math.min(240, bpm));
  }

  /** Separate death jingle — slow descending minor fall with a low thud. */
  playGameOverMusic() {
    this.stopMusic();
    this.ensureCtx();
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const g = this.musicGain;
    const now = ctx.currentTime;
    // Descending A minor arpeggio: A3 F3 D3 A2
    const notes = [220, 174.61, 146.83, 110];
    notes.forEach((f, i) => {
      const time = now + i * 0.22;
      // Lead (saw)
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.value = f;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.2, time + 0.01);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
      osc.connect(env).connect(g);
      osc.start(time);
      osc.stop(time + 0.52);
      // Sub (sine octave below)
      const sub = ctx.createOscillator();
      const subEnv = ctx.createGain();
      sub.type = "sine";
      sub.frequency.value = f / 2;
      subEnv.gain.setValueAtTime(0, time);
      subEnv.gain.linearRampToValueAtTime(0.28, time + 0.02);
      subEnv.gain.exponentialRampToValueAtTime(0.0001, time + 0.6);
      sub.connect(subEnv).connect(g);
      sub.start(time);
      sub.stop(time + 0.62);
    });
    // Final low thud
    const thudTime = now + notes.length * 0.22 + 0.1;
    const thud = ctx.createOscillator();
    const thudEnv = ctx.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(80, thudTime);
    thud.frequency.exponentialRampToValueAtTime(30, thudTime + 0.7);
    thudEnv.gain.setValueAtTime(0.35, thudTime);
    thudEnv.gain.exponentialRampToValueAtTime(0.0001, thudTime + 0.9);
    thud.connect(thudEnv).connect(g);
    thud.start(thudTime);
    thud.stop(thudTime + 0.92);
  }

  // Look-ahead scheduler — schedules ahead of the audio clock to avoid drift.
  private runScheduler = () => {
    if (!this.ctx || this.activeTrack === null) return;
    const scheduleAhead = 0.12;
    while (this.nextNoteTime < this.ctx.currentTime + scheduleAhead) {
      this.scheduleStepAt(this.currentStep, this.nextNoteTime);
      const secondsPer16th = 60 / this.tempo / 4;
      this.nextNoteTime += secondsPer16th;
      this.currentStep = (this.currentStep + 1) % HextrisSounds.PATTERN_LEN;
    }
    this.schedulerTimer = window.setTimeout(this.runScheduler, 25);
  };

  private scheduleStepAt(step: number, time: number) {
    if (this.activeTrack === "menu") this.scheduleMenu(step, time);
    else if (this.activeTrack === "gameplay") this.scheduleGameplay(step, time);
  }

  // Menu: slow A-minor pad with sparse triangle arpeggio above
  private scheduleMenu(step: number, time: number) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const g = this.musicGain;

    // Pad every 16 steps (1 bar)
    if (step % 16 === 0) {
      const dur = (16 * 60) / this.tempo / 4;
      [220, 261.63, 329.63].forEach((f) => {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = f;
        env.gain.setValueAtTime(0, time);
        env.gain.linearRampToValueAtTime(0.07, time + 0.6);
        env.gain.setValueAtTime(0.07, time + dur * 0.7);
        env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
        osc.connect(env).connect(g);
        osc.start(time);
        osc.stop(time + dur + 0.02);
      });
    }

    // Sparse arp on quarter notes
    const arp = [440, 523.25, 659.25, 523.25, 440, 523.25, 659.25, 784];
    if (step % 4 === 0) {
      const note = arp[(step / 4) % arp.length];
      const osc = ctx.createOscillator();
      const env = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = note;
      env.gain.setValueAtTime(0, time);
      env.gain.linearRampToValueAtTime(0.09, time + 0.008);
      env.gain.exponentialRampToValueAtTime(0.0001, time + 0.4);
      osc.connect(env).connect(g);
      osc.start(time);
      osc.stop(time + 0.42);
    }
  }

  // Gameplay: 4-bar progression. Each bar has a chord; bass walks through
  // root/fifth/sub-octave, lead outlines the chord tones.
  private scheduleGameplay(step: number, time: number) {
    if (!this.ctx || !this.musicGain) return;

    const bar = Math.floor(step / 16);
    const inBar = step % 16;
    const chord = HextrisSounds.CHORD_PROGRESSION[bar];

    // Bass rhythm per bar. 1 = play root, 2 = play fifth (adds motion).
    const bassPatterns = [
      // Bar 1 Am — anchor bar
      [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 2, 0, 0, 0, 1, 0],
      // Bar 2 F — darker
      [1, 0, 0, 1, 0, 0, 2, 0, 1, 0, 0, 0, 1, 0, 2, 0],
      // Bar 3 G — lift
      [1, 0, 2, 0, 0, 1, 0, 0, 1, 0, 0, 2, 0, 0, 1, 0],
      // Bar 4 Am — resolve with walk-down fill
      [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 2, 0, 1, 1, 0, 1],
    ];
    const b = bassPatterns[bar][inBar];
    if (b > 0) {
      const freq = b === 2 ? chord.fifth : chord.root;
      this.playMusicNote(freq, time, 0.16, "square", 0.12);
      this.playMusicNote(chord.sub, time, 0.12, "sine", 0.08);
    }

    // Kick on beats 1 & 3 of every bar
    if (inBar === 0 || inBar === 8) {
      this.playMusicKick(time);
    }

    // Closed hat on every off-beat 16th
    if (inBar % 2 === 1) {
      this.playMusicHat(time, 0.04);
    }
    // Open hat on 'and' of beat 2/4
    if (inBar === 6 || inBar === 14) {
      this.playMusicHat(time, 0.08);
    }

    // Lead melody per bar — outline chord tones with pentatonic fills.
    // Frequencies: E4=329.63 G4=392 A4=440 B4=493.88 C5=523.25 D5=587.33
    //              E5=659.25 F5=698.46 G5=784
    const leadPatterns = [
      // Bar 1 Am: A – C – E noodle
      [0, 0, 440, 0, 523.25, 0, 0, 587.33, 0, 659.25, 0, 587.33, 523.25, 0, 440, 0],
      // Bar 2 F: F – A – C with C as peak
      [0, 0, 523.25, 0, 440, 0, 0, 349.23, 0, 440, 0, 523.25, 440, 0, 349.23, 0],
      // Bar 3 G: G – B – D climb
      [0, 0, 493.88, 0, 587.33, 0, 0, 392, 0, 493.88, 0, 587.33, 493.88, 0, 392, 0],
      // Bar 4 Am: A – C – E climax + E4 resolve
      [0, 0, 523.25, 0, 659.25, 0, 0, 784, 0, 659.25, 0, 587.33, 523.25, 0, 440, 329.63],
    ];
    const lead = leadPatterns[bar][inBar];
    if (lead > 0) {
      this.playMusicNote(lead, time, 0.11, "triangle", 0.07);
    }

    // Drum fill on the last half-beat of the loop (bar 4, last 2 steps)
    if (step === 62 || step === 63) {
      this.playMusicHat(time, 0.03);
    }
  }

  private playMusicNote(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    gain: number,
  ) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(gain, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(env).connect(this.musicGain);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  private playMusicKick(time: number) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(38, time + 0.1);
    env.gain.setValueAtTime(0.22, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + 0.2);
    osc.connect(env).connect(this.musicGain);
    osc.start(time);
    osc.stop(time + 0.22);
  }

  private playMusicHat(time: number, dur: number) {
    if (!this.ctx || !this.musicGain) return;
    const ctx = this.ctx;
    const bufSize = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 8000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.05, time);
    env.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filter).connect(env).connect(this.musicGain);
    src.start(time);
    src.stop(time + dur + 0.01);
  }
}
