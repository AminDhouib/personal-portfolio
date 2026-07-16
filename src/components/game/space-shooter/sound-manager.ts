export type SoundType =
  "laser" | "boom" | "chime" | "crash" | "shieldOn" | "shieldOff" | "warp" | "purchase";

export class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private sfxEnabled = true;
  private musicEnabled = true;
  // Master bus: everything routes through one DynamicsCompressor configured as
  // a limiter, so simultaneous explosions/music/warp can't sum past 1.0 into
  // hard clipping. Music additionally passes through duckBus, which explosion
  // hits momentarily dip (sidechain-style pump).
  private masterBus: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private duckBus: GainNode | null = null;
  // Shared feedback-delay "space echo" send — explosions tap into it for a
  // cavernous tail without per-shot reverb nodes.
  private echoSend: GainNode | null = null;
  private lastPlay: Record<SoundType, number> = {
    laser: 0,
    boom: 0,
    chime: 0,
    crash: 0,
    shieldOn: 0,
    shieldOff: 0,
    warp: 0,
    purchase: 0,
  };
  // Per-type minimum ms between plays. Laser fires constantly; chime/boom can
  // burst many times per frame (multi-coin pickups, cluster kills) and would
  // stack toward the limiter without a floor.
  private static THROTTLE_MS: Partial<Record<SoundType, number>> = {
    laser: 70,
    chime: 45,
    boom: 45,
  };
  // The track that SHOULD be playing right now, kept even while music or all
  // sound is toggled off so re-enabling can resume it (previously toggling
  // music back on stayed silent until the next natural track change).
  private desiredTrack: "gameplay" | "leaderboard" | null = null;
  // Sustained warp whoosh that loops while warp power-up is active
  private warpLoop: {
    src: AudioBufferSourceNode;
    gain: GainNode;
    lfo?: OscillatorNode;
    lfoGain?: GainNode;
  } | null = null;
  // Music subsystem — only one track at a time, with crossfades.
  private music: {
    track: "gameplay" | "leaderboard";
    masterGain: GainNode;
    interval: ReturnType<typeof setInterval>;
    step: number;
  } | null = null;

  setEnabled(v: boolean) {
    this.enabled = v;
    if (v) {
      this.ensure();
      this.resumeDesiredTrack();
    } else {
      this.stopWarpLoop();
      this.stopMusicNodes(0);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    try {
      const Ctor =
        window.AudioContext ||
        (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.buildBuses(this.ctx);
    } catch {
      // silent-ok: best-effort AudioContext construction; a blocked/unsupported AudioContext must not break the render loop
      this.ctx = null;
    }
  }

  // One-time bus graph: [sfx] -> sfxBus \
  //                     [music] -> duckBus -> masterBus(limiter) -> destination
  //                     [echo tap] -> echoSend -> delay loop -> masterBus
  private buildBuses(ctx: AudioContext) {
    const master = ctx.createDynamicsCompressor();
    master.threshold.value = -8;
    master.knee.value = 6;
    master.ratio.value = 14;
    master.attack.value = 0.002;
    master.release.value = 0.24;
    master.connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.connect(master);
    const duck = ctx.createGain();
    duck.connect(master);
    const send = ctx.createGain();
    send.gain.value = 0.9;
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.19;
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 1100;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.34;
    send.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay);
    const echoOut = ctx.createGain();
    echoOut.gain.value = 0.5;
    damp.connect(echoOut);
    echoOut.connect(master);
    this.masterBus = master;
    this.sfxBus = sfx;
    this.duckBus = duck;
    this.echoSend = send;
  }

  // Destination for one-shot SFX. Falls back to the raw destination if the
  // bus graph failed to build (never in practice; keeps the ! away).
  private sfxOut(): AudioNode {
    return this.sfxBus ?? this.ctx!.destination;
  }

  // Sidechain-style pump: dip the music bus for a beat when a big transient
  // (explosion / crash / boss pulse) lands, so it punches through the mix.
  private duckMusic(depth = 0.35, holdSec = 0.09) {
    if (!this.ctx || !this.duckBus) return;
    const t = this.ctx.currentTime;
    const g = this.duckBus.gain;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(depth, t, 0.015);
    g.setTargetAtTime(1, t + holdSec, 0.22);
  }

  setSfxEnabled(v: boolean) {
    this.sfxEnabled = v;
  }
  setMusicEnabled(v: boolean) {
    this.musicEnabled = v;
    if (!v) this.stopMusicNodes(0.2);
    else this.resumeDesiredTrack();
  }

  // Restart whichever track should be playing after music/sound was re-enabled.
  private resumeDesiredTrack() {
    if (!this.enabled || !this.musicEnabled) return;
    if (this.desiredTrack === "gameplay") this.startGameplayMusic();
    else if (this.desiredTrack === "leaderboard") this.startLeaderboardMusic();
  }

  play(type: SoundType) {
    if (!this.enabled || !this.sfxEnabled) return;
    this.ensure();
    if (!this.ctx) return;
    // Per-type throttle so rapid-fire / burst pickups don't stack into the limiter
    const now = performance.now();
    const throttle = SoundManager.THROTTLE_MS[type] ?? 0;
    if (throttle > 0 && now - this.lastPlay[type] < throttle) return;
    this.lastPlay[type] = now;
    switch (type) {
      case "laser":
        this.playLaser();
        break;
      case "boom":
        this.playBoom();
        break;
      case "chime":
        this.playChime();
        break;
      case "crash":
        this.playCrash();
        break;
      case "shieldOn":
        this.playShieldOn();
        break;
      case "shieldOff":
        this.playShieldOff();
        break;
      case "warp":
        this.playWarp();
        break;
      case "purchase":
        this.playPurchase();
        break;
    }
  }

  // Cash-register / coin-drop for shop purchases. Bright triplet chime with
  // a coin "tink" click on top — reads clearly as money-spent feedback.
  private playPurchase() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const notes = [880, 1174.66, 1567.98]; // A5, D6, G6 — bright rising major
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = f;
      const at = t + i * 0.055;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.1, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      osc.connect(gain).connect(this.sfxOut());
      osc.start(at);
      osc.stop(at + 0.24);
    });
    // Coin "tink" click at the end — short filtered noise burst
    const noiseDur = 0.06;
    const buf = ctx.createBuffer(1, ctx.sampleRate * noiseDur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / data.length) * 18);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 4800;
    filt.Q.value = 12;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.12, t + 0.18);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    src.connect(filt).connect(clickGain).connect(this.sfxOut());
    src.start(t + 0.18);
  }

  // Biome-change sting — short drum fill + whoosh so the player hears the
  // transition. Called from runTick when the biome flips.
  biomeTransition() {
    // Gate on SFX, not music: this is a gameplay cue, and "music off, SFX on"
    // players must still hear the biome flip.
    if (!this.enabled || !this.sfxEnabled) return;
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // Whoosh: filtered noise sweeping low→high for 0.35s
    const dur = 0.35;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.Q.value = 3;
    filt.frequency.setValueAtTime(200, t);
    filt.frequency.exponentialRampToValueAtTime(4000, t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.18, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(gn).connect(this.sfxOut());
    src.start(t);
    // Snare roll: 4 quick noise bursts accelerating into a final accent
    for (let i = 0; i < 5; i++) {
      const st = t + 0.05 + i * 0.06;
      const sd = 0.06;
      const sb = ctx.createBuffer(1, ctx.sampleRate * sd, ctx.sampleRate);
      const sdata = sb.getChannelData(0);
      for (let k = 0; k < sdata.length; k++)
        sdata[k] = (Math.random() - 0.5) * 2 * Math.exp((-k / sdata.length) * 10);
      const ss = ctx.createBufferSource();
      ss.buffer = sb;
      const sf = ctx.createBiquadFilter();
      sf.type = "highpass";
      sf.frequency.value = 2200;
      const sg = ctx.createGain();
      sg.gain.setValueAtTime(i === 4 ? 0.35 : 0.14, st);
      sg.gain.exponentialRampToValueAtTime(0.001, st + sd);
      ss.connect(sf).connect(sg).connect(this.sfxOut());
      ss.start(st);
    }
  }

  // Boss pulse — tier-aware percussion layer stacked on top of gameplay music.
  // Driven from runTick on a ~700ms cadence. Higher-tier bosses get richer
  // stacks: low triangle → + tom → + saw-bass stab → + snare crack.
  bossPulse(tier = 1) {
    // Gate on SFX, not music: the pulse telegraphs boss attacks, so it must
    // survive a music-off mix.
    if (!this.enabled || !this.sfxEnabled) return;
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.duckMusic(0.55, 0.06);
    // Layer 1 (all tiers): low triangle thump, pitch scales with tier
    const baseFreq = 44 + tier * 2.5; // 46.5 → 64 Hz across T1-T8
    const o1 = ctx.createOscillator();
    const g1 = ctx.createGain();
    o1.type = "triangle";
    o1.frequency.setValueAtTime(baseFreq, t);
    g1.gain.setValueAtTime(0.0, t);
    g1.gain.linearRampToValueAtTime(0.22, t + 0.02);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o1.connect(g1).connect(this.sfxOut());
    o1.start(t);
    o1.stop(t + 0.45);
    // Layer 2 (tier 3+): tom hit — descending sine with short envelope
    if (tier >= 3) {
      const o2 = ctx.createOscillator();
      const g2 = ctx.createGain();
      o2.type = "sine";
      o2.frequency.setValueAtTime(160, t);
      o2.frequency.exponentialRampToValueAtTime(80, t + 0.15);
      g2.gain.setValueAtTime(0.24, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o2.connect(g2).connect(this.sfxOut());
      o2.start(t);
      o2.stop(t + 0.2);
    }
    // Layer 3 (tier 5+): sawtooth bass stab — "heavy machinery" drone
    if (tier >= 5) {
      const o3 = ctx.createOscillator();
      const f3 = ctx.createBiquadFilter();
      const g3 = ctx.createGain();
      o3.type = "sawtooth";
      o3.frequency.value = 55 + tier * 2;
      f3.type = "lowpass";
      f3.frequency.setValueAtTime(200, t);
      f3.frequency.exponentialRampToValueAtTime(800, t + 0.08);
      g3.gain.setValueAtTime(0.18, t);
      g3.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o3.connect(f3).connect(g3).connect(this.sfxOut());
      o3.start(t);
      o3.stop(t + 0.28);
    }
    // Layer 4 (tier 7+): snare crack — highpass noise burst on top
    if (tier >= 7) {
      const dur = 0.1;
      const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / data.length) * 12);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filt = ctx.createBiquadFilter();
      filt.type = "highpass";
      filt.frequency.value = 2000;
      const gg = ctx.createGain();
      gg.gain.setValueAtTime(0.3, t);
      gg.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      src.connect(filt).connect(gg).connect(this.sfxOut());
      src.start(t);
    }
  }

  // Laser pulse. Kept quiet (it fires constantly) but layered so it reads as
  // a weapon, not a beep: detuned sine pair for width + a 15ms highpassed
  // noise click as the attack transient.
  private playLaser() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    for (const detune of [1, 1.0046]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(720 * detune, t);
      osc.frequency.exponentialRampToValueAtTime(420 * detune, t + 0.06);
      gain.gain.setValueAtTime(0.018, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      osc.connect(gain).connect(this.sfxOut());
      osc.start(t);
      osc.stop(t + 0.08);
    }
    const clickDur = 0.015;
    const buf = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * clickDur), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / data.length) * 6);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "highpass";
    filt.frequency.value = 2600;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.05, t);
    clickGain.gain.exponentialRampToValueAtTime(0.001, t + clickDur);
    src.connect(filt).connect(clickGain).connect(this.sfxOut());
    src.start(t);
  }

  // Meteor explosion — three layers stacked for body + crunch + rumble:
  //  1. Sharp filtered-noise crack (the initial hit, lasts ~0.15s)
  //  2. Pitched-down sub-bass thump (the deep body, ~0.35s)
  //  3. Long rumbling debris tail (low-passed noise, ~0.7s) so the explosion
  //     decays into space rather than ending abruptly.
  private playBoom() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.duckMusic(0.4, 0.08);

    // Layer 1: sharp noise crack
    const crackDur = 0.15;
    const crackBuf = ctx.createBuffer(1, ctx.sampleRate * crackDur, ctx.sampleRate);
    const crackData = crackBuf.getChannelData(0);
    for (let i = 0; i < crackData.length; i++) {
      const env = Math.exp((-i / crackData.length) * 8);
      crackData[i] = (Math.random() - 0.5) * 2 * env;
    }
    const crackSrc = ctx.createBufferSource();
    crackSrc.buffer = crackBuf;
    const crackFilt = ctx.createBiquadFilter();
    crackFilt.type = "highpass";
    crackFilt.frequency.value = 1500;
    const crackGain = ctx.createGain();
    crackGain.gain.setValueAtTime(0.1, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDur);
    crackSrc.connect(crackFilt).connect(crackGain).connect(this.sfxOut());
    crackSrc.start(t);

    // Layer 2: deep sub-bass thump (the "thoom" of the meteor)
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.4);
    subGain.gain.setValueAtTime(0.18, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    sub.connect(subGain).connect(this.sfxOut());
    sub.start(t);
    sub.stop(t + 0.5);

    // Layer 3: long low-passed rumble tail (debris falling apart)
    const tailDur = 0.75;
    const tailBuf = ctx.createBuffer(1, ctx.sampleRate * tailDur, ctx.sampleRate);
    const tailData = tailBuf.getChannelData(0);
    for (let i = 0; i < tailData.length; i++) {
      const env = Math.exp((-i / tailData.length) * 3);
      const grit = Math.sin(i * 0.012) * 0.3;
      tailData[i] = ((Math.random() - 0.5) * 2 + grit) * env;
    }
    const tailSrc = ctx.createBufferSource();
    tailSrc.buffer = tailBuf;
    const tailFilt = ctx.createBiquadFilter();
    tailFilt.type = "lowpass";
    tailFilt.frequency.setValueAtTime(700, t);
    tailFilt.frequency.exponentialRampToValueAtTime(80, t + tailDur);
    const tailGain = ctx.createGain();
    tailGain.gain.setValueAtTime(0.15, t + 0.05);
    tailGain.gain.exponentialRampToValueAtTime(0.001, t + tailDur);
    tailSrc.connect(tailFilt).connect(tailGain).connect(this.sfxOut());
    tailSrc.start(t);
    // Space-echo send: the rumble tail feeds the shared feedback delay so the
    // explosion decays into a cavernous repeat instead of stopping dry.
    if (this.echoSend) {
      const tap = ctx.createGain();
      tap.gain.value = 0.35;
      tailGain.connect(tap).connect(this.echoSend);
    }
  }

  private playChime() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const freqs = [659.25, 987.77]; // E5 + B5
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(f, t);
      gain.gain.setValueAtTime(0.07, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain).connect(this.sfxOut());
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  private playCrash() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    this.duckMusic(0.25, 0.15);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 1.0, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / data.length) * 4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass";
    filt.frequency.setValueAtTime(700, t);
    filt.frequency.exponentialRampToValueAtTime(80, t + 0.8);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1);
    src.connect(filt).connect(gain).connect(this.sfxOut());
    src.start(t);
    // Ship death gets the biggest echo tail of all.
    if (this.echoSend) {
      const tap = ctx.createGain();
      tap.gain.value = 0.5;
      gain.connect(tap).connect(this.echoSend);
    }
  }

  // Rising sweep — shield activating
  private playShieldOn() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.35);
    gain.gain.setValueAtTime(0.06, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(this.sfxOut());
    osc.start(t);
    osc.stop(t + 0.42);
  }

  // Falling sweep — shield depleting
  private playShieldOff() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.35);
    gain.gain.setValueAtTime(0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(this.sfxOut());
    osc.start(t);
    osc.stop(t + 0.42);
  }

  // Warp jump — sharp transient swoosh on activation
  private playWarp() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const dur = 0.55;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / data.length) * 3);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.Q.setValueAtTime(8, t);
    filt.frequency.setValueAtTime(200, t);
    filt.frequency.exponentialRampToValueAtTime(3000, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filt).connect(gain).connect(this.sfxOut());
    src.start(t);
  }

  // Looping wind-rushing whoosh that plays for the duration of the warp.
  // Multi-band: a high screaming whistle layered over deep low-pass roar to
  // really sell the speed.
  startWarpLoop() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    this.stopWarpLoop();
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = 1.0;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() - 0.5) * 2;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    // High whistle band — gives the "screaming through space" character
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.Q.setValueAtTime(4, t);
    filt.frequency.setValueAtTime(2800, t);
    // LFO wobbles the bandpass center to create a "rushing" tonality
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 7;
    lfoGain.gain.value = 1100;
    lfo.connect(lfoGain).connect(filt.frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.12);
    src.connect(filt).connect(gain).connect(this.sfxOut());
    src.start(t);
    lfo.start(t);
    this.warpLoop = { src, gain, lfo, lfoGain };
  }

  stopWarpLoop() {
    if (!this.warpLoop || !this.ctx) return;
    const { src, gain, lfo } = this.warpLoop;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.18);
    setTimeout(() => {
      try {
        src.stop();
      } catch {
        // silent-ok: stopping an AudioBufferSourceNode that already finished/stopped throws; cleanup proceeds regardless
      }
      try {
        lfo?.stop();
      } catch {
        // silent-ok: stopping an OscillatorNode that already finished/stopped throws; cleanup proceeds regardless
      }
    }, 220);
    this.warpLoop = null;
  }

  // -------- Music (procedurally generated, no asset files) --------
  // Multi-section sequencer with space-themed texture layers:
  //  - Lead melody with detuned shimmer (chorus effect)
  //  - Bass pulse
  //  - Continuous low drone pad (spaceship engine room hum)
  //  - Periodic scanner pings, radio crackle bursts, deep-space rumbles
  // Melodies use rests (0 = silent step), wider intervals, and distinctive
  // motifs so the soundtrack is recognizable rather than generic arpeggios.

  // Synthwave progression in A minor. Each section is a chord region; the arp
  // runs continuous 16th-notes through the chord tones (the "fast travel" pulse)
  // while the lead plays sparse spacey melodic phrases on top. 0 = rest.
  private static GAMEPLAY_SECTIONS: {
    lead: number[];
    arp: number[];
    bass: number[];
    leadType: OscillatorType;
  }[] = [
    // "Hyperdrive" — Am, establish pulse
    {
      lead: [440, 0, 659.25, 880, 0, 659.25, 0, 440],
      arp: [440, 659.25, 880, 1318.5, 880, 659.25, 523.25, 329.63],
      bass: [55, 55, 55, 55, 55, 55, 55, 55],
      leadType: "sawtooth",
    },
    // "Event Horizon" — F
    {
      lead: [349.23, 0, 523.25, 698.46, 0, 523.25, 0, 349.23],
      arp: [349.23, 523.25, 698.46, 1046.5, 698.46, 523.25, 440, 261.63],
      bass: [43.65, 43.65, 43.65, 43.65, 43.65, 43.65, 43.65, 43.65],
      leadType: "sawtooth",
    },
    // "Wormhole" — G
    {
      lead: [392, 0, 587.33, 784, 0, 587.33, 0, 392],
      arp: [392, 587.33, 784, 1174.66, 784, 587.33, 493.88, 293.66],
      bass: [49, 49, 49, 49, 49, 49, 49, 49],
      leadType: "sawtooth",
    },
    // "Gravity Well" — Em
    {
      lead: [329.63, 0, 493.88, 659.25, 0, 493.88, 0, 329.63],
      arp: [329.63, 493.88, 659.25, 987.77, 659.25, 493.88, 392, 246.94],
      bass: [41.2, 41.2, 41.2, 41.2, 41.2, 41.2, 41.2, 41.2],
      leadType: "sawtooth",
    },
    // "Starfield Rush" — C, bright major uplift
    {
      lead: [523.25, 0, 784, 1046.5, 0, 784, 0, 523.25],
      arp: [523.25, 659.25, 784, 1046.5, 784, 659.25, 523.25, 392],
      bass: [32.7, 32.7, 32.7, 32.7, 32.7, 32.7, 32.7, 32.7],
      leadType: "sawtooth",
    },
    // "Reentry" — Dm
    {
      lead: [293.66, 0, 440, 587.33, 0, 440, 0, 293.66],
      arp: [293.66, 440, 587.33, 880, 587.33, 440, 349.23, 220],
      bass: [36.71, 36.71, 36.71, 36.71, 36.71, 36.71, 36.71, 36.71],
      leadType: "sawtooth",
    },
    // "Pulsar" — Am climax, lead octave up
    {
      lead: [880, 0, 1318.5, 1760, 0, 1318.5, 0, 880],
      arp: [880, 1046.5, 1318.5, 1760, 1318.5, 1046.5, 880, 659.25],
      bass: [55, 55, 65.41, 65.41, 73.42, 73.42, 82.41, 82.41],
      leadType: "sawtooth",
    },
    // "Afterburner" — G → Am resolve
    {
      lead: [392, 440, 587.33, 659.25, 784, 880, 1318.5, 880],
      arp: [440, 523.25, 659.25, 880, 659.25, 523.25, 440, 329.63],
      bass: [49, 49, 49, 49, 55, 55, 55, 55],
      leadType: "sawtooth",
    },
  ];

  private static LEADERBOARD_SECTIONS: {
    lead: number[];
    arp: number[];
    bass: number[];
    leadType: OscillatorType;
  }[] = [
    // "Aftermath" — Am, slow synth pad
    {
      lead: [440, 0, 0, 659.25, 0, 523.25, 0, 440],
      arp: [440, 659.25, 880, 659.25, 0, 523.25, 440, 329.63],
      bass: [55, 55, 55, 55, 55, 55, 55, 55],
      leadType: "sawtooth",
    },
    // "Memory" — F
    {
      lead: [349.23, 0, 0, 523.25, 0, 440, 0, 349.23],
      arp: [349.23, 523.25, 698.46, 523.25, 0, 440, 349.23, 261.63],
      bass: [43.65, 43.65, 43.65, 43.65, 43.65, 43.65, 43.65, 43.65],
      leadType: "sawtooth",
    },
    // "Stars" — C, bright hopeful
    {
      lead: [523.25, 0, 0, 784, 0, 659.25, 0, 523.25],
      arp: [523.25, 659.25, 784, 659.25, 0, 523.25, 392, 261.63],
      bass: [32.7, 32.7, 32.7, 32.7, 32.7, 32.7, 32.7, 32.7],
      leadType: "sawtooth",
    },
    // "Home" — G → Am resolve
    {
      lead: [392, 0, 440, 0, 523.25, 0, 659.25, 440],
      arp: [392, 493.88, 587.33, 784, 587.33, 493.88, 392, 293.66],
      bass: [49, 49, 49, 49, 55, 55, 55, 55],
      leadType: "sawtooth",
    },
  ];

  // Shared soft-clip curve for the bass drive (built once, reused per note).
  private static driveCurveCache: Float32Array<ArrayBuffer> | null = null;
  private static driveCurve(): Float32Array<ArrayBuffer> {
    if (!SoundManager.driveCurveCache) {
      const n = 256;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 1.8);
      }
      SoundManager.driveCurveCache = curve;
    }
    return SoundManager.driveCurveCache;
  }

  // Drone pad node — a sustained low hum under the music
  private dronePad: {
    osc1: OscillatorNode;
    osc2: OscillatorNode;
    lfo: OscillatorNode;
    gain: GainNode;
  } | null = null;

  startGameplayMusic() {
    this.desiredTrack = "gameplay";
    if (!this.musicEnabled) return;
    this.startMusicLoop("gameplay", {
      bpm: 128,
      sections: SoundManager.GAMEPLAY_SECTIONS,
      stepsPerSection: 16,
      masterTarget: 0.085,
      drums: true,
      arp: true,
    });
  }

  startLeaderboardMusic() {
    this.desiredTrack = "leaderboard";
    if (!this.musicEnabled) return;
    this.startMusicLoop("leaderboard", {
      bpm: 92,
      sections: SoundManager.LEADERBOARD_SECTIONS,
      stepsPerSection: 16,
      masterTarget: 0.09,
      arp: true,
    });
  }

  private startDronePad(masterGain: GainNode) {
    this.stopDronePad();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 2);
    gain.connect(masterGain);
    // Two slightly detuned sines at ~55Hz — creates a warm "ship engine" hum
    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.value = 55;
    osc1.connect(gain);
    osc1.start(t);
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 55.8; // ~25 cents sharp → slow beating chorus
    osc2.connect(gain);
    osc2.start(t);
    // Slow LFO vibrato so the drone breathes
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.15; // very slow
    lfoGain.gain.value = 3;
    lfo.connect(lfoGain).connect(osc1.frequency);
    lfo.start(t);
    this.dronePad = { osc1, osc2, lfo, gain };
  }

  private stopDronePad() {
    if (!this.dronePad || !this.ctx) return;
    const { osc1, osc2, lfo, gain } = this.dronePad;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.5);
    setTimeout(() => {
      try {
        osc1.stop();
      } catch {
        // silent-ok: stopping the drone-pad oscillator after it already finished/stopped throws; cleanup proceeds regardless
      }
      try {
        osc2.stop();
      } catch {
        // silent-ok: stopping the drone-pad detuned oscillator after it already finished/stopped throws; cleanup proceeds regardless
      }
      try {
        lfo.stop();
      } catch {
        // silent-ok: stopping the drone-pad vibrato LFO after it already finished/stopped throws; cleanup proceeds regardless
      }
    }, 600);
    this.dronePad = null;
  }

  // Space texture one-shots triggered periodically inside the sequencer.
  private playScannerPing(dest: AudioNode, at?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(1800, t + 0.12);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  private playRadioCrackle(dest: AudioNode, at?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime;
    const dur = 0.18;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / data.length) * 5);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = "bandpass";
    filt.frequency.value = 3500;
    filt.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, t);
    src.connect(filt).connect(gain).connect(dest);
    src.start(t);
  }

  // Star whoosh — high-to-mid falling saw glide through a bandpass. The
  // sound of a star flying past the cockpit. Used mid-section to reinforce
  // the "fast travel" sensation without stepping on the musical groove.
  private playStarWhoosh(dest: AudioNode, at?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filt = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(4200, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.42);
    filt.type = "bandpass";
    filt.Q.value = 8;
    filt.frequency.setValueAtTime(5000, t);
    filt.frequency.exponentialRampToValueAtTime(800, t + 0.42);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    osc.connect(filt).connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 0.48);
  }

  private playDeepRumble(dest: AudioNode, at?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = at ?? ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(35, t);
    osc.frequency.exponentialRampToValueAtTime(22, t + 1.2);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.3);
    gain.gain.linearRampToValueAtTime(0, t + 1.2);
    osc.connect(gain).connect(dest);
    osc.start(t);
    osc.stop(t + 1.3);
  }

  private startMusicLoop(
    track: "gameplay" | "leaderboard",
    cfg: {
      bpm: number;
      sections: { lead: number[]; arp: number[]; bass: number[]; leadType: OscillatorType }[];
      stepsPerSection: number;
      masterTarget: number;
      drums?: boolean;
      arp?: boolean;
    },
  ) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    if (this.music?.track === track) return;
    this.stopMusicNodes(0.6);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, t);
    masterGain.gain.linearRampToValueAtTime(cfg.masterTarget, t + 0.8);
    // Music routes through the duck bus so explosions can pump it.
    masterGain.connect(this.duckBus ?? ctx.destination);
    // Drone pad underneath — a sustained low hum giving "spaceship interior"
    this.startDronePad(masterGain);
    const beatMs = 60000 / cfg.bpm / 2; // 8th notes
    let step = 0;
    let sectionIdx = 0;
    // Look-ahead scheduling: notes are placed on an audio-clock cursor up to
    // LOOKAHEAD_SEC ahead, so timer jitter (GC, React re-renders, spawn
    // bursts) and hidden-tab setInterval throttling can't stumble the beat.
    const scheduleStep = (now: number) => {
      if (!this.ctx || !this.music || this.music.track !== track) return;
      const sec = cfg.sections[sectionIdx % cfg.sections.length];
      if (!sec) return;
      const sectionStep = step % cfg.stepsPerSection;
      const leadF = sec.lead[sectionStep % sec.lead.length] ?? 0;
      const bassF = sec.bass[sectionStep % sec.bass.length] ?? 0;
      const dur = beatMs / 1000;
      // Lead — supersaw (3 detuned sawtooths) through a lowpass filter sweep.
      // Classic synthwave lead: bright attack → mellow tail, detuning gives
      // the chorus-y "retro-future" width.
      if (leadF > 0) {
        const sustain = dur * 1.9;
        const leadFilt = this.ctx.createBiquadFilter();
        leadFilt.type = "lowpass";
        leadFilt.Q.value = 6;
        leadFilt.frequency.setValueAtTime(Math.min(leadF * 10, 12000), now);
        leadFilt.frequency.exponentialRampToValueAtTime(
          Math.max(leadF * 2.2, 600),
          now + sustain * 0.6,
        );
        const leadGain = this.ctx.createGain();
        leadGain.gain.setValueAtTime(0, now);
        leadGain.gain.linearRampToValueAtTime(0.24, now + 0.01);
        leadGain.gain.exponentialRampToValueAtTime(0.001, now + sustain * 0.95);
        leadFilt.connect(leadGain).connect(masterGain);
        for (const d of [0.9935, 1.0, 1.0065]) {
          const o = this.ctx.createOscillator();
          o.type = "sawtooth";
          o.frequency.value = leadF * d;
          o.connect(leadFilt);
          o.start(now);
          o.stop(now + sustain);
        }
        // Octave sparkle on top — the "high-frequency stars" layer
        const sparkle = this.ctx.createOscillator();
        const sparkleGain = this.ctx.createGain();
        sparkle.type = "sine";
        sparkle.frequency.value = leadF * 2;
        sparkleGain.gain.setValueAtTime(0.08, now);
        sparkleGain.gain.exponentialRampToValueAtTime(0.001, now + sustain * 0.7);
        sparkle.connect(sparkleGain).connect(masterGain);
        sparkle.start(now);
        sparkle.stop(now + sustain * 0.75);
      }
      // Harmony: every 4th step add a fifth above
      if (leadF > 0 && step % 4 === 2) {
        const harmOsc = this.ctx.createOscillator();
        const harmGain = this.ctx.createGain();
        harmOsc.type = "sine";
        harmOsc.frequency.value = leadF * 1.5;
        harmGain.gain.setValueAtTime(0.1, now);
        harmGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);
        harmOsc.connect(harmGain).connect(masterGain);
        harmOsc.start(now);
        harmOsc.stop(now + dur * 0.7);
      }
      // Arpeggio — continuous 16th-note sawtooth blips through the chord
      // tones. This is the "fast travel through stars" engine of the track:
      // two arp notes per 8th-step, each a short filtered saw pluck.
      if (cfg.arp) {
        const arpLen = sec.arp.length;
        const playArp = (freq: number, at: number, level: number) => {
          if (freq <= 0 || !this.ctx) return;
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          const f = this.ctx.createBiquadFilter();
          o.type = "sawtooth";
          o.frequency.value = freq;
          f.type = "lowpass";
          f.Q.value = 3;
          f.frequency.setValueAtTime(freq * 6, at);
          f.frequency.exponentialRampToValueAtTime(Math.max(freq * 2, 500), at + dur * 0.4);
          g.gain.setValueAtTime(level, at);
          g.gain.exponentialRampToValueAtTime(0.001, at + dur * 0.5);
          o.connect(f).connect(g).connect(masterGain);
          o.start(at);
          o.stop(at + dur * 0.55);
        };
        const a1 = sec.arp[(step * 2) % arpLen] ?? 0;
        const a2 = sec.arp[(step * 2 + 1) % arpLen] ?? 0;
        // Humanize: accent the downbeat, soften off-beats, swing the second
        // 16th slightly late, and jump the last off-beat of a bar up an
        // octave — turns the dead-straight arpeggiator into a groove.
        const accent = step % 4 === 0 ? 0.16 : 0.12;
        const swing = dur * 0.06;
        const octaveJump = step % 8 === 7 ? 2 : 1;
        playArp(a1, now, accent);
        playArp(a2 * octaveJump, now + dur * 0.5 + swing, 0.09);
      }
      // Drums — kick every quarter (4-on-the-floor), snare on backbeat, closed hat every 8th
      if (cfg.drums) {
        const isQuarter = step % 4 === 0;
        const isBackbeat = step % 8 === 4;
        if (isQuarter) {
          // Kick: sine 130Hz → 40Hz sweep + short click
          const k = this.ctx.createOscillator();
          const kg = this.ctx.createGain();
          k.type = "sine";
          k.frequency.setValueAtTime(130, now);
          k.frequency.exponentialRampToValueAtTime(40, now + 0.12);
          kg.gain.setValueAtTime(0.55, now);
          kg.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          k.connect(kg).connect(masterGain);
          k.start(now);
          k.stop(now + 0.22);
        }
        if (isBackbeat) {
          // Snare: short noise burst + highpass
          const dur2 = 0.11;
          const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur2, this.ctx.sampleRate);
          const data = buf.getChannelData(0);
          for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / data.length) * 10);
          }
          const src = this.ctx.createBufferSource();
          src.buffer = buf;
          const filt = this.ctx.createBiquadFilter();
          filt.type = "highpass";
          filt.frequency.value = 1800;
          const sg = this.ctx.createGain();
          sg.gain.setValueAtTime(0.38, now);
          sg.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          src.connect(filt).connect(sg).connect(masterGain);
          src.start(now);
        }
        // Closed hi-hat every 8th for motion
        const hatDur = 0.04;
        const hatBuf = this.ctx.createBuffer(1, this.ctx.sampleRate * hatDur, this.ctx.sampleRate);
        const hatData = hatBuf.getChannelData(0);
        for (let i = 0; i < hatData.length; i++) {
          hatData[i] = (Math.random() - 0.5) * 2 * Math.exp((-i / hatData.length) * 18);
        }
        const hatSrc = this.ctx.createBufferSource();
        hatSrc.buffer = hatBuf;
        const hatFilt = this.ctx.createBiquadFilter();
        hatFilt.type = "highpass";
        hatFilt.frequency.value = 6500;
        const hatGain = this.ctx.createGain();
        // Accent off-beats (odd steps) a bit louder for groove
        hatGain.gain.setValueAtTime(step % 2 === 1 ? 0.14 : 0.08, now);
        hatGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
        hatSrc.connect(hatFilt).connect(hatGain).connect(masterGain);
        hatSrc.start(now);
      }
      // Bass — detuned sawtooth pair through a lowpass + a sine sub an octave
      // below. Quarter notes with a fast-up/slow-down "pumping" envelope that
      // echoes the synthwave sidechain-duck feel.
      if (step % 2 === 0 && bassF > 0) {
        const bassFilt = this.ctx.createBiquadFilter();
        bassFilt.type = "lowpass";
        // Filter envelope: open fast with the hit, close into the tail — the
        // low end "breathes" per note instead of sitting static.
        bassFilt.frequency.setValueAtTime(Math.max(bassF * 3, 120), now);
        bassFilt.frequency.exponentialRampToValueAtTime(Math.min(bassF * 11, 950), now + 0.09);
        bassFilt.frequency.exponentialRampToValueAtTime(Math.max(bassF * 4, 150), now + dur * 1.5);
        bassFilt.Q.value = 2;
        // Soft tanh drive ahead of the filter for analog-style grit.
        const drive = this.ctx.createWaveShaper();
        drive.curve = SoundManager.driveCurve();
        drive.connect(bassFilt);
        const bassGain = this.ctx.createGain();
        bassGain.gain.setValueAtTime(0.12, now);
        bassGain.gain.linearRampToValueAtTime(0.5, now + 0.08);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.7);
        bassFilt.connect(bassGain).connect(masterGain);
        for (const d of [0.997, 1.003]) {
          const bo = this.ctx.createOscillator();
          bo.type = "sawtooth";
          bo.frequency.value = bassF * d;
          bo.connect(drive);
          bo.start(now);
          bo.stop(now + dur * 1.8);
        }
        // Sub-octave sine for weight
        const sub = this.ctx.createOscillator();
        const subGain = this.ctx.createGain();
        sub.type = "sine";
        sub.frequency.value = bassF * 0.5;
        subGain.gain.setValueAtTime(0.3, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.6);
        sub.connect(subGain).connect(masterGain);
        sub.start(now);
        sub.stop(now + dur * 1.7);
      }
      // ---- Space texture events (periodic) ----
      // Scanner ping every ~4s (every section start)
      if (step > 0 && step % cfg.stepsPerSection === 0) {
        this.playScannerPing(masterGain, now);
      }
      // Star whoosh mid-section — "flying past stars" reinforcement
      if (step > 0 && step % cfg.stepsPerSection === Math.floor(cfg.stepsPerSection / 2)) {
        this.playStarWhoosh(masterGain, now);
      }
      // Radio crackle burst every ~8s
      if (step > 0 && step % (cfg.stepsPerSection * 2) === 8) {
        this.playRadioCrackle(masterGain, now);
      }
      // Deep-space rumble every ~16s
      if (step > 0 && step % (cfg.stepsPerSection * 4) === 0) {
        this.playDeepRumble(masterGain, now);
      }
      step++;
      // Advance section every N steps so the progression evolves
      if (step % cfg.stepsPerSection === 0) sectionIdx++;
    };
    const stepSec = beatMs / 1000;
    const LOOKAHEAD_SEC = 0.18;
    let nextStepAt = ctx.currentTime + 0.05;
    const tick = () => {
      if (!this.ctx || !this.music || this.music.track !== track) return;
      const horizon = this.ctx.currentTime + LOOKAHEAD_SEC;
      // Catch-up guard: after a long throttled gap (hidden tab), jump the
      // cursor forward instead of machine-gunning every missed step at once.
      if (nextStepAt < this.ctx.currentTime - stepSec) {
        nextStepAt = this.ctx.currentTime + 0.02;
      }
      while (nextStepAt < horizon) {
        scheduleStep(nextStepAt);
        nextStepAt += stepSec;
      }
    };
    const interval = setInterval(tick, 30);
    this.music = { track, masterGain, interval, step: 0 };
    tick();
  }

  // Crossfade the current music out over `fadeSec` seconds (default 0.5).
  // Also clears the "should be playing" intent — use stopMusicNodes when the
  // intent must survive (music/sound toggles) so re-enabling resumes.
  stopMusic(fadeSec = 0.5) {
    this.desiredTrack = null;
    this.stopMusicNodes(fadeSec);
  }

  // Tear down the playing nodes without forgetting which track should play.
  private stopMusicNodes(fadeSec = 0.5) {
    this.stopDronePad();
    if (!this.music || !this.ctx) {
      this.music = null;
      return;
    }
    const { masterGain, interval } = this.music;
    clearInterval(interval);
    const t = this.ctx.currentTime;
    masterGain.gain.cancelScheduledValues(t);
    masterGain.gain.setValueAtTime(masterGain.gain.value, t);
    masterGain.gain.linearRampToValueAtTime(0, t + Math.max(0.02, fadeSec));
    const g = masterGain;
    setTimeout(
      () => {
        try {
          g.disconnect();
        } catch {
          // silent-ok: disconnecting an already-disconnected gain node throws; the node is being torn down anyway
        }
      },
      Math.max(40, fadeSec * 1000 + 60),
    );
    this.music = null;
  }

  // Short descending three-note jingle on death.
  playLosingJingle() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [493.88, 392.0, 311.13]; // B4 → G4 → D#4 (sad descent)
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = t + i * 0.18;
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain).connect(this.sfxOut());
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }
  destroy() {
    this.stopWarpLoop();
    this.stopMusic(0);
    if (this.ctx) {
      try {
        void this.ctx.close();
      } catch {
        // silent-ok: closing an already-closed/closing AudioContext throws; the manager is being torn down anyway
      }
      this.ctx = null;
    }
    this.masterBus = null;
    this.sfxBus = null;
    this.duckBus = null;
    this.echoSend = null;
    this.enabled = false;
  }
}

// Module-level singleton — survives React StrictMode double-mounts
export const sounds = new SoundManager();
