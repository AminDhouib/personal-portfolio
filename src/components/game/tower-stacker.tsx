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

function spawnParticle(r: GameRefs, p: Partial<Particle>) {
  const slot = r.particles[r.particleCursor];
  Object.assign(slot, {
    kind: "dust" as const, x: 0, y: 0, vx: 0, vy: 0, rot: 0, rotSpeed: 0,
    life: 0, maxLife: 1, size: 2, color: "#fff", width: undefined, height: undefined,
    ...p,
  });
  r.particleCursor = (r.particleCursor + 1) % PARTICLE_MAX;
}

function updateParticles(r: GameRefs, dt: number) {
  for (const p of r.particles) {
    if (p.life <= 0) continue;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind !== "ambient") p.vy += 900 * dt;
    p.rot += p.rotSpeed * dt;
    p.life -= dt;
  }
}

function drawParticles(r: GameRefs, ctx: CanvasRenderingContext2D) {
  for (const p of r.particles) {
    if (p.life <= 0) continue;
    const alpha = Math.min(1, p.life / p.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.kind === "ambient") {
      const radius = p.size * (p.life / p.maxLife);
      const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      grd.addColorStop(0, p.color);
      grd.addColorStop(1, "transparent");
      ctx.fillStyle = grd;
      ctx.fillRect(p.x - radius, p.y - radius, radius * 2, radius * 2);
    } else if (p.kind === "debris" && p.width && p.height) {
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function spawnAmbient(r: GameRefs, w: number, h: number) {
  const biome = BIOMES[r.biomeIdx].id;
  switch (biome) {
    case "surface":
      spawnParticle(r, {
        kind: "ambient",
        x: -20, y: 80 + r.prng() * 80,
        vx: 40 + r.prng() * 30, vy: 0,
        life: (w + 40) / 60, maxLife: (w + 40) / 60,
        size: 4, color: "#1f2937",
      });
      break;
    case "clouds":
      spawnParticle(r, {
        kind: "ambient",
        x: -60, y: 120 + r.prng() * 100,
        vx: 120, vy: 0,
        life: (w + 60) / 120, maxLife: (w + 60) / 120,
        size: 12, color: "#374151",
        width: 50, height: 10,
      });
      break;
    case "atmosphere":
      spawnParticle(r, {
        kind: "ambient",
        x: w / 2, y: h * 0.3,
        vx: 0, vy: 0,
        life: 3, maxLife: 3, size: 120,
        color: "rgba(56,189,248,0.3)",
      });
      break;
    case "space":
      spawnParticle(r, {
        kind: "ambient",
        x: r.prng() * w, y: -10,
        vx: -200 + r.prng() * -100,
        vy: 400 + r.prng() * 200,
        life: 1.2, maxLife: 1.2, size: 3,
        color: "#fef3c7",
      });
      break;
    case "void":
      spawnParticle(r, {
        kind: "ambient",
        x: r.prng() * w, y: r.prng() * h,
        vx: 0, vy: 0, life: 4, maxLife: 4, size: 80,
        color: "rgba(168,85,247,0.25)",
      });
      break;
  }
}

interface BiomeDef {
  id: BiomeId;
  unlockFloor: number;
  gradient: [string, string];
  label: string;
  parallax: ParallaxLayer[];
}

interface ParallaxLayer {
  speed: number;
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number, offsetY: number) => void;
}

function drawClouds(alpha: number, size: number) {
  return (ctx: CanvasRenderingContext2D, w: number, h: number, oy: number) => {
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    for (let i = 0; i < 6; i++) {
      const x = ((i * w / 6) + (oy * 0.3) % w + w) % w;
      const y = ((i * 80 + oy) % h + h) % h;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.arc(x + size * 0.6, y + 10, size * 0.7, 0, Math.PI * 2);
      ctx.arc(x - size * 0.6, y + 10, size * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

function drawStars(count: number) {
  const seedArr: { x: number; y: number; s: number }[] = [];
  for (let i = 0; i < count; i++) {
    const xr = (Math.sin(i * 127.1) * 43758.5453) % 1;
    const yr = (Math.sin(i * 311.7) * 43758.5453) % 1;
    seedArr.push({
      x: xr < 0 ? xr + 1 : xr,
      y: yr < 0 ? yr + 1 : yr,
      s: Math.abs((Math.sin(i * 71.3) * 100)) % 2 + 0.5,
    });
  }
  return (ctx: CanvasRenderingContext2D, w: number, h: number, oy: number) => {
    ctx.fillStyle = "white";
    for (const s of seedArr) {
      const x = s.x * w;
      const y = ((s.y * h + oy * 0.5) % h + h) % h;
      ctx.fillRect(x, y, s.s, s.s);
    }
  };
}

const BIOMES: BiomeDef[] = [
  {
    id: "surface",
    unlockFloor: 0,
    gradient: ["#7dd3fc", "#4ade80"],
    label: "SURFACE",
    parallax: [
      { speed: 0.1, draw: (ctx, w, h, oy) => {
          ctx.fillStyle = "rgba(30,58,138,0.4)";
          ctx.beginPath();
          const y = h * 0.65 + oy;
          ctx.moveTo(0, y);
          for (let i = 0; i <= 8; i++) ctx.lineTo(i * w / 8, y - 50 + Math.sin(i * 1.7) * 30);
          ctx.lineTo(w, h); ctx.lineTo(0, h);
          ctx.fill();
        } },
      { speed: 0.3, draw: (ctx, w, h, oy) => {
          ctx.fillStyle = "rgba(15,23,42,0.7)";
          const y = h * 0.75 + oy;
          for (let i = 0; i < 12; i++) {
            const x = (i * w / 12);
            const bh = 40 + ((i * 37) % 60);
            ctx.fillRect(x, y - bh, w / 12 - 4, bh);
          }
        } },
      { speed: 0.6, draw: (ctx, w, h, oy) => {
          ctx.fillStyle = "#166534";
          ctx.fillRect(0, h * 0.9 + oy, w, h * 0.1);
        } },
    ],
  },
  {
    id: "clouds",
    unlockFloor: 15,
    gradient: ["#c7d2fe", "#a5b4fc"],
    label: "CLOUDS",
    parallax: [
      { speed: 0.1, draw: drawClouds(0.4, 40) },
      { speed: 0.3, draw: drawClouds(0.6, 60) },
      { speed: 0.6, draw: drawClouds(0.8, 80) },
    ],
  },
  {
    id: "atmosphere",
    unlockFloor: 35,
    gradient: ["#4c1d95", "#1e1b4b"],
    label: "ATMOSPHERE",
    parallax: [
      { speed: 0.1, draw: (ctx, w, h, oy) => {
          ctx.strokeStyle = "rgba(56,189,248,0.3)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(w / 2, h + 800 + oy, 900, 0, Math.PI * 2);
          ctx.stroke();
        } },
      { speed: 0.3, draw: drawStars(40) },
      { speed: 0.6, draw: drawStars(20) },
    ],
  },
  {
    id: "space",
    unlockFloor: 60,
    gradient: ["#0c0a1e", "#1e0a2e"],
    label: "SPACE",
    parallax: [
      { speed: 0.1, draw: drawStars(120) },
      { speed: 0.3, draw: drawStars(60) },
      { speed: 0.6, draw: drawStars(30) },
    ],
  },
  {
    id: "void",
    unlockFloor: 90,
    gradient: ["#000000", "#0a0014"],
    label: "VOID",
    parallax: [
      { speed: 0.1, draw: (ctx, w, h, oy) => {
          const grd = ctx.createRadialGradient(w / 2, h / 2 + oy, 0, w / 2, h / 2 + oy, w);
          grd.addColorStop(0, "rgba(168,85,247,0.3)");
          grd.addColorStop(1, "transparent");
          ctx.fillStyle = grd; ctx.fillRect(0, 0, w, h);
        } },
      { speed: 0.3, draw: drawStars(80) },
      { speed: 0.6, draw: drawStars(40) },
    ],
  },
];

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

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return `${mm}:${ss}.${cs}`;
}

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

  function spawnBlock() {
    const r = refs.current;
    const { w, h } = viewportRef.current;
    const prev = r.floors[r.floors.length - 1];
    const prevWidth = prev ? prev.width : BASE_BLOCK_WIDTH_PX;
    const floorIdx = r.floors.length;
    const hue = (HUE_BASE + floorIdx * HUE_STEP) % 360;
    const fromLeft = (floorIdx % 2) === 0;
    const y = prev ? prev.y - BASE_BLOCK_HEIGHT - 2 : h - 80 - BASE_BLOCK_HEIGHT;
    const speed = Math.min(MAX_BLOCK_SPEED, BASE_BLOCK_SPEED + r.score * SPEED_FACTOR * 0.1);
    r.activeBlock = {
      x: fromLeft ? 0 : w - prevWidth,
      y,
      width: prevWidth,
      height: BASE_BLOCK_HEIGHT,
      hue,
      direction: fromLeft ? 1 : -1,
      speed,
      isGolden: false,
    };
    r.droppingLock = false;
  }

  function dropBlock() {
    const r = refs.current;
    if (r.state !== "playing" || !r.activeBlock || r.droppingLock) return;
    r.droppingLock = true;

    const a = r.activeBlock;
    const prev = r.floors[r.floors.length - 1];
    const overlapL = Math.max(a.x, prev.x);
    const overlapR = Math.min(a.x + a.width, prev.x + prev.width);
    const overlapW = overlapR - overlapL;

    // Complete miss
    if (overlapW <= 0) {
      r.shake = 0.6;
      r.hp -= 1;
      setUiHp(r.hp);
      spawnParticle(r, {
        kind: "debris",
        x: a.x + a.width / 2, y: a.y + a.height / 2,
        vx: a.direction * 120, vy: -40,
        rot: 0, rotSpeed: (Math.random() - 0.5) * 6,
        life: 3, maxLife: 3,
        color: `hsl(${a.hue} 80% 55%)`,
        width: a.width, height: a.height,
      });
      r.perfectCombo = 0;
      setUiCombo(0);
      r.activeBlock = null;
      if (r.mode !== "classic" || r.hp <= 0) {
        endRun();
      } else {
        setTimeout(() => spawnBlock(), 400);
      }
      return;
    }

    // Perfect detection
    const offset = Math.abs(a.x - prev.x);
    const isPerfect = offset < PERFECT_THRESHOLD;

    let newWidth: number;
    let newX: number;
    if (isPerfect) {
      newWidth = prev.width;
      newX = prev.x;
      r.perfectCombo += 1;
      r.perfectsCount += 1;
      r.maxCombo = Math.max(r.maxCombo, r.perfectCombo);
      for (let i = 0; i < 12; i++) {
        spawnParticle(r, {
          kind: "sparkle",
          x: a.x + a.width / 2, y: a.y,
          vx: (Math.random() - 0.5) * 240, vy: -Math.random() * 280 - 60,
          life: 0.9, maxLife: 0.9,
          size: 3, color: "#fde047",
        });
      }
    } else {
      newWidth = overlapW;
      newX = overlapL;
      const chopLeft = a.x < prev.x;
      const chopX = chopLeft ? a.x : prev.x + prev.width;
      const chopW = a.width - overlapW;
      spawnParticle(r, {
        kind: "debris",
        x: chopX + chopW / 2,
        y: a.y + a.height / 2,
        vx: (chopLeft ? -1 : 1) * 180,
        vy: -40,
        rot: 0, rotSpeed: (Math.random() - 0.5) * 4,
        life: 3, maxLife: 3,
        color: `hsl(${a.hue} 80% 55%)`,
        width: chopW, height: a.height,
      });
      for (let i = 0; i < 7; i++) {
        spawnParticle(r, {
          kind: "dust",
          x: newX + Math.random() * newWidth,
          y: a.y,
          vx: (Math.random() - 0.5) * 100, vy: -Math.random() * 120,
          life: 0.5, maxLife: 0.5, size: 2, color: "rgba(255,255,255,0.6)",
        });
      }
      r.perfectCombo = 0;
    }

    r.floors.push({
      x: newX, y: a.y, width: newWidth, height: a.height,
      hue: a.hue, isPerfect, isGolden: a.isGolden,
    });

    const top = r.floors[r.floors.length - 1];
    const { h: vh } = viewportRef.current;
    r.cameraTargetY = Math.max(0, (vh - 80) - (top.y + top.height * 0.5) - vh * 0.1);
    const tProg = Math.min(1, r.floors.length / 50);
    r.cameraTargetScale = 1 - 0.25 * tProg;

    const fc = r.floors.length - 1;
    if ((fc === 50 || fc === 100) && !r.milestonesFired.has(fc)) {
      r.milestonesFired.add(fc);
      r.cameraTargetScale = 0.3;
      r.bannerText = fc === 50 ? "HALFWAY — floor 50!" : "APEX — floor 100!";
      r.bannerTime = 1.5;
      setTimeout(() => {
        const tProg2 = Math.min(1, r.floors.length / 50);
        r.cameraTargetScale = 1 - 0.25 * tProg2;
      }, 1500);
    }

    const floorsCount = r.floors.length - 1;
    for (let i = BIOME_ORDER.length - 1; i > r.biomeIdx; i--) {
      const b = BIOMES[i];
      if (floorsCount >= b.unlockFloor) {
        r.biomeIdx = i;
        r.biomeTransition = 0;
        r.bannerText = `${b.label} REACHED`;
        r.bannerTime = 2.0;
        break;
      }
    }

    r.runRecord.floors.push({
      floorIndex: r.floors.length - 1, x: newX, width: newWidth,
      timeMs: performance.now() - r.runStartMs,
    });

    let pts = isPerfect ? 50 : 25;
    if (isPerfect && r.perfectCombo >= 3) pts += 25 * (r.perfectCombo - 2);
    if (a.isGolden) pts *= 2;
    r.score += pts;
    setUiScore(r.score);
    setUiCombo(r.perfectCombo);

    r.activeBlock = null;
    setTimeout(() => spawnBlock(), 180);
  }

  function endRun() {
    const r = refs.current;
    r.state = "game-over";
    r.runRecord.score = r.score;
    r.runRecord.durationMs = performance.now() - r.runStartMs;
    setUiState("game-over");
  }

  function togglePause() {
    const r = refs.current;
    if (r.state === "playing") { r.state = "paused"; setUiState("paused"); }
    else if (r.state === "paused") { r.state = "playing"; setUiState("playing"); }
  }

  function startRun() {
    const r = refs.current;
    const { w, h } = viewportRef.current;
    r.state = "playing";
    r.score = 0;
    r.hp = r.mode === "classic" ? 3 : 1;
    r.floors = [];
    r.perfectCombo = 0;
    r.maxCombo = 0;
    r.perfectsCount = 0;
    r.goldenCount = 0;
    r.cameraY = 0;
    r.cameraTargetY = 0;
    r.cameraScale = 1;
    r.cameraTargetScale = 1;
    r.biomeIdx = 0;
    r.biomeTransition = 1;
    r.shake = 0;
    r.slowMo = 0;
    r.runStartMs = performance.now();
    r.droppingLock = false;
    r.ghostPassed = false;
    r.achievementsUnlockedThisRun = [];
    r.runRecord = { floors: [], score: 0, durationMs: 0 };
    r.milestonesFired = new Set();
    r.ambientCooldown = 0;
    // Place base plate (future tasks will enhance with actual block spawning)
    r.floors.push({
      x: w / 2 - BASE_BLOCK_WIDTH_PX / 2,
      y: h - 80,
      width: BASE_BLOCK_WIDTH_PX,
      height: BASE_BLOCK_HEIGHT,
      hue: HUE_BASE,
      isPerfect: true,
      isGolden: false,
    });
    setUiState("playing");
    setUiScore(0);
    setUiHp(r.hp);
    setUiCombo(0);
    spawnBlock();
  }

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
      const biome = BIOMES[r.biomeIdx];
      if (r.biomeTransition < 1 && r.biomeIdx > 0) {
        const prevB = BIOMES[r.biomeIdx - 1];
        const prevGrad = ctx.createLinearGradient(0, 0, 0, h);
        prevGrad.addColorStop(0, prevB.gradient[0]);
        prevGrad.addColorStop(1, prevB.gradient[1]);
        ctx.fillStyle = prevGrad;
        ctx.fillRect(0, 0, w, h);
        ctx.save();
        ctx.globalAlpha = r.biomeTransition;
      }
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, biome.gradient[0]);
      grad.addColorStop(1, biome.gradient[1]);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      if (r.biomeTransition < 1 && r.biomeIdx > 0) {
        ctx.restore();
      }

      for (const layer of biome.parallax) {
        layer.draw(ctx, w, h, -r.cameraY * layer.speed);
      }

      // update active block
      if (r.state === "playing" && r.activeBlock) {
        const a = r.activeBlock;
        a.x += a.direction * a.speed * dt;
        if (a.x <= 0) { a.x = 0; a.direction = 1; }
        if (a.x + a.width >= w) { a.x = w - a.width; a.direction = -1; }
      }

      if (r.state === "playing") {
        r.ambientCooldown -= dt;
        if (r.ambientCooldown <= 0) {
          r.ambientCooldown = 5 + r.prng() * 6;
          spawnAmbient(r, w, h);
        }
      }

      updateParticles(r, dt);

      // camera lerp
      r.cameraY += (r.cameraTargetY - r.cameraY) * Math.min(1, dt * 6);
      r.cameraScale += (r.cameraTargetScale - r.cameraScale) * Math.min(1, dt * 4);

      r.biomeTransition = Math.min(1, r.biomeTransition + dt / 1.2);
      if (r.bannerTime > 0) r.bannerTime = Math.max(0, r.bannerTime - dt);

      ctx.save();
      const shakeX = r.shake > 0 ? (Math.random() - 0.5) * r.shake * 20 : 0;
      const shakeY = r.shake > 0 ? (Math.random() - 0.5) * r.shake * 20 : 0;
      if (r.shake > 0) r.shake = Math.max(0, r.shake - dt * 2);
      ctx.translate(w / 2 + shakeX, h / 2 + shakeY);
      ctx.scale(r.cameraScale, r.cameraScale);
      ctx.translate(-w / 2, -h / 2 - r.cameraY);

      // draw floors
      for (const f of r.floors) {
        ctx.fillStyle = `hsl(${f.hue} 80% 55%)`;
        ctx.fillRect(f.x, f.y, f.width, f.height);
      }

      drawParticles(r, ctx);

      // draw active block
      if (r.activeBlock) {
        const a = r.activeBlock;
        ctx.fillStyle = `hsl(${a.hue} 80% 55%)`;
        ctx.fillRect(a.x, a.y, a.width, a.height);
      }

      ctx.restore();

      if (r.bannerTime > 0) {
        const alpha = Math.min(1, r.bannerTime / 0.4);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(0, 60, w, 56);
        ctx.fillStyle = "white";
        ctx.font = "700 24px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(r.bannerText, w / 2, 96);
        ctx.textAlign = "start";
        ctx.restore();
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => {
      alive = false;
      cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    if (uiState !== "playing" || refs.current.mode !== "speedrun") return;
    const id = window.setInterval(() => forceTick((n) => (n + 1) % 1_000_000), 100);
    return () => window.clearInterval(id);
  }, [uiState]);

  useEffect(() => {
    try {
      const m = localStorage.getItem(LS_PREFIX + "mode") as GameMode | null;
      if (m === "classic" || m === "sudden" || m === "speedrun") refs.current.mode = m;
      const h = localStorage.getItem(LS_PREFIX + "hints");
      if (h !== null) refs.current.hintsOn = h === "true";
      const t = localStorage.getItem(LS_PREFIX + "theme") as ThemeId | null;
      if (t === "classic" || t === "neon" || t === "gold" || t === "crystal" || t === "pixel") {
        refs.current.theme = t;
      }
    } catch {}
    forceTick((n) => (n + 1) % 1_000_000);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "Enter" || e.code === "ArrowDown") {
        e.preventDefault();
        dropBlock();
      } else if (e.code === "KeyP" || e.code === "Escape") {
        e.preventDefault();
        togglePause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden rounded-xl border border-border bg-card"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={(e) => { e.preventDefault(); dropBlock(); }}
        className="block w-full touch-none select-none"
        style={{ touchAction: "manipulation" }}
      />

      {(uiState === "playing" || uiState === "paused") && (
        <div className="pointer-events-none absolute inset-0 p-4 flex flex-col gap-2 text-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-3xl font-bold leading-none tracking-tight font-mono">
                {refs.current.mode === "speedrun"
                  ? formatTime(performance.now() - refs.current.runStartMs)
                  : uiScore.toLocaleString()}
              </div>
              {uiCombo >= 2 && (
                <div className={`text-sm mt-1 font-semibold ${uiCombo >= 5 ? "text-red-400 animate-pulse" : "text-amber-300"}`}>
                  {uiCombo}× COMBO
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {refs.current.mode === "classic" && (
                <div className="flex gap-1">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <svg key={i} width="22" height="22" viewBox="0 0 24 24" fill={i < uiHp ? "#ef4444" : "#4b5563"}>
                      <path d="M12 21s-7-5.2-9.3-9.1C1 8.5 2.5 4.5 6 4c2 0 3.5 1 4 2 .5-1 2-2 4-2 3.5.5 5 4.5 3.3 7.9C19 15.8 12 21 12 21z" />
                    </svg>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {uiState === "menu" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-6">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-neutral-900/90 p-6 shadow-[0_0_60px_-10px_rgba(239,68,68,0.5)]">
            <h2 className="text-3xl font-bold text-red-400 mb-1">Tower Stacker</h2>
            <p className="text-sm text-neutral-400 mb-5">Time the drop. Keep the tower alive.</p>

            <div className="space-y-3 mb-5">
              <div>
                <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Mode</div>
                <div className="grid grid-cols-3 gap-2">
                  {(["classic", "sudden", "speedrun"] as GameMode[]).map((m) => (
                    <button
                      key={m}
                      onClick={() => {
                        refs.current.mode = m;
                        try { localStorage.setItem(LS_PREFIX + "mode", m); } catch {}
                        forceTick((n) => (n + 1) % 1_000_000);
                      }}
                      className={`rounded-lg px-3 py-2 text-sm border transition ${
                        refs.current.mode === m
                          ? "border-red-500 bg-red-500/15 text-red-200"
                          : "border-neutral-700 bg-neutral-800/60 text-neutral-300 hover:border-neutral-500"
                      }`}
                    >
                      {m === "classic" ? "Classic" : m === "sudden" ? "Sudden" : "Speedrun"}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  checked={refs.current.hintsOn}
                  onChange={(e) => {
                    refs.current.hintsOn = e.target.checked;
                    try { localStorage.setItem(LS_PREFIX + "hints", String(e.target.checked)); } catch {}
                    forceTick((n) => (n + 1) % 1_000_000);
                  }}
                />
                Landing hints (dashed projection)
              </label>
            </div>

            <button
              onClick={() => startRun()}
              className="w-full rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold py-3 text-lg shadow-lg shadow-red-900/30 transition"
            >
              START
            </button>

            <p className="text-xs text-neutral-500 mt-4 text-center">
              Tap, click, or press Space / Enter to drop.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
