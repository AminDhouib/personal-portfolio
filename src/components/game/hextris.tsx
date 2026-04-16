"use client";

import { useRef, useEffect, useState } from "react";
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  ArrowLeftRight,
  Hand,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// SOUND — self-contained WebAudio synthesis, no asset files
// ═══════════════════════════════════════════════════════════════

class HextrisSounds {
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
  private static readonly PATTERN_LEN = 32; // 2 bars × 16 sixteenth-notes

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
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
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

  private playTone(
    freq: number,
    durationMs: number,
    type: OscillatorType = "sine",
    gain = 0.25,
  ) {
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
    const base = 440 + Math.min(comboLevel, 8) * 55;
    this.playTone(base, 140, "sine", 0.22);
    this.playTone(base * 1.5, 180, "sine", 0.12);
  }

  combo(n: number) {
    const base = 660 + Math.min(n, 8) * 80;
    this.playTone(base, 80, "triangle", 0.18);
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
      this.currentStep =
        (this.currentStep + 1) % HextrisSounds.PATTERN_LEN;
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

  // Gameplay: driving synth — pulse bass, kick, hat, triangle lead
  private scheduleGameplay(step: number, time: number) {
    if (!this.ctx || !this.musicGain) return;

    // Bass pattern (32 steps). A minor — root walks A → F → G → E.
    const bass = [
      // Bar 1
      110, 0, 0, 110, 0, 110, 0, 0,
      87.31, 0, 110, 0, 98, 0, 82.41, 98,
      // Bar 2
      110, 0, 0, 110, 0, 87.31, 110, 0,
      98, 0, 82.41, 0, 110, 0, 98, 82.41,
    ];
    if (bass[step] > 0) {
      this.playMusicNote(bass[step], time, 0.16, "square", 0.12);
      // Sub-bass octave down for weight
      this.playMusicNote(bass[step] / 2, time, 0.12, "sine", 0.08);
    }

    // Kick on beats 1 & 3 of each bar
    if (step === 0 || step === 8 || step === 16 || step === 24) {
      this.playMusicKick(time);
    }

    // Closed hi-hat on every 2nd 16th (off-beat shuffle)
    if (step % 2 === 1) {
      this.playMusicHat(time, 0.04);
    }
    // Open hat every 8th on the 'and' of beat 2/4 for groove
    if (step === 6 || step === 14 || step === 22 || step === 30) {
      this.playMusicHat(time, 0.08);
    }

    // Lead — A minor pentatonic melody
    const lead = [
      0, 0, 440, 0, 523.25, 0, 0, 587.33,
      0, 659.25, 0, 587.33, 523.25, 0, 440, 0,
      0, 0, 523.25, 0, 659.25, 0, 0, 784,
      0, 659.25, 0, 587.33, 523.25, 0, 440, 329.63,
    ];
    if (lead[step] > 0) {
      this.playMusicNote(lead[step], time, 0.11, "triangle", 0.07);
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

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface Point {
  x: number;
  y: number;
}

interface Block {
  settled: number;
  height: number;
  fallingLane: number;
  checked: number;
  angle: number;
  angularVelocity: number;
  targetAngle: number;
  color: string;
  deleted: number;
  removed: number;
  tint: number;
  opacity: number;
  initializing: number;
  ict: number;
  iter: number;
  initLen: number;
  attachedLane: number;
  distFromHex: number;
  width: number;
  widthWide: number;
}

interface TextObj {
  x: number;
  y: number;
  text: string;
  color: string;
  opacity: number;
  alive: number;
}

interface Shake {
  lane: number;
  magnitude: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 0..1 remaining
  size: number;
  color: string;
}

interface LeaderboardEntry {
  name: string;
  score: number;
  level: number;
  seconds?: number;
  kills?: number;
  region?: string;
  createdAt: string;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

// Portfolio accent palette — matches --color-accent-* in globals.css
const COLORS = ["#ec4899", "#f59e0b", "#6366f1", "#22c55e"]; // pink, amber, blue, green
const TINTED: Record<string, string> = {
  "#ec4899": "rgba(236,72,153,0.35)",
  "#f59e0b": "rgba(245,158,11,0.35)",
  "#6366f1": "rgba(99,102,241,0.35)",
  "#22c55e": "rgba(34,197,94,0.35)",
};
// Glow rgba values for block shadows
const GLOW: Record<string, string> = {
  "#ec4899": "rgba(236,72,153,0.55)",
  "#f59e0b": "rgba(245,158,11,0.55)",
  "#6366f1": "rgba(99,102,241,0.55)",
  "#22c55e": "rgba(34,197,94,0.55)",
};

// Theme colors (dark)
const THEME = {
  bg: "#0d0d0d", // canvas / game board
  bgOuter: "#050505", // beyond the hex boundary
  hexFill: [17, 17, 20] as [number, number, number], // center hex
  hexStroke: "rgba(255,255,255,0.08)", // center hex outline
  outerBoundary: "rgba(255,255,255,0.07)", // outer hexagon fill
  gridLine: "rgba(255,255,255,0.03)",
  text: "#ededed",
  muted: "#888888",
  heading: "#ededed",
};

const AV_CONST = 4;

// ═══════════════════════════════════════════════════════════════
// MATH HELPERS
// ═══════════════════════════════════════════════════════════════

function rotatePoint(x: number, y: number, theta: number): Point {
  const r = (theta * Math.PI) / 180;
  return {
    x: Math.cos(r) * x - Math.sin(r) * y,
    y: Math.sin(r) * x + Math.cos(r) * y,
  };
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * max + min);
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function HextrisGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const destroyedRef = useRef(false);
  const [uiState, setUiState] = useState<"menu" | "playing" | "paused" | "gameover">("menu");
  const [uiScore, setUiScore] = useState(0);
  const [uiHigh, setUiHigh] = useState(0);
  const [uiCombo, setUiCombo] = useState(1);
  const [uiStats, setUiStats] = useState({
    maxCombo: 0,
    pieces: 0,
    seconds: 0,
    difficulty: 1,
  });
  const [scorePulse, setScorePulse] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    try {
      return localStorage.getItem("hextris_sound") !== "off";
    } catch {
      return true;
    }
  });
  const [hasInteracted, setHasInteracted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showTutorial, setShowTutorial] = useState(true);
  // Combo milestone text (e.g., "×5 COMBO!") displayed briefly on crossing thresholds
  const [milestone, setMilestone] = useState<{ id: number; text: string; color: string } | null>(null);

  // Leaderboard state
  const [playerName, setPlayerName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    try {
      return localStorage.getItem("hextris_name") || "";
    } catch {
      return "";
    }
  });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [submitState, setSubmitState] =
    useState<"idle" | "submitting" | "submitted" | "failed">("idle");
  const submittedOnceRef = useRef(false);

  // Sound manager — created once per component lifetime
  const soundsRef = useRef<HextrisSounds>(null as unknown as HextrisSounds);
  if (!soundsRef.current) soundsRef.current = new HextrisSounds();

  const restartRef = useRef<() => void>(() => {});

  // Sync sound enabled state to the manager + persist
  useEffect(() => {
    soundsRef.current.setEnabled(soundEnabled);
    try {
      localStorage.setItem("hextris_sound", soundEnabled ? "on" : "off");
    } catch {
      /* empty */
    }
  }, [soundEnabled]);

  // Detect device type once on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    setIsTouchDevice(touch);
  }, []);

  // Fullscreen API wiring
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === containerRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = async () => {
    if (typeof document === "undefined") return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (containerRef.current) {
        await containerRef.current.requestFullscreen();
      }
    } catch {
      /* fullscreen denied (Safari, embedded contexts) — silent */
    }
  };

  // Unlock audio on first user interaction (browser autoplay policy)
  useEffect(() => {
    if (hasInteracted) return;
    const onInteract = () => {
      soundsRef.current.resume();
      setHasInteracted(true);
    };
    window.addEventListener("pointerdown", onInteract);
    window.addEventListener("keydown", onInteract);
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("keydown", onInteract);
    };
  }, [hasInteracted]);

  // Drive music from uiState transitions (only after first interaction)
  useEffect(() => {
    if (!hasInteracted) return;
    const s = soundsRef.current;
    if (uiState === "menu") s.startMenuMusic();
    else if (uiState === "playing") s.startGameplayMusic();
    else if (uiState === "paused") s.stopMusic();
    else if (uiState === "gameover") s.playGameOverMusic();
  }, [uiState, hasInteracted]);

  // Stop music on unmount to prevent leaks if user switches tabs
  useEffect(() => {
    return () => {
      soundsRef.current.stopMusic();
    };
  }, []);

  // Dismiss the tutorial when the user first interacts (also handled by
  // auto-hide when game-state leaves menu)
  function dismissTutorial() {
    setShowTutorial(false);
  }

  // Auto-dismiss tutorial as soon as gameplay begins.
  useEffect(() => {
    if (uiState === "playing") setShowTutorial(false);
    if (uiState === "menu") setShowTutorial(true);
  }, [uiState]);

  // Auto-clear combo milestone overlay after its animation
  useEffect(() => {
    if (!milestone) return;
    const t = window.setTimeout(() => setMilestone(null), 1200);
    return () => window.clearTimeout(t);
  }, [milestone]);

  // Persist player name
  useEffect(() => {
    if (playerName) {
      try {
        localStorage.setItem("hextris_name", playerName);
      } catch {
        /* empty */
      }
    }
  }, [playerName]);

  // Fetch leaderboard entries (top 25; we show 8)
  async function fetchLeaderboard() {
    try {
      const res = await fetch("/api/leaderboard", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { entries?: LeaderboardEntry[] };
      if (Array.isArray(data.entries)) setLeaderboard(data.entries);
    } catch {
      /* ignore */
    }
  }

  async function submitScore(name: string) {
    if (submitState === "submitting") return;
    const trimmedName = name.trim().slice(0, 12) || "Player";
    setSubmitState("submitting");
    try {
      const res = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          score: uiScore,
          level: Math.max(1, uiStats.difficulty),
          seconds: uiStats.seconds,
          kills: uiStats.pieces,
        }),
      });
      if (!res.ok) {
        setSubmitState("failed");
        return;
      }
      const data = (await res.json()) as { ok?: boolean; rank?: number };
      if (data.ok && typeof data.rank === "number") {
        setRank(data.rank);
        setSubmitState("submitted");
        submittedOnceRef.current = true;
        await fetchLeaderboard();
      } else {
        setSubmitState("failed");
      }
    } catch {
      setSubmitState("failed");
    }
  }

  // On game-over: fetch leaderboard + auto-submit once (if name saved)
  useEffect(() => {
    if (uiState === "gameover") {
      fetchLeaderboard();
      if (playerName.trim() && !submittedOnceRef.current) {
        submitScore(playerName);
      }
    }
    if (uiState === "playing") {
      // Reset the submit guard when a new game starts
      submittedOnceRef.current = false;
      setRank(null);
      setSubmitState("idle");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uiState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d")!;
    destroyedRef.current = false;

    // ─── GAME STATE ──────────────────────────────────────────
    const colors = [...COLORS];

    const settings = {
      startDist: 340,
      creationDt: 9,
      baseScale: 1,
      scale: 1,
      prevScale: 1,
      baseHexWidth: 87,
      hexWidth: 87,
      baseBlockHeight: 20,
      blockHeight: 20,
      rows: 8,
      speedModifier: 0.65,
      speedUpKeyHeld: false,
      creationSpeedModifier: 0.65,
      comboTime: 310,
    };

    let gameState = 0; // 0=start, 1=playing, -1=paused, 2=gameover
    let score = 0;
    let rush = 1;
    let gdx = 0;
    let gdy = 0;
    let op = 0;
    let scoreOpacity = 0;
    let lastTime = Date.now();
    let trueCanvas = { width: 0, height: 0 };

    let highscores: number[] = [];
    try {
      const hs = localStorage.getItem("hextris_highscores");
      if (hs) highscores = JSON.parse(hs);
    } catch {
      /* empty */
    }
    let lastSyncedScore = 0;

    // ─── STATS ──────────────────────────────────────────────
    let maxComboSeen = 0;
    let piecesCleared = 0;
    let gameStartMs = Date.now();
    let lastSyncedCombo = 1;
    let lastTempoSync = 0;
    const sounds = soundsRef.current;

    // ─── PARTICLES ──────────────────────────────────────────
    const particles: Particle[] = [];

    function emitParticles(x: number, y: number, color: string, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.5 + Math.random() * 3;
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed * settings.scale,
          vy: Math.sin(angle) * speed * settings.scale,
          life: 1,
          size: (2 + Math.random() * 2) * settings.scale,
          color,
        });
      }
    }

    function updateAndDrawParticles(dt: number) {
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy *= 0.92;
        p.life -= 0.025 * dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, p.life);
        ctx.fillStyle = p.color;
        ctx.shadowColor = GLOW[p.color] ?? p.color;
        ctx.shadowBlur = 6 * settings.scale;
        ctx.beginPath();
        ctx.arc(p.x + gdx, p.y + gdy, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // ─── BLOCKS (falling) ────────────────────────────────────
    let blocks: Block[] = [];

    function createBlock(
      fallingLane: number,
      color: string,
      iter: number,
      distFromHex?: number,
    ): Block {
      return {
        settled: 0,
        height: settings.blockHeight,
        fallingLane,
        checked: 0,
        angle: 90 - (30 + 60 * fallingLane),
        angularVelocity: 0,
        targetAngle: 90 - (30 + 60 * fallingLane),
        color,
        deleted: 0,
        removed: 0,
        tint: 0,
        opacity: 1,
        initializing: 1,
        ict: mainHex.ct,
        iter,
        initLen: settings.creationDt,
        attachedLane: 0,
        distFromHex: distFromHex ?? settings.startDist * settings.scale,
        width: 0,
        widthWide: 0,
      };
    }

    // ─── HEX ─────────────────────────────────────────────────
    const mainHex = {
      sides: 6,
      position: 0,
      angle: 30,
      targetAngle: 30,
      angularVelocity: 0,
      sideLength: settings.hexWidth,
      fillColor: [...THEME.hexFill] as number[],
      x: 0,
      y: 0,
      dy: 0,
      dt: 1 as number,
      ct: 0,
      blocks: [[], [], [], [], [], []] as Block[][],
      texts: [] as TextObj[],
      shakes: [] as Shake[],
      lastCombo: -settings.comboTime,
      lastColorScored: "#000",
      comboMultiplier: 1,
      delay: 0,
    };

    function hexSurfaceDist() {
      return (mainHex.sideLength / 2) * Math.sqrt(3);
    }

    function hexShake(obj: Shake) {
      const angle = ((30 + obj.lane * 60) * Math.PI) / 180;
      gdx -= Math.cos(angle) * obj.magnitude;
      gdy += Math.sin(angle) * obj.magnitude;
      obj.magnitude /= 2 * mainHex.dt;
      if (obj.magnitude < 1) {
        const idx = mainHex.shakes.indexOf(obj);
        if (idx !== -1) mainHex.shakes.splice(idx, 1);
      }
    }

    function hexAddBlock(block: Block) {
      if (!(gameState === 1 || gameState === 0)) return;
      block.settled = 1;
      block.tint = 0.6;
      let lane = mainHex.sides - block.fallingLane;
      mainHex.shakes.push({
        lane: block.fallingLane,
        magnitude: 4.5 * (window.devicePixelRatio || 1) * settings.scale,
      });
      lane += mainHex.position;
      lane = ((lane % mainHex.sides) + mainHex.sides) % mainHex.sides;
      block.distFromHex =
        hexSurfaceDist() + block.height * mainHex.blocks[lane].length;
      mainHex.blocks[lane].push(block);
      block.attachedLane = lane;
      block.checked = 1;
      if (gameState === 1) sounds.settle();
    }

    function hexDoesBlockCollide(
      block: Block,
      position?: number,
      tArr?: Block[],
    ) {
      if (block.settled) return;

      if (position !== undefined && tArr) {
        // Re-settling blocks after deletion
        if (position <= 0) {
          if (
            block.distFromHex -
              block.iter * mainHex.dt * settings.scale -
              hexSurfaceDist() <=
            0
          ) {
            block.distFromHex = hexSurfaceDist();
            block.settled = 1;
            block.checked = 1;
          } else {
            block.settled = 0;
            block.iter = 1.5 + (waveGen.difficulty / 15) * 3;
          }
        } else {
          if (
            tArr[position - 1] &&
            tArr[position - 1].settled &&
            block.distFromHex -
              block.iter * mainHex.dt * settings.scale -
              tArr[position - 1].distFromHex -
              tArr[position - 1].height <=
              0
          ) {
            block.distFromHex =
              tArr[position - 1].distFromHex + tArr[position - 1].height;
            block.settled = 1;
            block.checked = 1;
          } else {
            block.settled = 0;
            block.iter = 1.5 + (waveGen.difficulty / 15) * 3;
          }
        }
      } else {
        // Falling blocks from outside
        let lane = mainHex.sides - block.fallingLane;
        lane += mainHex.position;
        lane = ((lane % mainHex.sides) + mainHex.sides) % mainHex.sides;
        const arr = mainHex.blocks[lane];

        if (arr.length > 0) {
          const top = arr[arr.length - 1];
          if (
            block.distFromHex -
              block.iter * mainHex.dt * settings.scale -
              top.distFromHex -
              top.height <=
            0
          ) {
            hexAddBlock(block);
          }
        } else {
          if (
            block.distFromHex -
              block.iter * mainHex.dt * settings.scale -
              hexSurfaceDist() <=
            0
          ) {
            hexAddBlock(block);
          }
        }
      }
    }

    function hexRotate(steps: number) {
      mainHex.position += steps;
      while (mainHex.position < 0) mainHex.position += mainHex.sides;
      mainHex.position = mainHex.position % mainHex.sides;
      mainHex.targetAngle -= steps * 60;
      for (const sideBlocks of mainHex.blocks) {
        for (const block of sideBlocks) {
          block.targetAngle -= steps * 60;
        }
      }
      sounds.rotate();
    }

    function hexDraw() {
      mainHex.x = trueCanvas.width / 2;
      mainHex.y = trueCanvas.height / 2;
      mainHex.sideLength = settings.hexWidth;

      gdx = 0;
      gdy = 0;
      for (let i = mainHex.shakes.length - 1; i >= 0; i--) {
        hexShake(mainHex.shakes[i]);
      }

      // Shortest-arc normalization so rapid rotations don't accumulate.
      let hd = mainHex.targetAngle - mainHex.angle;
      while (hd > 180) {
        mainHex.angle += 360;
        hd -= 360;
      }
      while (hd < -180) {
        mainHex.angle -= 360;
        hd += 360;
      }

      // Animate angle toward target
      if (mainHex.angle > mainHex.targetAngle) {
        mainHex.angularVelocity -= AV_CONST * mainHex.dt;
      } else if (mainHex.angle < mainHex.targetAngle) {
        mainHex.angularVelocity += AV_CONST * mainHex.dt;
      }
      if (
        Math.abs(
          mainHex.angle - mainHex.targetAngle + mainHex.angularVelocity,
        ) <= Math.abs(mainHex.angularVelocity)
      ) {
        mainHex.angle = mainHex.targetAngle;
        mainHex.angularVelocity = 0;
      } else {
        mainHex.angle += mainHex.angularVelocity;
      }

      const fc = mainHex.fillColor;
      drawPolygon(
        mainHex.x + gdx,
        mainHex.y + gdy + mainHex.dy,
        6,
        mainHex.sideLength,
        mainHex.angle,
        `rgb(${fc[0]},${fc[1]},${fc[2]})`,
        1.5,
        THEME.hexStroke,
      );
    }

    // ─── WAVEGEN ─────────────────────────────────────────────
    const waveGen = {
      lastGen: 0,
      nextGen: 2700,
      ct: 0,
      difficulty: 1,
      dt: 0,
      last: 0,
      currentFunction: null as (() => void) | null,
    };

    function wgUpdate() {
      if (waveGen.currentFunction) waveGen.currentFunction();
      waveGen.dt = 16.6667 * mainHex.ct;
      wgComputeDifficulty();
      if (
        (waveGen.dt - waveGen.lastGen) * settings.creationSpeedModifier >
        waveGen.nextGen
      ) {
        if (waveGen.nextGen > 600) {
          waveGen.nextGen -=
            11 * (waveGen.nextGen / 1300) * settings.creationSpeedModifier;
        }
      }
    }

    function wgComputeDifficulty() {
      if (waveGen.difficulty < 35) {
        let increment: number;
        if (waveGen.difficulty < 8) {
          increment =
            ((waveGen.dt - waveGen.last) / 5166667) * settings.speedModifier;
        } else if (waveGen.difficulty < 15) {
          increment =
            ((waveGen.dt - waveGen.last) / 72333333) * settings.speedModifier;
        } else {
          increment =
            ((waveGen.dt - waveGen.last) / 90000000) * settings.speedModifier;
        }
        waveGen.difficulty += increment * 0.5;
      }
    }

    function addNewBlock(
      blocklane: number,
      color: string,
      iter: number,
      distFromHex?: number,
    ) {
      iter *= settings.speedModifier;
      blocks.push(createBlock(blocklane, color, iter, distFromHex));
    }

    function wgRandomGeneration() {
      if (waveGen.dt - waveGen.lastGen > waveGen.nextGen) {
        waveGen.ct++;
        waveGen.lastGen = waveGen.dt;
        const fv = randInt(0, mainHex.sides);
        addNewBlock(
          fv,
          colors[randInt(0, colors.length)],
          1.6 + (waveGen.difficulty / 15) * 3,
        );
        if (waveGen.ct > 5) {
          const next = randInt(0, 24);
          if (next > 15) {
            waveGen.ct = 0;
            waveGen.currentFunction = wgDoubleGeneration;
          } else if (next > 10) {
            waveGen.ct = 0;
            waveGen.currentFunction = wgCrosswiseGeneration;
          } else if (next > 7) {
            waveGen.ct = 0;
            waveGen.currentFunction = wgSpiralGeneration;
          } else if (next > 4) {
            waveGen.ct = 0;
            waveGen.currentFunction = wgCircleGeneration;
          } else if (next > 1) {
            waveGen.ct = 0;
            waveGen.currentFunction = wgHalfCircleGeneration;
          }
        }
      }
    }

    function wgDoubleGeneration() {
      if (waveGen.dt - waveGen.lastGen > waveGen.nextGen) {
        const i = randInt(0, mainHex.sides);
        addNewBlock(
          i,
          colors[randInt(0, colors.length)],
          1.5 + (waveGen.difficulty / 15) * 3,
        );
        addNewBlock(
          (i + 1) % mainHex.sides,
          colors[randInt(0, colors.length)],
          1.5 + (waveGen.difficulty / 15) * 3,
        );
        waveGen.ct += 2;
        waveGen.lastGen = waveGen.dt;
        wgShouldChangePattern(false);
      }
    }

    function wgSpiralGeneration() {
      const dir = randInt(0, 2);
      if (waveGen.dt - waveGen.lastGen > waveGen.nextGen * (2 / 3)) {
        if (dir) {
          addNewBlock(
            5 - (waveGen.ct % mainHex.sides),
            colors[randInt(0, colors.length)],
            1.5 + (waveGen.difficulty / 15) * 1.5,
          );
        } else {
          addNewBlock(
            waveGen.ct % mainHex.sides,
            colors[randInt(0, colors.length)],
            1.5 + (waveGen.difficulty / 15) * 1.5,
          );
        }
        waveGen.ct += 1;
        waveGen.lastGen = waveGen.dt;
        wgShouldChangePattern(false);
      }
    }

    function wgCircleGeneration() {
      if (waveGen.dt - waveGen.lastGen > waveGen.nextGen + 500) {
        let numColors = randInt(1, 4);
        if (numColors === 3) numColors = randInt(1, 4);

        const colorList: string[] = [];
        for (let i = 0; i < numColors; i++) {
          let q = randInt(0, colors.length);
          let attempts = 0;
          while (colorList.includes(colors[q]) && attempts < 10) {
            q = randInt(0, colors.length);
            attempts++;
          }
          colorList.push(colors[q]);
        }

        for (let i = 0; i < mainHex.sides; i++) {
          addNewBlock(
            i,
            colorList[i % numColors],
            1.5 + (waveGen.difficulty / 15) * 3,
          );
        }
        waveGen.ct += 15;
        waveGen.lastGen = waveGen.dt;
        wgShouldChangePattern(true);
      }
    }

    function wgHalfCircleGeneration() {
      if (waveGen.dt - waveGen.lastGen > (waveGen.nextGen + 500) / 2) {
        const numColors = randInt(1, 3);
        const c = colors[randInt(0, colors.length)];
        let colorList = [c, c, c];
        if (numColors === 2) {
          colorList = [c, colors[randInt(0, colors.length)], c];
        }
        const d = randInt(0, 6);
        for (let i = 0; i < 3; i++) {
          addNewBlock(
            (d + i) % 6,
            colorList[i],
            1.5 + (waveGen.difficulty / 15) * 3,
          );
        }
        waveGen.ct += 8;
        waveGen.lastGen = waveGen.dt;
        wgShouldChangePattern(false);
      }
    }

    function wgCrosswiseGeneration() {
      if (waveGen.dt - waveGen.lastGen > waveGen.nextGen) {
        const ri = randInt(0, colors.length);
        const i = randInt(0, mainHex.sides);
        addNewBlock(i, colors[ri], 0.6 + (waveGen.difficulty / 15) * 3);
        addNewBlock(
          (i + 3) % mainHex.sides,
          colors[ri],
          0.6 + (waveGen.difficulty / 15) * 3,
        );
        waveGen.ct += 1.5;
        waveGen.lastGen = waveGen.dt;
        wgShouldChangePattern(false);
      }
    }

    function wgShouldChangePattern(fromCircle: boolean) {
      if (fromCircle) {
        const q = randInt(0, 4);
        waveGen.ct = 0;
        switch (q) {
          case 0:
            waveGen.currentFunction = wgDoubleGeneration;
            break;
          case 1:
            waveGen.currentFunction = wgSpiralGeneration;
            break;
          case 2:
            waveGen.currentFunction = wgCrosswiseGeneration;
            break;
          default:
            break;
        }
      } else if (waveGen.ct > 8) {
        if (randInt(0, 2) === 0) {
          waveGen.ct = 0;
          waveGen.currentFunction = wgRandomGeneration;
        }
      }
    }

    function blockDestroyed() {
      if (waveGen.nextGen > 1350) {
        waveGen.nextGen -= 30 * settings.creationSpeedModifier;
      } else if (waveGen.nextGen > 600) {
        waveGen.nextGen -= 8 * settings.creationSpeedModifier;
      } else {
        waveGen.nextGen = 600;
      }
      if (waveGen.difficulty < 35) {
        waveGen.difficulty += 0.085 * settings.speedModifier;
      } else {
        waveGen.difficulty = 35;
      }
    }

    // ─── CHECKING / MATCHING ─────────────────────────────────

    function floodSearch(twoD: number[][], oneD: number[]): boolean {
      for (let i = 0; i < twoD.length; i++) {
        if (twoD[i][0] === oneD[0] && twoD[i][1] === oneD[1]) return true;
      }
      return false;
    }

    function floodFill(
      side: number,
      index: number,
      deleting: number[][],
    ) {
      if (!mainHex.blocks[side] || !mainHex.blocks[side][index]) return;
      const color = mainHex.blocks[side][index].color;

      for (let x = -1; x < 2; x++) {
        for (let y = -1; y < 2; y++) {
          if (Math.abs(x) === Math.abs(y)) continue;
          const curSide =
            ((side + x) % mainHex.sides + mainHex.sides) % mainHex.sides;
          const curIndex = index + y;
          if (!mainHex.blocks[curSide]) continue;
          if (mainHex.blocks[curSide][curIndex] !== undefined) {
            if (
              mainHex.blocks[curSide][curIndex].color === color &&
              !floodSearch(deleting, [curSide, curIndex]) &&
              mainHex.blocks[curSide][curIndex].deleted === 0
            ) {
              deleting.push([curSide, curIndex]);
              floodFill(curSide, curIndex, deleting);
            }
          }
        }
      }
    }

    function findCenterOfBlocks(arr: Block[]): Point {
      let avgDFH = 0;
      let avgAngle = 0;
      for (const b of arr) {
        avgDFH += b.distFromHex;
        let ang = b.angle;
        while (ang < 0) ang += 360;
        avgAngle += ang % 360;
      }
      avgDFH /= arr.length;
      avgAngle /= arr.length;
      return {
        x:
          trueCanvas.width / 2 +
          Math.cos((avgAngle * Math.PI) / 180) * avgDFH,
        y:
          trueCanvas.height / 2 +
          Math.sin((avgAngle * Math.PI) / 180) * avgDFH,
      };
    }

    function consolidateBlocks(side: number, index: number) {
      const deleting: number[][] = [];
      deleting.push([side, index]);
      floodFill(side, index, deleting);

      if (deleting.length < 3) return;

      const deletedBlocks: Block[] = [];
      for (const arr of deleting) {
        if (arr && arr.length === 2) {
          mainHex.blocks[arr[0]][arr[1]].deleted = 1;
          deletedBlocks.push(mainHex.blocks[arr[0]][arr[1]]);
        }
      }

      // Scoring with combo
      const now = mainHex.ct;
      if (now - mainHex.lastCombo < settings.comboTime) {
        settings.comboTime =
          (1 / settings.creationSpeedModifier) *
          (waveGen.nextGen / 16.666667) *
          3;
        mainHex.comboMultiplier += 1;
        mainHex.lastCombo = now;
        const coords = findCenterOfBlocks(deletedBlocks);
        mainHex.texts.push({
          x: coords.x,
          y: coords.y,
          text: "x " + mainHex.comboMultiplier,
          color: "#fff",
          opacity: 1,
          alive: 1,
        });
        sounds.combo(mainHex.comboMultiplier);
      } else {
        settings.comboTime = 240;
        mainHex.lastCombo = now;
        mainHex.comboMultiplier = 1;
      }
      sounds.match(mainHex.comboMultiplier);

      const adder =
        deleting.length * deleting.length * mainHex.comboMultiplier;
      mainHex.texts.push({
        x: mainHex.x,
        y: mainHex.y,
        text: "+ " + adder,
        color: deletedBlocks[0].color,
        opacity: 1,
        alive: 1,
      });
      mainHex.lastColorScored = deletedBlocks[0].color;
      score += adder;
    }

    // ─── FLOATING TEXT ───────────────────────────────────────

    function fadeUpAndOut(t: TextObj) {
      t.opacity -=
        (mainHex.dt * Math.pow(Math.pow(1 - t.opacity, 1 / 3) + 1, 3)) / 100;
      t.alive = t.opacity;
      t.y -= 3 * mainHex.dt;
    }

    // ─── DRAWING HELPERS ─────────────────────────────────────

    function drawPolygon(
      x: number,
      y: number,
      sides: number,
      radius: number,
      theta: number,
      fillColor: string,
      lineWidth: number,
      lineColor: string,
    ) {
      ctx.fillStyle = fillColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = lineColor;
      ctx.beginPath();
      let coords = rotatePoint(0, radius, theta);
      ctx.moveTo(coords.x + x, coords.y + y);
      let oldX = coords.x;
      let oldY = coords.y;
      for (let i = 0; i < sides; i++) {
        coords = rotatePoint(oldX, oldY, 360 / sides);
        ctx.lineTo(coords.x + x, coords.y + y);
        oldX = coords.x;
        oldY = coords.y;
      }
      ctx.closePath();
      ctx.fill();
      if (lineWidth > 0) ctx.stroke();
    }

    function renderText(
      x: number,
      y: number,
      fontSize: number,
      color: string,
      text: string | number,
    ) {
      ctx.save();
      const sz = fontSize * settings.scale;
      ctx.font = `bold ${sz}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillStyle = color;
      ctx.fillText(String(text), x, y + sz / 2 - 9 * settings.scale);
      ctx.restore();
    }

    // ─── BLOCK DRAWING ───────────────────────────────────────

    function blockIncrementOpacity(block: Block) {
      if (block.deleted) {
        if (block.opacity >= 0.925) {
          let tLane = block.attachedLane - mainHex.position;
          tLane = mainHex.sides - tLane;
          while (tLane < 0) tLane += mainHex.sides;
          tLane %= mainHex.sides;
          mainHex.shakes.push({
            lane: tLane,
            magnitude:
              3 * (window.devicePixelRatio || 1) * settings.scale,
          });
        }
        block.opacity -= 0.075 * mainHex.dt;
        if (block.opacity <= 0) {
          block.opacity = 0;
          block.deleted = 2;
        }
      }
    }

    function drawBlock(block: Block) {
      block.height = settings.blockHeight;

      if (Math.abs(settings.scale - settings.prevScale) > 1e-9) {
        block.distFromHex *= settings.scale / settings.prevScale;
      }

      blockIncrementOpacity(block);

      // Normalize to shortest arc: if the delta is larger than 180 degrees,
      // wrap the current angle so the block always rotates the short way.
      // Prevents runaway rotations after many rapid hex rotations.
      let delta = block.targetAngle - block.angle;
      while (delta > 180) {
        block.angle += 360;
        delta -= 360;
      }
      while (delta < -180) {
        block.angle -= 360;
        delta += 360;
      }

      // Accelerate toward target
      if (block.angle > block.targetAngle) {
        block.angularVelocity -= AV_CONST * mainHex.dt;
      } else if (block.angle < block.targetAngle) {
        block.angularVelocity += AV_CONST * mainHex.dt;
      }

      // Predictive snap: if the next step would overshoot, clamp to target.
      if (
        Math.abs(block.angle - block.targetAngle + block.angularVelocity) <=
        Math.abs(block.angularVelocity)
      ) {
        block.angle = block.targetAngle;
        block.angularVelocity = 0;
      } else if (Math.abs(block.angle - block.targetAngle) < 0.05) {
        block.angle = block.targetAngle;
        block.angularVelocity = 0;
      } else {
        block.angle += block.angularVelocity;
      }

      // Calculate trapezoid dimensions
      block.width = (2 * block.distFromHex) / Math.sqrt(3);
      block.widthWide = (2 * (block.distFromHex + block.height)) / Math.sqrt(3);

      let p1: Point, p2: Point, p3: Point, p4: Point;
      if (block.initializing) {
        let rat = (mainHex.ct - block.ict) / block.initLen;
        if (rat > 1) rat = 1;
        p1 = rotatePoint((-block.width / 2) * rat, block.height / 2, block.angle);
        p2 = rotatePoint((block.width / 2) * rat, block.height / 2, block.angle);
        p3 = rotatePoint(
          (block.widthWide / 2) * rat,
          -block.height / 2,
          block.angle,
        );
        p4 = rotatePoint(
          (-block.widthWide / 2) * rat,
          -block.height / 2,
          block.angle,
        );
        if (mainHex.ct - block.ict >= block.initLen) {
          block.initializing = 0;
        }
      } else {
        p1 = rotatePoint(-block.width / 2, block.height / 2, block.angle);
        p2 = rotatePoint(block.width / 2, block.height / 2, block.angle);
        p3 = rotatePoint(block.widthWide / 2, -block.height / 2, block.angle);
        p4 = rotatePoint(-block.widthWide / 2, -block.height / 2, block.angle);
      }

      // Block color (use tinted on start screen)
      if (gameState === 0 && TINTED[block.color]) {
        ctx.fillStyle = TINTED[block.color];
      } else {
        ctx.fillStyle = block.color;
      }

      ctx.globalAlpha = block.opacity;
      const angleRad = (block.angle * Math.PI) / 180;
      const baseX =
        trueCanvas.width / 2 +
        Math.sin(angleRad) * (block.distFromHex + block.height / 2) +
        gdx;
      const baseY =
        trueCanvas.height / 2 -
        Math.cos(angleRad) * (block.distFromHex + block.height / 2) +
        gdy;

      // Soft glow under the block
      if (gameState !== 0 && GLOW[block.color]) {
        ctx.shadowColor = GLOW[block.color];
        ctx.shadowBlur = 12 * settings.scale;
      }

      ctx.beginPath();
      ctx.moveTo(baseX + p1.x, baseY + p1.y);
      ctx.lineTo(baseX + p2.x, baseY + p2.y);
      ctx.lineTo(baseX + p3.x, baseY + p3.y);
      ctx.lineTo(baseX + p4.x, baseY + p4.y);
      ctx.closePath();
      ctx.fill();

      // Clear shadow so subsequent draws aren't affected
      ctx.shadowBlur = 0;
      ctx.shadowColor = "transparent";

      // White tint flash on settle
      if (block.tint > 0) {
        if (block.opacity < 1) {
          block.iter = 2.25;
          block.tint = 0;
        } else {
          ctx.fillStyle = "#FFF";
          ctx.globalAlpha = block.tint;
          ctx.beginPath();
          ctx.moveTo(baseX + p1.x, baseY + p1.y);
          ctx.lineTo(baseX + p2.x, baseY + p2.y);
          ctx.lineTo(baseX + p3.x, baseY + p3.y);
          ctx.lineTo(baseX + p4.x, baseY + p4.y);
          ctx.closePath();
          ctx.fill();
          block.tint -= 0.02 * mainHex.dt;
          if (block.tint < 0) block.tint = 0;
        }
      }

      ctx.globalAlpha = 1;
    }

    // ─── COMBO TIMER ─────────────────────────────────────────

    function calcSide(
      startVertex: number,
      endVertex: number,
      fraction: number,
      offset: number,
    ): number[][] {
      startVertex = (startVertex + offset) % 12;
      endVertex = (endVertex + offset) % 12;

      const radius =
        settings.rows * settings.blockHeight * (2 / Math.sqrt(3)) +
        settings.hexWidth;
      const halfRadius = radius / 2;
      const triHeight = radius * (Math.sqrt(3) / 2);

      const vertexes = [
        [halfRadius, triHeight],
        [0, triHeight],
        [-halfRadius, triHeight],
        [(-halfRadius * 3) / 2, triHeight / 2],
        [-radius, 0],
        [(-halfRadius * 3) / 2, -triHeight / 2],
        [-halfRadius, -triHeight],
        [0, -triHeight],
        [halfRadius, -triHeight],
        [(halfRadius * 3) / 2, -triHeight / 2],
        [radius, 0],
        [(halfRadius * 3) / 2, triHeight / 2],
      ];

      const sx = trueCanvas.width / 2 + vertexes[startVertex][0];
      const sy = trueCanvas.height / 2 + vertexes[startVertex][1];
      const ex = trueCanvas.width / 2 + vertexes[endVertex][0];
      const ey = trueCanvas.height / 2 + vertexes[endVertex][1];

      return [
        [sx, sy],
        [(ex - sx) * fraction + sx, (ey - sy) * fraction + sy],
      ];
    }

    function drawTimerSide(vertexes: number[][][]) {
      if (gameState === 0) {
        ctx.strokeStyle =
          TINTED[mainHex.lastColorScored] || mainHex.lastColorScored;
      } else {
        ctx.strokeStyle = mainHex.lastColorScored;
      }
      ctx.lineWidth = 4 * settings.scale;
      ctx.beginPath();
      ctx.moveTo(vertexes[0][0][0], vertexes[0][0][1]);
      ctx.lineTo(vertexes[0][1][0], vertexes[0][1][1]);
      for (let i = 1; i < vertexes.length; i++) {
        ctx.lineTo(vertexes[i][1][0], vertexes[i][1][1]);
      }
      ctx.stroke();
    }

    function drawTimer() {
      if (gameState !== 1) return;
      const leftV: number[][][] = [];
      const rightV: number[][][] = [];

      if (mainHex.ct - mainHex.lastCombo < settings.comboTime) {
        for (let i = 0; i < 6; i++) {
          const done = mainHex.ct - mainHex.lastCombo;
          if (done < (settings.comboTime * (5 - i)) / 6) {
            leftV.push(calcSide(i, i + 1, 1, 1));
            rightV.push(calcSide(12 - i, 11 - i, 1, 1));
          } else {
            leftV.push(
              calcSide(
                i,
                i + 1,
                1 - (((done * 6) / settings.comboTime) % 1),
                1,
              ),
            );
            rightV.push(
              calcSide(
                12 - i,
                11 - i,
                1 - (((done * 6) / settings.comboTime) % 1),
                1,
              ),
            );
            break;
          }
        }
      }

      if (rightV.length > 0) drawTimerSide(rightV);
      if (leftV.length > 0) drawTimerSide(leftV);
    }

    // ─── GAME OVER CHECK ─────────────────────────────────────

    function isInfringing(): boolean {
      for (let i = 0; i < mainHex.sides; i++) {
        let subTotal = 0;
        for (let j = 0; j < mainHex.blocks[i].length; j++) {
          subTotal += mainHex.blocks[i][j].deleted ? 1 : 0;
        }
        if (mainHex.blocks[i].length - subTotal > settings.rows) {
          return true;
        }
      }
      return false;
    }

    function checkGameOver(): boolean {
      if (isInfringing()) {
        highscores.push(score);
        highscores.sort((a, b) => b - a);
        highscores = highscores.slice(0, 3);
        try {
          localStorage.setItem(
            "hextris_highscores",
            JSON.stringify(highscores),
          );
        } catch {
          /* empty */
        }
        return true;
      }
      return false;
    }

    // ─── UPDATE ──────────────────────────────────────────────

    function update(dt: number) {
      mainHex.dt = dt;

      if (gameState === 1) {
        wgUpdate();
      }

      // 1. Check falling blocks for collision, move inward
      for (let i = 0; i < blocks.length; i++) {
        hexDoesBlockCollide(blocks[i]);
        if (!blocks[i].settled) {
          if (!blocks[i].initializing) {
            blocks[i].distFromHex -=
              blocks[i].iter * dt * settings.scale;
          }
        } else if (!blocks[i].removed) {
          blocks[i].removed = 1;
        }
      }

      // 2. Check settled blocks for matches
      for (let i = 0; i < mainHex.blocks.length; i++) {
        for (let j = 0; j < mainHex.blocks[i].length; j++) {
          if (mainHex.blocks[i][j].checked === 1) {
            consolidateBlocks(i, j);
            mainHex.blocks[i][j].checked = 0;
          }
        }
      }

      // 3. Remove fully deleted blocks
      for (let i = 0; i < mainHex.blocks.length; i++) {
        let lowestDeletedIndex = 99;
        for (let j = 0; j < mainHex.blocks[i].length; j++) {
          if (mainHex.blocks[i][j].deleted === 2) {
            const block = mainHex.blocks[i][j];
            // Spawn a burst of particles at the block's screen position
            const ang = (block.angle * Math.PI) / 180;
            const px =
              trueCanvas.width / 2 +
              Math.sin(ang) * (block.distFromHex + block.height / 2);
            const py =
              trueCanvas.height / 2 -
              Math.cos(ang) * (block.distFromHex + block.height / 2);
            emitParticles(px, py, block.color, 10);
            mainHex.blocks[i].splice(j, 1);
            blockDestroyed();
            piecesCleared++;
            if (mainHex.comboMultiplier > maxComboSeen) {
              maxComboSeen = mainHex.comboMultiplier;
            }
            if (j < lowestDeletedIndex) lowestDeletedIndex = j;
            j--;
          }
        }
        // Unsettle blocks above deleted position
        if (lowestDeletedIndex < mainHex.blocks[i].length) {
          for (let j = lowestDeletedIndex; j < mainHex.blocks[i].length; j++) {
            mainHex.blocks[i][j].settled = 0;
          }
        }
      }

      // 4. Re-check settled blocks and move unsettled inward
      for (let i = 0; i < mainHex.blocks.length; i++) {
        for (let j = 0; j < mainHex.blocks[i].length; j++) {
          const block = mainHex.blocks[i][j];
          hexDoesBlockCollide(block, j, mainHex.blocks[i]);
          if (!mainHex.blocks[i][j].settled) {
            mainHex.blocks[i][j].distFromHex -=
              block.iter * dt * settings.scale;
          }
        }
      }

      // 5. Clean up removed falling blocks
      for (let i = blocks.length - 1; i >= 0; i--) {
        if (blocks[i].removed === 1) {
          blocks.splice(i, 1);
        }
      }

      mainHex.ct += dt;
    }

    // ─── RENDER ──────────────────────────────────────────────

    function render() {
      const boundaryColor = THEME.outerBoundary;

      ctx.clearRect(0, 0, canvas!.width, canvas!.height);

      // Background fill (outside the board)
      ctx.fillStyle = THEME.bgOuter;
      ctx.fillRect(0, 0, trueCanvas.width, trueCanvas.height);

      // Game board (dark, behind everything)
      drawPolygon(
        trueCanvas.width / 2,
        trueCanvas.height / 2,
        6,
        trueCanvas.width / 2,
        30,
        THEME.bg,
        0,
        "rgba(0,0,0,0)",
      );

      // Subtle radial vignette behind the playfield
      const g = ctx.createRadialGradient(
        trueCanvas.width / 2,
        trueCanvas.height / 2,
        settings.hexWidth,
        trueCanvas.width / 2,
        trueCanvas.height / 2,
        Math.max(trueCanvas.width, trueCanvas.height) / 2,
      );
      g.addColorStop(0, "rgba(99,102,241,0.04)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, trueCanvas.width, trueCanvas.height);

      if (
        gameState === 1 ||
        gameState === 2 ||
        gameState === -1 ||
        gameState === 0
      ) {
        if (op < 1) op += 0.01;
        ctx.globalAlpha = op;

        // Outer boundary hexagon
        const outerRadius =
          settings.rows * settings.blockHeight * (2 / Math.sqrt(3)) +
          settings.hexWidth;
        drawPolygon(
          trueCanvas.width / 2,
          trueCanvas.height / 2,
          6,
          outerRadius,
          30,
          boundaryColor,
          1,
          "rgba(255,255,255,0.1)",
        );

        // Combo timer
        drawTimer();

        ctx.globalAlpha = 1;
      }

      // Draw settled blocks
      for (let i = 0; i < mainHex.blocks.length; i++) {
        for (let j = 0; j < mainHex.blocks[i].length; j++) {
          drawBlock(mainHex.blocks[i][j]);
        }
      }

      // Draw falling blocks
      for (let i = 0; i < blocks.length; i++) {
        drawBlock(blocks[i]);
      }

      // Draw particle bursts
      if (particles.length > 0) {
        updateAndDrawParticles(mainHex.dt || 1);
      }

      // Draw center hexagon
      hexDraw();

      // Draw scoreboard (skip on start screen to avoid overlap with title)
      if (gameState === 1 || gameState === -1) {
        if (scoreOpacity < 1) {
          scoreOpacity += 0.01;
        }
        ctx.globalAlpha = scoreOpacity;
        let scoreSize = 50;
        const len = String(score).length;
        if (len >= 7) scoreSize = 35;
        else if (len >= 6) scoreSize = 43;

        renderText(
          trueCanvas.width / 2 + gdx,
          trueCanvas.height / 2 + gdy,
          scoreSize,
          "#fff",
          score,
        );
        ctx.globalAlpha = 1;
      }

      // Draw floating texts
      for (let i = mainHex.texts.length - 1; i >= 0; i--) {
        const t = mainHex.texts[i];
        if (t.alive > 0) {
          ctx.globalAlpha = t.opacity;
          renderText(t.x + gdx, t.y + gdy, 30, t.color, t.text);
          ctx.globalAlpha = 1;
          fadeUpAndOut(t);
        } else {
          mainHex.texts.splice(i, 1);
        }
      }

      // Beginning instructions are now rendered in React (device-aware tutorial overlay).

      // Pause overlay
      if (gameState === -1) {
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = "rgba(5,5,5,0.95)";
        ctx.fillRect(0, 0, trueCanvas.width, trueCanvas.height);
        ctx.globalAlpha = 1;
        renderText(
          trueCanvas.width / 2,
          trueCanvas.height / 2 - 30 * settings.scale,
          60,
          THEME.heading,
          "PAUSED",
        );
        renderText(
          trueCanvas.width / 2,
          trueCanvas.height / 2 + 30 * settings.scale,
          22,
          THEME.muted,
          "Press Space to resume",
        );
      }

      // Game over: dim canvas only (the React overlay handles the card)
      if (gameState === 2) {
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = "rgba(5,5,5,0.85)";
        ctx.fillRect(0, 0, trueCanvas.width, trueCanvas.height);
        ctx.globalAlpha = 1;
      }

      // Start screen overlay
      if (gameState === 0) {
        renderText(
          trueCanvas.width / 2,
          trueCanvas.height / 2 - 25 * settings.scale,
          52,
          THEME.heading,
          "HEXTRIS",
        );
        renderText(
          trueCanvas.width / 2,
          trueCanvas.height / 2 + 20 * settings.scale,
          18,
          "#22c55e",
          "▸ Click to start",
        );
        if (highscores[0]) {
          renderText(
            trueCanvas.width / 2,
            trueCanvas.height / 2 + 55 * settings.scale,
            16,
            THEME.muted,
            "Best  " + highscores[0],
          );
        }
      }

      settings.prevScale = settings.scale;
      settings.hexWidth = settings.baseHexWidth * settings.scale;
      settings.blockHeight = settings.baseBlockHeight * settings.scale;
    }

    // ─── GAME LOOP ───────────────────────────────────────────

    function animLoop() {
      if (destroyedRef.current) return;

      animRef.current = requestAnimationFrame(animLoop);

      const now = Date.now();
      let dt = ((now - lastTime) / 16.666) * rush;
      if (dt > 5) dt = 5; // cap delta to prevent physics explosions

      if (gameState === 1) {
        if (mainHex.delay > 0) {
          mainHex.delay--;
        } else {
          update(dt);
        }

        if (checkGameOver()) {
          gameState = 2;
          // Game-over music jingle is triggered by the uiState effect
          setUiState("gameover");
          setUiScore(score);
          setUiHigh(highscores[0] || 0);
          setUiStats({
            maxCombo: maxComboSeen,
            pieces: piecesCleared,
            seconds: Math.floor((Date.now() - gameStartMs) / 1000),
            difficulty: Math.max(1, Math.floor(waveGen.difficulty)),
          });
        }
      } else if (gameState === 2) {
        update(dt); // continue death animation
      }

      render();

      // Sync score to React state when it changes + trigger HUD pulse
      if (score !== lastSyncedScore) {
        lastSyncedScore = score;
        setUiScore(score);
        setScorePulse((p) => p + 1);
      }

      // Sync combo. Also reset when the combo window has elapsed so the
      // HUD chip goes back to 1 once the timer runs out.
      let currentCombo = mainHex.comboMultiplier;
      if (mainHex.ct - mainHex.lastCombo >= settings.comboTime) {
        currentCombo = 1;
      }
      if (currentCombo !== lastSyncedCombo) {
        // Fire a milestone toast on crossing key thresholds.
        const thresholds = [3, 5, 10, 15, 20];
        for (const t of thresholds) {
          if (currentCombo >= t && lastSyncedCombo < t) {
            const color =
              t >= 20
                ? "#ec4899"
                : t >= 10
                ? "#f59e0b"
                : t >= 5
                ? "#22c55e"
                : "#6366f1";
            setMilestone({ id: Date.now(), text: `×${t} COMBO!`, color });
          }
        }
        lastSyncedCombo = currentCombo;
        setUiCombo(currentCombo);
      }

      // Scale music tempo with difficulty (~every 1s). Base 110 → ~175 BPM
      // at max difficulty 35. Also bumps to x4 when rush/speed-up is held.
      if (gameState === 1 && now - lastTempoSync > 1000) {
        lastTempoSync = now;
        const difficulty = Math.min(35, waveGen.difficulty);
        const base = 105 + difficulty * 2; // 107 → 175
        const rushBoost = rush > 1 ? 1.25 : 1;
        sounds.setMusicTempo(base * rushBoost);
      }

      lastTime = now;

      if (!(gameState === 1 || gameState === 2)) {
        lastTime = Date.now();
      }
    }

    // ─── SCALING ─────────────────────────────────────────────

    function scaleCanvas() {
      const rect = container!.getBoundingClientRect();
      const w = Math.floor(rect.width);
      // Fullscreen: use available container height directly.
      // Portrait (mobile): prefer near-square canvas to maximize play area.
      // Landscape/desktop: cap at 75vh so page remains scrollable.
      let h: number;
      if (document.fullscreenElement === container) {
        h = Math.floor(rect.height);
      } else {
        const isPortrait = window.innerHeight > window.innerWidth;
        if (isPortrait) {
          h = Math.floor(Math.min(w * 1.05, window.innerHeight * 0.75));
        } else {
          h = Math.floor(Math.min(w * 0.7, window.innerHeight * 0.75));
        }
      }
      const dpr = window.devicePixelRatio || 1;

      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      // Reset transform then re-apply DPR scale so multiple scaleCanvas calls
      // don't compound the transform.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);

      trueCanvas = { width: w, height: h };

      const minDim = Math.min(w, h);
      settings.scale = (minDim / 800) * settings.baseScale;
      settings.hexWidth = settings.baseHexWidth * settings.scale;
      settings.blockHeight = settings.baseBlockHeight * settings.scale;
    }

    // ─── INIT ────────────────────────────────────────────────

    function initialize() {
      rush = 1;
      lastTime = Date.now();
      score = 0;
      op = 0;
      scoreOpacity = 0;
      blocks = [];
      gdx = 0;
      gdy = 0;

      mainHex.position = 0;
      mainHex.angle = 30;
      mainHex.targetAngle = 30;
      mainHex.angularVelocity = 0;
      mainHex.sideLength = settings.hexWidth;
      mainHex.ct = 0;
      mainHex.dt = 1;
      mainHex.dy = 0;
      mainHex.blocks = [[], [], [], [], [], []];
      mainHex.texts = [];
      mainHex.shakes = [];
      mainHex.lastCombo = -settings.comboTime;
      mainHex.lastColorScored = "#000";
      mainHex.comboMultiplier = 1;
      mainHex.delay = 15;

      waveGen.lastGen = 0;
      waveGen.nextGen = 2700;
      waveGen.ct = 0;
      waveGen.difficulty = 1;
      waveGen.dt = 0;
      waveGen.last = 0;
      waveGen.currentFunction = wgRandomGeneration;
    }

    function startGame() {
      initialize();
      gameState = 1;
      maxComboSeen = 0;
      piecesCleared = 0;
      gameStartMs = Date.now();
      particles.length = 0;
      lastSyncedCombo = 1;
      sounds.resume(); // Audio contexts require a user gesture to start
      setUiState("playing");
      setUiScore(0);
      setUiCombo(1);
    }

    function restartGame() {
      startGame();
    }

    // Expose restart to the React JSX (for the bottom button)
    restartRef.current = () => restartGame();

    function togglePause() {
      if (gameState === 1) {
        gameState = -1;
        setUiState("paused");
      } else if (gameState === -1) {
        gameState = 1;
        lastTime = Date.now();
        setUiState("playing");
      }
    }

    // ─── INPUT ───────────────────────────────────────────────

    function handleKeyDown(e: KeyboardEvent) {
      if (gameState === 0) {
        startGame();
        return;
      }

      if (gameState === 2) {
        restartGame();
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (gameState === 1) hexRotate(1);
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        e.preventDefault();
        if (gameState === 1) hexRotate(-1);
      }
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        e.preventDefault();
        if (gameState === 1 && !settings.speedUpKeyHeld) {
          settings.speedUpKeyHeld = true;
          rush *= 4;
        }
      }
      if (e.key === " " || e.key === "p" || e.key === "P") {
        e.preventDefault();
        togglePause();
      }
    }

    function handleKeyUp(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") {
        if (settings.speedUpKeyHeld) {
          rush /= 4;
          settings.speedUpKeyHeld = false;
        }
      }
    }

    function handleCanvasClick(e: MouseEvent | TouchEvent) {
      e.preventDefault();

      if (gameState === 0) {
        startGame();
        return;
      }

      if (gameState === 2) {
        restartGame();
        return;
      }

      if (gameState === -1) {
        togglePause();
        return;
      }

      if (gameState !== 1) return;

      // Touch/click rotation
      let clientX: number;
      if ("touches" in e) {
        clientX = e.touches[0]?.clientX ?? e.changedTouches[0]?.clientX ?? 0;
      } else {
        clientX = e.clientX;
      }

      const rect = canvas!.getBoundingClientRect();
      const mid = rect.left + rect.width / 2;
      if (clientX < mid) {
        hexRotate(1);
      } else {
        hexRotate(-1);
      }
    }

    // ─── SETUP ───────────────────────────────────────────────

    scaleCanvas();
    gameState = 0;
    initialize();

    // Set initial high score
    setUiHigh(highscores[0] || 0);

    // Start the loop
    animLoop();

    // Event listeners
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    canvas.addEventListener("click", handleCanvasClick);
    canvas.addEventListener("touchstart", handleCanvasClick, {
      passive: false,
    });

    const resizeObserver = new ResizeObserver(() => {
      scaleCanvas();
    });
    resizeObserver.observe(container);

    // Rescale on fullscreen transitions so the canvas fills the new viewport.
    const onFsChange = () => {
      // Delay by one frame so the browser has laid out the new rect.
      requestAnimationFrame(() => scaleCanvas());
    };
    document.addEventListener("fullscreenchange", onFsChange);

    // Window blur = auto-pause
    function handleBlur() {
      if (gameState === 1) togglePause();
    }
    window.addEventListener("blur", handleBlur);

    // ─── CLEANUP ─────────────────────────────────────────────

    return () => {
      destroyedRef.current = true;
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.removeEventListener("click", handleCanvasClick);
      canvas.removeEventListener("touchstart", handleCanvasClick);
      resizeObserver.disconnect();
      document.removeEventListener("fullscreenchange", onFsChange);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden border border-white/10 bg-[#050505] ${
        isFullscreen ? "h-screen w-screen rounded-none" : "rounded-xl"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="block w-full"
        style={{ touchAction: "none" }}
      />

      {/* HUD — top-left chip. `key` pulse forces a brief scale animation on score change. */}
      <div className="absolute top-3 left-3 flex items-center gap-2 flex-wrap max-w-[calc(100%-140px)]">
        <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-mono text-white/60 backdrop-blur">
          <span className="text-accent-pink/90">SCORE</span>
          <span
            key={scorePulse}
            className="text-white tabular-nums inline-block hextris-score-pulse"
          >
            {uiScore}
          </span>
        </div>
        {uiHigh > 0 && (
          <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-mono text-white/60 backdrop-blur">
            <span className="text-accent-green/90">BEST</span>
            <span className="text-white tabular-nums">{uiHigh}</span>
          </div>
        )}
        {uiCombo > 1 && uiState === "playing" && (
          <div
            key={`combo-${uiCombo}`}
            className="flex items-center gap-1.5 rounded-md border border-accent-amber/40 bg-accent-amber/10 px-2.5 py-1.5 text-xs font-mono text-accent-amber backdrop-blur hextris-combo-pop"
          >
            <span className="opacity-80">COMBO</span>
            <span className="tabular-nums font-bold">×{uiCombo}</span>
          </div>
        )}
      </div>

      {/* Top-right: sound toggle, fullscreen, status badge */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setSoundEnabled((v) => !v)}
          className="flex items-center justify-center rounded-md border border-white/10 bg-black/40 hover:bg-black/60 px-2 py-1.5 text-white/60 hover:text-white backdrop-blur transition-colors"
          aria-label={soundEnabled ? "Mute" : "Unmute"}
          title={soundEnabled ? "Mute" : "Unmute"}
        >
          {soundEnabled ? (
            <Volume2 className="h-3.5 w-3.5" />
          ) : (
            <VolumeX className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="flex items-center justify-center rounded-md border border-white/10 bg-black/40 hover:bg-black/60 px-2 py-1.5 text-white/60 hover:text-white backdrop-blur transition-colors"
          aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        >
          {isFullscreen ? (
            <Minimize2 className="h-3.5 w-3.5" />
          ) : (
            <Maximize2 className="h-3.5 w-3.5" />
          )}
        </button>
        {uiState !== "menu" && (
          <div className="flex items-center gap-1.5 rounded-md border border-white/10 bg-black/40 px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-wider text-white/60 backdrop-blur">
            {uiState === "playing" && (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-accent-green pulse-dot" />
                <span>Live</span>
              </>
            )}
            {uiState === "paused" && (
              <span className="text-accent-amber">Paused</span>
            )}
            {uiState === "gameover" && (
              <span className="text-accent-pink">Over</span>
            )}
          </div>
        )}
      </div>

      {/* Controls bar — bottom. Device-specific hints. */}
      <div className="absolute bottom-0 inset-x-0 border-t border-white/10 bg-black/60 backdrop-blur px-3 py-2 flex items-center justify-center sm:justify-start gap-3 sm:gap-4 text-[11px] font-mono text-white/60 overflow-x-auto">
        {isTouchDevice ? (
          <>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Hand className="h-3.5 w-3.5 -scale-x-100 text-accent-pink" />
              <span>Tap left/right</span>
            </span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <Hand className="h-3.5 w-3.5 text-accent-blue" />
              <span>to rotate</span>
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white">
                ← →
              </kbd>
              <span>Rotate</span>
            </span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white">
                ↓
              </kbd>
              <span>Speed up</span>
            </span>
            <span className="opacity-30">·</span>
            <span className="flex items-center gap-1.5 whitespace-nowrap">
              <kbd className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-white">
                Space
              </kbd>
              <span>Pause</span>
            </span>
          </>
        )}
      </div>

      {/* Unified tutorial overlay — device-aware, icon-based. Shows on the menu screen only. */}
      {showTutorial && uiState === "menu" && (
        <button
          type="button"
          onClick={dismissTutorial}
          className="absolute inset-0 z-10 flex items-end justify-center pb-20 sm:pb-24 px-4 hextris-tutorial-fade"
          aria-label="Dismiss tutorial"
        >
          <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-black/75 backdrop-blur-md px-5 py-4 shadow-2xl pointer-events-none">
            {isTouchDevice ? (
              <div className="flex items-center gap-4 text-white">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-11 w-11 rounded-lg border border-accent-pink/50 bg-accent-pink/10 flex items-center justify-center text-accent-pink">
                    <Hand className="h-5 w-5 -scale-x-100" />
                  </div>
                  <span className="text-[9px] uppercase font-mono text-white/50">
                    Left half
                  </span>
                </div>
                <ArrowLeftRight className="h-4 w-4 text-white/40" />
                <div className="flex flex-col items-center gap-1.5">
                  <div className="h-11 w-11 rounded-lg border border-accent-blue/50 bg-accent-blue/10 flex items-center justify-center text-accent-blue">
                    <Hand className="h-5 w-5" />
                  </div>
                  <span className="text-[9px] uppercase font-mono text-white/50">
                    Right half
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-white">
                <div className="flex flex-col items-center gap-1.5">
                  <kbd className="inline-flex h-9 min-w-[2.5rem] items-center justify-center rounded border border-accent-pink/50 bg-accent-pink/10 px-2 text-accent-pink text-sm font-mono">
                    ←
                  </kbd>
                  <span className="text-[9px] uppercase font-mono text-white/50">
                    Rotate left
                  </span>
                </div>
                <ArrowLeftRight className="h-4 w-4 text-white/40" />
                <div className="flex flex-col items-center gap-1.5">
                  <kbd className="inline-flex h-9 min-w-[2.5rem] items-center justify-center rounded border border-accent-blue/50 bg-accent-blue/10 px-2 text-accent-blue text-sm font-mono">
                    →
                  </kbd>
                  <span className="text-[9px] uppercase font-mono text-white/50">
                    Rotate right
                  </span>
                </div>
              </div>
            )}
            <span className="text-[11px] text-white/50 font-mono mt-1">
              Match 3+ blocks to score
            </span>
          </div>
        </button>
      )}

      {/* Combo milestone burst */}
      {milestone && (
        <div
          key={milestone.id}
          className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 hextris-milestone-burst"
        >
          <div
            className="font-display text-5xl sm:text-6xl font-black tracking-tight text-center"
            style={{
              color: milestone.color,
              textShadow: `0 0 20px ${milestone.color}55, 0 0 40px ${milestone.color}33`,
            }}
          >
            {milestone.text}
          </div>
        </div>
      )}

      {/* Game-over card — React-rendered for interactivity. Dark palette is
          hard-coded so the card renders consistently even in light mode. */}
      {uiState === "gameover" && (
        <div className="absolute inset-0 flex items-center justify-center px-3 sm:px-4 pointer-events-none overflow-auto py-4 z-30">
          <div className="pointer-events-auto w-full max-w-md rounded-2xl border border-white/10 bg-black/90 backdrop-blur-md p-4 sm:p-6 shadow-2xl hextris-gameover-in text-white">
            <div className="text-center">
              <div className="text-[11px] uppercase tracking-widest text-accent-pink mb-2 font-mono">
                Game Over
              </div>
              <div className="font-display text-4xl sm:text-5xl font-black tabular-nums text-white">
                {uiScore}
              </div>
              {uiHigh > 0 && (
                <div className="text-xs text-white/50 mt-1 font-mono">
                  Best <span className="text-accent-green">{uiHigh}</span>
                  {rank !== null && (
                    <>
                      <span className="mx-1.5 opacity-40">·</span>
                      <span>
                        Rank <span className="text-accent-amber">#{rank}</span>
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-2 mt-4 text-center">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] py-2">
                <div className="text-[10px] text-white/50 font-mono uppercase tracking-wider">
                  Max Combo
                </div>
                <div className="text-base font-mono tabular-nums text-accent-amber mt-0.5">
                  ×{uiStats.maxCombo || 1}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] py-2">
                <div className="text-[10px] text-white/50 font-mono uppercase tracking-wider">
                  Cleared
                </div>
                <div className="text-base font-mono tabular-nums text-accent-blue mt-0.5">
                  {uiStats.pieces}
                </div>
              </div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] py-2">
                <div className="text-[10px] text-white/50 font-mono uppercase tracking-wider">
                  Time
                </div>
                <div className="text-base font-mono tabular-nums text-accent-pink mt-0.5">
                  {Math.floor(uiStats.seconds / 60)}:
                  {String(uiStats.seconds % 60).padStart(2, "0")}
                </div>
              </div>
            </div>

            {/* Name + submit */}
            <div className="mt-4 flex items-center gap-2">
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 12))}
                placeholder="Your name"
                maxLength={12}
                className="flex-1 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-accent-pink/60 font-mono"
              />
              <button
                type="button"
                onClick={() => submitScore(playerName)}
                disabled={
                  submitState === "submitting" ||
                  submitState === "submitted" ||
                  !playerName.trim()
                }
                className="rounded-md border border-accent-green/40 bg-accent-green/10 hover:bg-accent-green/20 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 text-xs font-mono text-accent-green transition-colors"
              >
                {submitState === "submitting"
                  ? "..."
                  : submitState === "submitted"
                  ? "Saved"
                  : submitState === "failed"
                  ? "Retry"
                  : "Submit"}
              </button>
            </div>

            {/* Top 8 leaderboard */}
            {leaderboard.length > 0 && (
              <div className="mt-4">
                <div className="text-[10px] uppercase tracking-widest text-white/50 font-mono mb-2 px-1">
                  Top Runs
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] divide-y divide-white/5 overflow-hidden">
                  {leaderboard.slice(0, 8).map((e, i) => {
                    const isYou =
                      rank !== null &&
                      i + 1 === rank &&
                      e.score === uiScore &&
                      e.name.toLowerCase() ===
                        (playerName.trim() || "Player").toLowerCase();
                    return (
                      <div
                        key={`${e.createdAt}-${i}`}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono ${
                          isYou
                            ? "bg-accent-pink/10"
                            : ""
                        }`}
                      >
                        <span className={`w-5 text-right tabular-nums ${isYou ? "text-accent-pink" : "text-white/40"}`}>
                          {i + 1}
                        </span>
                        <span
                          className={`flex-1 truncate ${
                            isYou ? "text-accent-pink font-bold" : "text-white/90"
                          }`}
                        >
                          {e.name}
                        </span>
                        <span className={`tabular-nums ${isYou ? "text-accent-pink" : "text-white/70"}`}>{e.score}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => restartRef.current()}
              className="mt-4 w-full rounded-lg border border-accent-pink/40 bg-accent-pink/10 hover:bg-accent-pink/20 py-2.5 text-sm font-medium text-accent-pink transition-colors"
            >
              Play again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
