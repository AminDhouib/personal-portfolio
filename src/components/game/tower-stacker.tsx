"use client";

import { useEffect, useRef, useState } from "react";

interface ViewportSize {
  w: number;
  h: number;
  dpr: number;
}

type GameState = "menu" | "playing" | "paused" | "game-over";
type GameMode = "classic" | "sudden" | "speedrun";
type BiomeId = "surface" | "clouds" | "atmosphere" | "space" | "void";
type ThemeId = "classic" | "neon" | "gold" | "crystal" | "pixel";

interface Floor {
  x: number;
  width: number;
  y: number;
  height: number;
  hue: number;
  isPerfect: boolean;
  isGolden: boolean;
}

interface ActiveBlock {
  x: number;
  y: number;
  width: number;
  height: number;
  hue: number;
  direction: 1 | -1;
  speed: number;
  isGolden: boolean;
}

interface Particle {
  kind: "dust" | "sparkle" | "debris" | "comboTrail" | "ambient" | "goldShower";
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotSpeed: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  width?: number;
  height?: number;
}

interface GhostFrame {
  floorIndex: number;
  x: number;
  width: number;
  timeMs: number;
}

interface RunRecord {
  floors: GhostFrame[];
  score: number;
  durationMs: number;
}

interface GameRefs {
  state: GameState;
  mode: GameMode;
  score: number;
  hp: number;
  floors: Floor[];
  activeBlock: ActiveBlock | null;
  perfectCombo: number;
  maxCombo: number;
  perfectsCount: number;
  goldenCount: number;
  cameraY: number;
  cameraTargetY: number;
  cameraScale: number;
  cameraTargetScale: number;
  particles: Particle[];
  particleCursor: number;
  biomeIdx: number;
  biomeTransition: number;
  bannerText: string;
  bannerTime: number;
  shake: number;
  slowMo: number;
  runRecord: RunRecord;
  runStartMs: number;
  startedAt: number;
  lastFrame: number;
  droppingLock: boolean;
  ghost: RunRecord | null;
  ghostPassed: boolean;
  achievementsUnlockedThisRun: string[];
  hintsOn: boolean;
  theme: ThemeId;
  seed: number;
  isDailyRun: boolean;
  isSeededRun: boolean;
  milestonesFired: Set<number>;
  prng: () => number;
  ambientCooldown: number;
}

const BASE_BLOCK_HEIGHT = 28;
const BASE_BLOCK_WIDTH_PX = 220;
const BASE_BLOCK_SPEED = 260;
const MAX_BLOCK_SPEED = 820;
const SPEED_FACTOR = 0.8;
const PERFECT_THRESHOLD = 4;
const NEAR_MISS_RATIO = 0.88;
const PARTICLE_MAX = 200;
const BIOME_THRESHOLDS: Record<BiomeId, number> = {
  surface: 0,
  clouds: 15,
  atmosphere: 35,
  space: 60,
  void: 90,
};
const BIOME_ORDER: BiomeId[] = ["surface", "clouds", "atmosphere", "space", "void"];
const HUE_STEP = 6;
const HUE_BASE = 340;
const LS_PREFIX = "tower_stacker_";

export default function TowerStacker() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<ViewportSize>({ w: 800, h: 600, dpr: 1 });
  const [, forceTick] = useState(0);

  const refs = useRef<GameRefs>({
    state: "menu",
    mode: "classic",
    score: 0,
    hp: 3,
    floors: [],
    activeBlock: null,
    perfectCombo: 0,
    maxCombo: 0,
    perfectsCount: 0,
    goldenCount: 0,
    cameraY: 0,
    cameraTargetY: 0,
    cameraScale: 1,
    cameraTargetScale: 1,
    particles: new Array(PARTICLE_MAX).fill(null).map(() => ({
      kind: "dust" as const, x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotSpeed: 0,
      life: 0, maxLife: 1, size: 0, color: "#000",
    })),
    particleCursor: 0,
    biomeIdx: 0,
    biomeTransition: 1,
    bannerText: "",
    bannerTime: 0,
    shake: 0,
    slowMo: 0,
    runRecord: { floors: [], score: 0, durationMs: 0 },
    runStartMs: 0,
    startedAt: 0,
    lastFrame: 0,
    droppingLock: false,
    ghost: null,
    ghostPassed: false,
    achievementsUnlockedThisRun: [],
    hintsOn: true,
    theme: "classic",
    seed: 1,
    isDailyRun: false,
    isSeededRun: false,
    milestonesFired: new Set<number>(),
    prng: Math.random,
    ambientCooldown: 0,
  });

  const [uiState, setUiState] = useState<GameState>("menu");
  const [uiScore, setUiScore] = useState(0);
  const [uiHp, setUiHp] = useState(3);
  const [uiCombo, setUiCombo] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const applySize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(420, Math.min(720, Math.floor(rect.width * 0.9)));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      viewportRef.current = { w, h, dpr };
      forceTick((n) => (n + 1) % 1_000_000);
    };

    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(container);
    window.addEventListener("orientationchange", applySize);
    return () => {
      ro.disconnect();
      window.removeEventListener("orientationchange", applySize);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let rafId = 0;
    let alive = true;

    const frame = (now: number) => {
      if (!alive) return;
      const r = refs.current;
      if (!r.lastFrame) r.lastFrame = now;
      let dt = (now - r.lastFrame) / 1000;
      if (dt > 0.05) dt = 0.05;
      if (r.slowMo > 0) {
        dt *= 0.4;
        r.slowMo = Math.max(0, r.slowMo - (now - r.lastFrame));
      }
      r.lastFrame = now;

      const { w, h } = viewportRef.current;
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0b1220");
      grad.addColorStop(1, "#1f2937");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = "rgba(239,68,68,0.9)";
      ctx.font = "600 22px system-ui, sans-serif";
      ctx.fillText(`state: ${r.state}  dt: ${dt.toFixed(3)}`, 16, 32);

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Suppress unused state lint warnings — wired in Task 4+
  void setUiState;
  void setUiScore;
  void setUiHp;
  void setUiCombo;

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border bg-card"
    >
      <canvas
        ref={canvasRef}
        className="block w-full touch-none select-none"
        style={{ touchAction: "manipulation" }}
        data-ui-state={uiState}
        data-ui-score={uiScore}
        data-ui-hp={uiHp}
        data-ui-combo={uiCombo}
      />
    </div>
  );
}
