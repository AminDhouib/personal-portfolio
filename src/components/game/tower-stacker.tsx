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

function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}
const BASE32 = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function seedToShort(seed: number): string {
  let s = "";
  let n = seed >>> 0;
  for (let i = 0; i < 6; i++) { s += BASE32[n & 0x1f]; n >>>= 5; }
  return s;
}
function shortToSeed(short: string): number {
  let n = 0;
  for (let i = short.length - 1; i >= 0; i--) {
    const idx = BASE32.indexOf(short[i]);
    if (idx < 0) return 1;
    n = (n << 5) | idx;
  }
  return n >>> 0;
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

function drawBlockWithTheme(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, bw: number, bh: number,
  hue: number, theme: ThemeId, isGolden: boolean,
) {
  if (isGolden) {
    const g = ctx.createLinearGradient(x, y, x, y + bh);
    g.addColorStop(0, "#fde047"); g.addColorStop(1, "#b45309");
    ctx.fillStyle = g;
    ctx.shadowBlur = 16; ctx.shadowColor = "#fbbf24";
    ctx.fillRect(x, y, bw, bh);
    ctx.shadowBlur = 0;
    return;
  }
  switch (theme) {
    case "neon": {
      ctx.shadowBlur = 12;
      ctx.shadowColor = `hsl(${hue} 90% 60%)`;
      ctx.fillStyle = `hsl(${hue} 95% 55%)`;
      ctx.fillRect(x, y, bw, bh);
      ctx.shadowBlur = 0;
      return;
    }
    case "gold": {
      const g = ctx.createLinearGradient(x, y, x, y + bh);
      g.addColorStop(0, "#fef3c7"); g.addColorStop(0.4, "#facc15"); g.addColorStop(1, "#92400e");
      ctx.fillStyle = g; ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(x, y + 2, bw, 3);
      return;
    }
    case "crystal": {
      ctx.fillStyle = `hsla(${hue}, 85%, 70%, 0.45)`;
      ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = `hsla(${hue}, 90%, 85%, 0.9)`;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, bw - 1, bh - 1);
      return;
    }
    case "pixel": {
      const grid = 6;
      for (let gx = 0; gx < bw; gx += grid) {
        for (let gy = 0; gy < bh; gy += grid) {
          const jitter = ((gx * 17 + gy * 31) % 8) - 4;
          ctx.fillStyle = `hsl(${hue + jitter} 80% ${50 + (gy / bh) * 10}%)`;
          ctx.fillRect(x + gx, y + gy, grid, grid);
        }
      }
      return;
    }
    case "classic":
    default: {
      const g = ctx.createLinearGradient(x, y, x, y + bh);
      g.addColorStop(0, `hsl(${hue} 85% 65%)`);
      g.addColorStop(1, `hsl(${hue} 80% 45%)`);
      ctx.fillStyle = g;
      ctx.fillRect(x, y, bw, bh);
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(x, y + bh - 3, bw, 3);
    }
  }
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  r: GameRefs,
  w: number,
  h: number,
  onPass: () => void,
) {
  if (!r.ghost || r.ghost.floors.length === 0 || r.mode === "speedrun") return;
  const elapsed = performance.now() - r.runStartMs;
  const visible = r.ghost.floors.filter((f) => f.timeMs <= elapsed);
  if (visible.length === 0) return;
  ctx.save();
  ctx.globalAlpha = 0.3;
  const stripX = 8;
  const stripW = 32;
  const totalFloors = r.ghost.floors.length;
  const towerH = totalFloors * BASE_BLOCK_HEIGHT;
  const scale = Math.min(1, (h - 100) / Math.max(1, towerH));
  for (const f of visible) {
    const yPos = h - 80 - f.floorIndex * BASE_BLOCK_HEIGHT * scale;
    ctx.fillStyle = `hsl(${(HUE_BASE + f.floorIndex * HUE_STEP) % 360} 60% 55%)`;
    ctx.fillRect(stripX, yPos, stripW, BASE_BLOCK_HEIGHT * scale * 0.95);
  }
  ctx.restore();

  if (!r.ghostPassed && r.floors.length - 1 > totalFloors) {
    r.ghostPassed = true;
    onPass();
  }
}

function fireMilestone(r: GameRefs, floor: number) {
  if (floor === 40) { r.bannerText = "LIGHTNING"; r.bannerTime = 0.8; r.shake = 0.5; }
  if (floor === 60) { r.bannerText = "RADIANCE"; r.bannerTime = 0.8; }
  if (floor === 80) { r.bannerText = "RIFT"; r.bannerTime = 0.8; r.shake = 0.8; }
}

function drawLightning(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  let x = w * 0.3, y = 0;
  while (y < h) {
    ctx.moveTo(x, y);
    x += (Math.random() - 0.5) * 40;
    y += 30 + Math.random() * 20;
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}
function drawRadiance(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(0, 0, w, h);
}
function drawRift(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.strokeStyle = "rgba(239,68,68,0.8)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.moveTo(w / 2, h / 2);
    ctx.lineTo(w / 2 + Math.cos(i * Math.PI / 3) * w, h / 2 + Math.sin(i * Math.PI / 3) * h);
    ctx.stroke();
  }
  ctx.restore();
}

interface AchievementDef {
  id: string;
  name: string;
  description: string;
  check: (r: GameRefs) => boolean;
}

const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_tower", name: "First Tower", description: "Complete any run", check: () => true },
  { id: "architect", name: "The Architect", description: "Reach floor 50", check: (r) => r.floors.length - 1 >= 50 },
  { id: "atlas", name: "Atlas", description: "Reach floor 100", check: (r) => r.floors.length - 1 >= 100 },
  { id: "perfectionist", name: "Perfectionist", description: "10 consecutive perfects", check: (r) => r.maxCombo >= 10 },
  { id: "virtuoso", name: "Virtuoso", description: "20 consecutive perfects", check: (r) => r.maxCombo >= 20 },
  { id: "golden_touch", name: "Golden Touch", description: "Land 5 golden blocks in one run", check: (r) => r.goldenCount >= 5 },
  { id: "void_walker", name: "Void Walker", description: "Reach the Void biome (floor 90)", check: (r) => r.biomeIdx >= 4 },
  { id: "daily_devotee", name: "Daily Devotee", description: "Play daily runs on 7 different days", check: () => false },
  { id: "ghost_buster", name: "Ghost Buster", description: "Pass your ghost run", check: (r) => r.ghostPassed },
  { id: "speed_demon", name: "Speed Demon", description: "Finish Speedrun in < 60s", check: (r) =>
      r.mode === "speedrun" && r.floors.length - 1 >= 50 && r.runRecord.durationMs < 60_000 },
];

function unlockThemes(r: GameRefs) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + "themes");
    const owned = new Set<ThemeId>(raw ? JSON.parse(raw) : ["classic"]);
    owned.add("classic");
    if (r.score >= 3000) owned.add("neon");
    if (r.score >= 8000) owned.add("gold");
    if (r.score >= 15000) owned.add("crystal");
    const runs = Number(localStorage.getItem(LS_PREFIX + "total_runs") || "0");
    if (runs >= 50) owned.add("pixel");
    localStorage.setItem(LS_PREFIX + "themes", JSON.stringify([...owned]));
  } catch {}
}

function checkAchievements(r: GameRefs): string[] {
  try {
    const raw = localStorage.getItem(LS_PREFIX + "achievements");
    const owned = new Set<string>(raw ? JSON.parse(raw) : []);
    const newlyUnlocked: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (!owned.has(a.id) && a.check(r)) {
        owned.add(a.id);
        newlyUnlocked.push(a.id);
      }
    }
    // Daily Devotee — tracked separately
    if (r.isDailyRun) {
      const datesRaw = localStorage.getItem(LS_PREFIX + "daily_dates");
      const dates = new Set<string>(datesRaw ? JSON.parse(datesRaw) : []);
      const today = new Date().toISOString().slice(0, 10);
      dates.add(today);
      localStorage.setItem(LS_PREFIX + "daily_dates", JSON.stringify([...dates]));
      if (dates.size >= 7 && !owned.has("daily_devotee")) {
        owned.add("daily_devotee");
        newlyUnlocked.push("daily_devotee");
      }
    }
    localStorage.setItem(LS_PREFIX + "achievements", JSON.stringify([...owned]));
    return newlyUnlocked;
  } catch {
    return [];
  }
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");
  return `${mm}:${ss}.${cs}`;
}

async function generateShareCard(r: GameRefs): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const c = canvas.getContext("2d");
  if (!c) return null;

  const b = BIOMES[r.biomeIdx];
  const g = c.createLinearGradient(0, 0, 0, 630);
  g.addColorStop(0, b.gradient[0]);
  g.addColorStop(1, b.gradient[1]);
  c.fillStyle = g;
  c.fillRect(0, 0, 1200, 630);
  c.fillStyle = "rgba(0,0,0,0.4)";
  c.fillRect(0, 0, 1200, 630);

  const towerW = 400;
  const towerH = 500;
  const towerX = 80;
  const towerY = 80;
  const floorsN = r.floors.length - 1;
  const pixPerFloor = Math.max(2, Math.min(18, towerH / Math.max(1, floorsN)));
  for (let i = 0; i < floorsN; i++) {
    const f = r.floors[i + 1];
    if (!f) continue;
    const hue = (HUE_BASE + i * HUE_STEP) % 360;
    const scale = 0.5 + (f.width / BASE_BLOCK_WIDTH_PX) * 0.5;
    c.fillStyle = `hsl(${hue} 80% 60%)`;
    const ww = towerW * scale;
    c.fillRect(towerX + (towerW - ww) / 2, towerY + towerH - (i + 1) * pixPerFloor, ww, pixPerFloor * 0.9);
  }

  c.fillStyle = "#fff";
  c.font = "bold 160px system-ui, sans-serif";
  c.fillText(r.score.toLocaleString(), 560, 260);

  c.font = "600 40px system-ui, sans-serif";
  c.fillStyle = "#fca5a5";
  c.fillText(`Floor ${floorsN}`, 560, 320);

  c.fillStyle = "#d1d5db";
  c.font = "500 28px system-ui, sans-serif";
  c.fillText(`Combo ${r.maxCombo}× · ${r.perfectsCount} perfects · ${r.goldenCount} golden`, 560, 370);

  c.fillStyle = "#ef4444";
  c.font = "bold 36px system-ui, sans-serif";
  c.fillText("TOWER STACKER", 80, 590);
  c.fillStyle = "#d1d5db";
  c.font = "400 24px system-ui, sans-serif";
  c.fillText("amin.dev/games", 820, 590);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((bb) => resolve(bb), "image/png");
  });
}

function SpeakerOn() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm12 2a4 4 0 0 0-2-3.5v7a4 4 0 0 0 2-3.5z"/></svg>; }
function SpeakerOff() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2l2.5 2.5-1 1-2.5-2.5-2.5 2.5-1-1 2.5-2.5-2.5-2.5 1-1 2.5 2.5 2.5-2.5 1 1-2.5 2.5z"/></svg>; }

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-neutral-500 uppercase">{label}</div>
      <div className="text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function AchievementsStrip() {
  const [owned, setOwned] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + "achievements");
      setOwned(new Set(raw ? JSON.parse(raw) : []));
    } catch {}
  }, []);
  return (
    <div className="mt-5">
      <div className="text-xs uppercase tracking-wider text-neutral-500 mb-2">Achievements</div>
      <div className="grid grid-cols-5 gap-2">
        {ACHIEVEMENTS.map((a) => (
          <div
            key={a.id}
            title={`${a.name}\n${a.description}`}
            className={`aspect-square rounded-lg border flex items-center justify-center text-[10px] text-center px-1 ${
              owned.has(a.id)
                ? "border-amber-500 bg-amber-500/10 text-amber-300"
                : "border-neutral-700 bg-neutral-800/60 text-neutral-600"
            }`}
          >
            {a.name.split(" ")[0]}
          </div>
        ))}
      </div>
    </div>
  );
}

const THEMES: { id: ThemeId; name: string; requirement: string }[] = [
  { id: "classic", name: "Classic", requirement: "Default" },
  { id: "neon", name: "Neon", requirement: "Score 3000" },
  { id: "gold", name: "Gold", requirement: "Score 8000" },
  { id: "crystal", name: "Crystal", requirement: "Score 15000" },
  { id: "pixel", name: "Pixel", requirement: "50 runs" },
];

function ThemePicker({ active, onChange }: { active: ThemeId; onChange: (t: ThemeId) => void }) {
  const [owned, setOwned] = useState<Set<ThemeId>>(new Set(["classic"]));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_PREFIX + "themes");
      setOwned(new Set(raw ? JSON.parse(raw) : ["classic"]));
    } catch {}
  }, []);
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Theme</div>
      <div className="grid grid-cols-5 gap-2">
        {THEMES.map((t) => {
          const unlocked = owned.has(t.id);
          return (
            <button
              key={t.id}
              disabled={!unlocked}
              onClick={() => unlocked && onChange(t.id)}
              title={unlocked ? t.name : `Locked: ${t.requirement}`}
              className={`rounded-lg px-2 py-3 text-xs border ${
                active === t.id ? "border-red-500 bg-red-500/15 text-red-200"
                : unlocked ? "border-neutral-600 bg-neutral-800/60 text-neutral-300 hover:border-neutral-400"
                : "border-neutral-800 bg-neutral-900 text-neutral-600 cursor-not-allowed"
              }`}
            >
              {t.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface LbEntry { name: string; score: number; level: number; region?: string; }

function LeaderboardModal({ runRefs, onClose }: { runRefs: GameRefs; onClose: () => void }) {
  const [name, setName] = useState(() => {
    try { return localStorage.getItem(LS_PREFIX + "player_name") || "Builder"; } catch { return "Builder"; }
  });
  const [entries, setEntries] = useState<LbEntry[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [rank, setRank] = useState<number | null>(null);

  const gameSlug = runRefs.isDailyRun
    ? `tower-stacker-daily-${new Date().toISOString().slice(0, 10)}`
    : runRefs.isSeededRun
    ? "tower-stacker-seeded"
    : "tower-stacker";

  useEffect(() => {
    fetch(`/api/leaderboard?game=${encodeURIComponent(gameSlug)}`)
      .then((r) => r.json())
      .then((d: { entries: LbEntry[] }) => setEntries(d.entries || []))
      .catch(() => setEntries([]));
  }, [gameSlug]);

  async function submit() {
    try {
      localStorage.setItem(LS_PREFIX + "player_name", name);
    } catch {}
    const body = {
      name,
      score:
        runRefs.mode === "speedrun" && runRefs.floors.length - 1 >= 50
          ? Math.max(0, 1_000_000 - Math.floor(runRefs.runRecord.durationMs))
          : runRefs.score,
      level: Math.max(1, runRefs.floors.length - 1),
      seconds: Math.floor(runRefs.runRecord.durationMs / 1000),
      kills: runRefs.perfectsCount,
      distance: runRefs.goldenCount,
      region: runRefs.mode,
      game: gameSlug,
    };
    try {
      const res = await fetch(`/api/leaderboard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      setRank(typeof d.rank === "number" ? d.rank : null);
      setSubmitted(true);
      const res2 = await fetch(`/api/leaderboard?game=${encodeURIComponent(gameSlug)}`);
      const d2: { entries: LbEntry[] } = await res2.json();
      setEntries(d2.entries || []);
    } catch {
      setSubmitted(true);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-red-500/40 bg-neutral-900/95 p-5">
        <h3 className="text-xl font-bold text-red-400 mb-3">
          Leaderboard — {gameSlug.replace(/^tower-stacker-?/, "") || "All-Time"}
        </h3>
        {!submitted && (
          <div className="flex gap-2 mb-4">
            <input
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 12))}
              maxLength={12}
              className="flex-1 rounded-lg bg-neutral-800 border border-neutral-700 px-3 py-2 text-white"
            />
            <button onClick={submit} className="rounded-lg bg-red-600 hover:bg-red-500 text-white px-4 font-semibold">
              Submit
            </button>
          </div>
        )}
        {submitted && rank != null && (
          <div className="mb-3 text-amber-300 font-semibold">Rank #{rank}</div>
        )}
        <div className="max-h-[50vh] overflow-auto divide-y divide-neutral-800">
          {entries.map((e, i) => (
            <div key={i} className="flex items-center justify-between py-1.5 text-sm text-neutral-200">
              <span>
                {i + 1}. {e.name}{" "}
                {e.region && <span className="text-neutral-500 text-xs">{e.region}</span>}
              </span>
              <span>
                {e.score.toLocaleString()} · fl {e.level}
              </span>
            </div>
          ))}
          {entries.length === 0 && (
            <div className="py-4 text-center text-neutral-500 text-sm">No entries yet — be the first!</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-lg bg-neutral-700 hover:bg-neutral-600 text-white py-2"
        >
          Close
        </button>
      </div>
    </div>
  );
}

export default function TowerStacker({ initialSeed }: { initialSeed?: string } = {}) {
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
  const [toasts, setToasts] = useState<string[]>([]);
  const [lbModalOpen, setLbModalOpen] = useState(false);

  interface AudioHandle {
    ctx: AudioContext;
    master: GainNode;
  }
  const audioRef = useRef<AudioHandle | null>(null);
  const [soundOn, setSoundOn] = useState(true);

  function ensureAudio(): AudioHandle | null {
    if (audioRef.current) return audioRef.current;
    try {
      const AC: typeof AudioContext = window.AudioContext
        || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const master = ctx.createGain();
      master.gain.value = soundOn ? 0.4 : 0;
      master.connect(ctx.destination);
      audioRef.current = { ctx, master };
      return audioRef.current;
    } catch { return null; }
  }

  function playTone(freq: number, wave: OscillatorType, duration: number, gain = 1, attack = 0.01) {
    const h = ensureAudio();
    if (!h) return;
    const t = h.ctx.currentTime;
    const o = h.ctx.createOscillator();
    const g = h.ctx.createGain();
    o.type = wave;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    o.connect(g); g.connect(h.master);
    o.start(t); o.stop(t + duration + 0.02);
  }

  function playNoise(duration: number, gain = 0.6) {
    const h = ensureAudio();
    if (!h) return;
    const bufferSize = Math.floor(h.ctx.sampleRate * duration);
    const buffer = h.ctx.createBuffer(1, bufferSize, h.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = h.ctx.createBufferSource();
    src.buffer = buffer;
    const g = h.ctx.createGain();
    g.gain.value = gain;
    src.connect(g); g.connect(h.master);
    src.start();
  }

  function playLand() { playTone(131, "triangle", 0.15, 0.5); }
  function playPerfect(combo: number) {
    const semi = Math.min(combo, 24);
    const freq = 261.63 * Math.pow(2, semi / 12);
    playTone(freq, "sine", 0.25, 0.5);
  }
  function playMiss() {
    playTone(110, "sawtooth", 0.3, 0.45);
    playTone(82, "sawtooth", 0.3, 0.35);
  }
  function playGolden() {
    playTone(523, "sine", 0.3, 0.5);
    setTimeout(() => playTone(784, "sine", 0.4, 0.5), 80);
  }
  function playBiome() {
    playTone(261, "sine", 0.5, 0.35);
    playTone(349, "sine", 0.5, 0.35);
    playTone(392, "sine", 0.5, 0.35);
  }
  function playUi() { playTone(440, "square", 0.04, 0.3); }

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
    const isGoldenFloor = floorIdx > 0 && floorIdx % 30 === 0 && r.prng() < 0.33;
    r.activeBlock = {
      x: fromLeft ? 0 : w - prevWidth,
      y,
      width: prevWidth,
      height: BASE_BLOCK_HEIGHT,
      hue,
      direction: fromLeft ? 1 : -1,
      speed,
      isGolden: isGoldenFloor,
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
      playMiss(); playNoise(0.08, 0.3);
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
      playPerfect(r.perfectCombo);
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
      const chopRatio = (a.width - overlapW) / a.width;
      if (chopRatio > NEAR_MISS_RATIO) {
        r.slowMo = 300;
        r.cameraTargetScale *= 0.95;
        setTimeout(() => { r.cameraTargetScale /= 0.95; }, 320);
      }
      r.perfectCombo = 0;
      playLand();
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
        playBiome();
        break;
      }
    }

    if ([40, 60, 80].includes(r.floors.length - 1)) fireMilestone(r, r.floors.length - 1);

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

    if (a.isGolden && overlapW > 0) {
      r.goldenCount += 1;
      for (let i = 0; i < 25; i++) {
        spawnParticle(r, {
          kind: "sparkle",
          x: newX + r.prng() * newWidth,
          y: a.y,
          vx: (r.prng() - 0.5) * 300,
          vy: -r.prng() * 400 - 80,
          life: 1.2, maxLife: 1.2,
          size: 3 + r.prng() * 2,
          color: "#fde047",
        });
      }
      playGolden();
    }

    r.activeBlock = null;
    setTimeout(() => spawnBlock(), 180);
  }

  function endRun() {
    const r = refs.current;
    r.runRecord.score = r.score;
    r.runRecord.durationMs = performance.now() - r.runStartMs;
    // Cinematic pull-back: zoom out to show whole tower
    r.cameraTargetScale = Math.min(0.3, Math.max(0.15, 800 / (r.floors.length * BASE_BLOCK_HEIGHT + 200)));
    r.cameraTargetY = Math.max(0, viewportRef.current.h * 0.5);
    setTimeout(() => {
      r.state = "game-over";
      setUiState("game-over");
      handleRunEnd();
    }, 3500);
  }

  async function qualifiesForLeaderboard(r: GameRefs): Promise<boolean> {
    try {
      const game = r.isDailyRun
        ? `tower-stacker-daily-${new Date().toISOString().slice(0, 10)}`
        : r.isSeededRun
        ? "tower-stacker-seeded"
        : "tower-stacker";
      const res = await fetch(`/api/leaderboard?game=${encodeURIComponent(game)}`);
      const json = await res.json() as { entries: Array<{ score: number }> };
      if (!Array.isArray(json.entries)) return false;
      if (json.entries.length < 25) return true;
      return r.score > json.entries[json.entries.length - 1].score;
    } catch { return false; }
  }

  function handleRunEnd() {
    const r = refs.current;
    try {
      const hs = Number(localStorage.getItem(LS_PREFIX + "highscore") || "0");
      if (r.score > hs) {
        localStorage.setItem(LS_PREFIX + "highscore", String(r.score));
        localStorage.setItem(LS_PREFIX + "ghost", JSON.stringify(r.runRecord));
      }
      const runs = Number(localStorage.getItem(LS_PREFIX + "total_runs") || "0") + 1;
      localStorage.setItem(LS_PREFIX + "total_runs", String(runs));
      const hf = Number(localStorage.getItem(LS_PREFIX + "highfloors") || "0");
      const floors = r.floors.length - 1;
      if (floors > hf) localStorage.setItem(LS_PREFIX + "highfloors", String(floors));
    } catch {}
    unlockThemes(r);
    const newlyUnlocked = checkAchievements(r);
    r.achievementsUnlockedThisRun = newlyUnlocked;
    if (newlyUnlocked.length > 0) {
      setToasts(newlyUnlocked.map((id) => ACHIEVEMENTS.find((a) => a.id === id)?.name || "Achievement"));
      setTimeout(() => setToasts([]), 3500);
    }
    (async () => {
      const ok = await qualifiesForLeaderboard(r);
      if (ok) setLbModalOpen(true);
    })();
  }

  function togglePause() {
    const r = refs.current;
    if (r.state === "playing") { r.state = "paused"; setUiState("paused"); }
    else if (r.state === "paused") { r.state = "playing"; setUiState("playing"); }
  }

  function startRun() {
    const r = refs.current;
    if (r.isDailyRun || r.isSeededRun) {
      r.prng = mulberry32(r.seed);
    } else {
      r.prng = Math.random;
    }
    try {
      const raw = localStorage.getItem(LS_PREFIX + "ghost");
      r.ghost = raw ? JSON.parse(raw) as RunRecord : null;
    } catch { r.ghost = null; }
    r.ghostPassed = false;
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
        drawBlockWithTheme(ctx, f.x, f.y, f.width, f.height, f.hue, r.theme, f.isGolden);
      }

      drawParticles(r, ctx);

      // landing shadow hint
      if (r.hintsOn && r.activeBlock && r.floors.length > 0 && r.state === "playing") {
        const a = r.activeBlock;
        const top = r.floors[r.floors.length - 1];
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = `hsla(${a.hue}, 90%, 70%, 0.4)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(a.x + 1, top.y - 1, a.width - 2, 2);
        ctx.setLineDash([]);
        ctx.restore();
      }

      // draw active block
      if (r.activeBlock) {
        const a = r.activeBlock;
        drawBlockWithTheme(ctx, a.x, a.y, a.width, a.height, a.hue, r.theme, a.isGolden);
      }

      // extreme-combo crescendo glow
      if (r.perfectCombo >= 10 && r.activeBlock) {
        const a = r.activeBlock;
        ctx.save();
        ctx.shadowBlur = 20 + (r.perfectCombo - 10) * 2;
        ctx.shadowColor = `hsl(${(performance.now() / 10) % 360} 100% 60%)`;
        ctx.strokeStyle = ctx.shadowColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(a.x, a.y, a.width, a.height);
        ctx.restore();
      }

      // danger pulse when block is very narrow
      if (r.activeBlock && r.activeBlock.width < BASE_BLOCK_WIDTH_PX * 0.2 && r.state === "playing") {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 100);
        const a = r.activeBlock;
        ctx.save();
        ctx.strokeStyle = `rgba(239,68,68,${pulse})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(a.x - 2, a.y - 2, a.width + 4, a.height + 4);
        ctx.restore();
      }

      ctx.restore();

      if (r.state === "playing") {
        const fc = r.floors.length - 1;
        if (fc >= 40 && fc < 45 && r.bannerText === "LIGHTNING") drawLightning(ctx, w, h);
        if (fc >= 60 && fc < 65 && r.bannerText === "RADIANCE") drawRadiance(ctx, w, h);
        if (fc >= 80 && fc < 85 && r.bannerText === "RIFT") drawRift(ctx, w, h);
      }

      if (r.state === "playing") {
        drawGhost(ctx, r, w, h, () => {
          r.bannerText = "GHOST PASSED";
          r.bannerTime = 2;
          playTone(523, "sine", 0.2);
          setTimeout(() => playTone(659, "sine", 0.25), 100);
          setTimeout(() => playTone(784, "sine", 0.4), 250);
        });
      }

      if (r.perfectCombo >= 30) {
        ctx.save();
        ctx.globalAlpha = 0.2;
        const grd = ctx.createLinearGradient(0, 0, w, h);
        grd.addColorStop(0, "rgba(236,72,153,0.4)");
        grd.addColorStop(0.5, "rgba(168,85,247,0.4)");
        grd.addColorStop(1, "rgba(56,189,248,0.4)");
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      }

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
    if (initialSeed) {
      refs.current.seed = shortToSeed(initialSeed);
      refs.current.isSeededRun = true;
    }
    try {
      const m = localStorage.getItem(LS_PREFIX + "mode") as GameMode | null;
      if (m === "classic" || m === "sudden" || m === "speedrun") refs.current.mode = m;
      const h = localStorage.getItem(LS_PREFIX + "hints");
      if (h !== null) refs.current.hintsOn = h === "true";
      const t = localStorage.getItem(LS_PREFIX + "theme") as ThemeId | null;
      if (t === "classic" || t === "neon" || t === "gold" || t === "crystal" || t === "pixel") {
        refs.current.theme = t;
      }
      const s = localStorage.getItem(LS_PREFIX + "sound");
      if (s !== null) {
        const on = s === "true";
        setSoundOn(on);
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
              <button
                onClick={() => {
                  setSoundOn((s) => {
                    const next = !s;
                    try { localStorage.setItem(LS_PREFIX + "sound", String(next)); } catch {}
                    if (audioRef.current) audioRef.current.master.gain.value = next ? 0.4 : 0;
                    return next;
                  });
                }}
                className="pointer-events-auto rounded-lg bg-black/50 hover:bg-black/70 text-white w-10 h-10 flex items-center justify-center"
                aria-label="Toggle sound"
              >
                {soundOn ? <SpeakerOn /> : <SpeakerOff />}
              </button>
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

      {uiState === "game-over" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 backdrop-blur p-6">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-neutral-900/95 p-6">
            <h3 className="text-2xl font-bold text-red-400 mb-3">Run Complete</h3>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-neutral-200 mb-5">
              <Stat label="Score" value={refs.current.score.toLocaleString()} />
              <Stat label="Floors" value={String(Math.max(0, refs.current.floors.length - 1))} />
              <Stat label="Max Combo" value={String(refs.current.maxCombo)} />
              <Stat label="Perfects" value={String(refs.current.perfectsCount)} />
              <Stat label="Golden" value={String(refs.current.goldenCount)} />
              <Stat label="Duration" value={formatTime(refs.current.runRecord.durationMs)} />
            </div>
            <button
              onClick={async () => {
                const blob = await generateShareCard(refs.current);
                if (!blob) return;
                const filename = `tower-stacker-${refs.current.score}.png`;
                const file = new File([blob], filename, { type: "image/png" });
                try {
                  const nav = navigator as Navigator & {
                    canShare?: (data: ShareData) => boolean;
                    share?: (data: ShareData) => Promise<void>;
                  };
                  if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
                    await nav.share({
                      files: [file],
                      title: "Tower Stacker",
                      text: `I reached floor ${refs.current.floors.length - 1}!`,
                    });
                    return;
                  }
                } catch {}
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="w-full rounded-xl bg-amber-600 hover:bg-amber-500 text-white py-2.5 font-semibold mb-2"
            >
              Share Tower
            </button>
            <div className="flex gap-2">
              <button onClick={() => startRun()} className="flex-1 rounded-xl bg-red-600 hover:bg-red-500 text-white py-2.5 font-semibold">Play Again</button>
              <button onClick={() => { refs.current.state = "menu"; setUiState("menu"); }} className="flex-1 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white py-2.5 font-semibold">Menu</button>
            </div>
            <button
              onClick={() => setLbModalOpen(true)}
              className="w-full mt-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-white py-2.5 font-semibold"
            >
              View Leaderboard
            </button>
          </div>
        </div>
      )}

      {lbModalOpen && (
        <LeaderboardModal runRefs={refs.current} onClose={() => setLbModalOpen(false)} />
      )}

      {toasts.length > 0 && (
        <div className="absolute top-4 right-4 z-30 flex flex-col gap-2 pointer-events-none">
          {toasts.map((t, i) => (
            <div
              key={i}
              className="rounded-lg bg-gradient-to-r from-amber-500 to-red-500 text-white px-4 py-2 shadow-lg"
            >
              <div className="text-xs uppercase opacity-80">Achievement</div>
              <div className="font-semibold">{t}</div>
            </div>
          ))}
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

              <ThemePicker
                active={refs.current.theme}
                onChange={(t) => {
                  refs.current.theme = t;
                  try { localStorage.setItem(LS_PREFIX + "theme", t); } catch {}
                  forceTick((n) => (n + 1) % 1_000_000);
                }}
              />

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
              onClick={() => {
                refs.current.isDailyRun = false;
                refs.current.isSeededRun = false;
                playUi();
                startRun();
              }}
              className="w-full rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold py-3 text-lg shadow-lg shadow-red-900/30 transition"
            >
              START
            </button>

            <button
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10);
                refs.current.seed = fnv1a(today);
                refs.current.isDailyRun = true;
                refs.current.isSeededRun = false;
                playUi();
                startRun();
              }}
              className="w-full mt-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-semibold py-3 text-base"
            >
              TODAY&apos;S CHALLENGE — {new Date().toISOString().slice(0, 10)}
            </button>

            <p className="text-xs text-neutral-500 mt-4 text-center">
              Tap, click, or press Space / Enter to drop.
            </p>

            <AchievementsStrip />
          </div>
        </div>
      )}
    </div>
  );
}
