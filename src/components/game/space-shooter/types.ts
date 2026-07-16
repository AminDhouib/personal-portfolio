import * as THREE from "three";
import { loadProfile, saveProfile, type Profile } from "../profile";

// ---------- arena constants ----------
const ARENA_W_DESKTOP = 9;
const ARENA_H_DESKTOP = 5.4;
export let ARENA_W = ARENA_W_DESKTOP;
export let ARENA_H = ARENA_H_DESKTOP;
export function setArena(w: number, h: number) {
  ARENA_W = w;
  ARENA_H = h;
}
export const SPAWN_Z = -42;
export const DESPAWN_Z = 6;
export const MAX_OBSTACLES = 32;
export const MAX_BULLETS = 70;
export const MAX_POWERUPS = 4;
export const SHIP_RADIUS = 0.34;
export const POWERUP_PICKUP_RADIUS = 1.15;
export const POWERUP_DURATION_MS = 8000;
export const POWERUP_SPAWN_INTERVAL_MS = 11000;
export const START_INVULN_MS = 2500;
export const COMBO_WINDOW_MS = 4000;
export const NEAR_MISS_RADIUS = 1.2;
export const NEAR_MISS_POINTS = 15;

// ---------- type aliases ----------
export type GameStatus = "armed" | "playing" | "paused" | "dying" | "dead";
export type PowerUpType = "shield" | "triple" | "rapid" | "mega" | "warp" | "magnet";
export type ObstacleVariant =
  "basic" | "heavy" | "speeder" | "wall" | "shooter" | "zapper" | "drone";
export type BulletStyle = "sprite" | "bolt" | "plasma";

// ---------- environment ----------
export interface Environment {
  name: string;
  fog: string;
  ambient: string;
  asteroidColor: string;
  asteroidEmissive: string;
  bg: string;
  starColor: string;
}

export const ENVIRONMENTS: readonly [Environment, ...Environment[]] = [
  {
    name: "Deep Space",
    fog: "#0a0a1a",
    ambient: "#202040",
    asteroidColor: "#a78bfa",
    asteroidEmissive: "#4c1d95",
    bg: "radial-gradient(ellipse at center, #0f172a 0%, #020617 70%, #000 100%)",
    starColor: "#cbd5e1",
  },
  {
    name: "Crimson Nebula",
    fog: "#3d1d3f",
    ambient: "#4a1d4a",
    asteroidColor: "#f0abfc",
    asteroidEmissive: "#a21caf",
    bg: "radial-gradient(ellipse at 30% 30%, #4a1d4a 0%, #1e0a2c 60%, #000 100%)",
    starColor: "#fbcfe8",
  },
  {
    name: "Glacier Belt",
    fog: "#1a3a4a",
    ambient: "#3a5a6a",
    asteroidColor: "#7dd3fc",
    asteroidEmissive: "#0369a1",
    bg: "radial-gradient(ellipse at 70% 40%, #0c4a6e 0%, #082f49 60%, #000 100%)",
    starColor: "#bae6fd",
  },
  {
    name: "Plasma Storm",
    fog: "#5a2410",
    ambient: "#5a2a1a",
    asteroidColor: "#fb923c",
    asteroidEmissive: "#9a3412",
    bg: "radial-gradient(ellipse at 50% 60%, #7c2d12 0%, #431407 60%, #000 100%)",
    starColor: "#fed7aa",
  },
];

export const INVERTED_ARMED_ENV: Environment = {
  name: "Deep Space",
  fog: "#e2e8f0",
  ambient: "#94a3b8",
  asteroidColor: "#64748b",
  asteroidEmissive: "#334155",
  bg: "radial-gradient(ellipse at center, #f8fafc 0%, #e2e8f0 70%, #cbd5e1 100%)",
  starColor: "#1e293b",
};

export function envForTime(seconds: number): Environment {
  const idx = Math.floor(seconds / 35) % ENVIRONMENTS.length;
  return ENVIRONMENTS[idx] ?? ENVIRONMENTS[0];
}

// ---------- power-up defs ----------
export interface PowerUpDef {
  color: string;
  emissive: string;
  label: string;
}

export const POWERUP_DEFS: Record<PowerUpType, PowerUpDef> = {
  shield: { color: "#60a5fa", emissive: "#1e3a8a", label: "Shield" },
  triple: { color: "#f472b6", emissive: "#9d174d", label: "Triple Shot" },
  rapid: { color: "#facc15", emissive: "#854d0e", label: "Rapid Fire" },
  mega: { color: "#a78bfa", emissive: "#4c1d95", label: "Plasma" },
  warp: { color: "#22d3ee", emissive: "#0e7490", label: "Warp Drive" },
  magnet: { color: "#10b981", emissive: "#064e3b", label: "Magnet" },
};

export const POWERUP_TYPES: PowerUpType[] = ["shield", "triple", "rapid", "mega", "warp", "magnet"];

// ---------- entity types ----------
export interface Obstacle {
  id: number;
  variant: ObstacleVariant;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  rsx: number;
  rsy: number;
  rsz: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  hp: number;
  shape: 0 | 1 | 2;
  closestApproach: number;
  brushed: boolean;
  lastShotAt?: number;
  lastBeamCycle?: number;
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  damage: number;
  color: string;
  hp: number;
  style: BulletStyle;
}

export interface Coin {
  id: number;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  vx: number;
  vy: number;
  value: number;
}

export interface Explosion {
  id: number;
  x: number;
  y: number;
  z: number;
  startedAt: number;
  color: string;
  scale: number;
  opacity: number;
  duration: number;
}

export interface SpeedLine {
  x: number;
  y: number;
  z: number;
  length: number;
  life: number;
}

export interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface ActivePowerUp {
  type: PowerUpType;
  expiresAt: number;
}

export interface ScorePopup {
  id: number;
  x: number;
  y: number;
  z: number;
  amount: number;
  spawnedAt: number;
  ttl: number;
}

export interface Debris {
  id: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  rsx: number;
  rsy: number;
  rsz: number;
  size: [number, number, number];
  color: string;
  spawnedAt: number;
  ttl: number;
}

// ---------- boss system ----------
export type BossId =
  | "sentinel"
  | "drifter"
  | "swarm-mother"
  | "mirror"
  | "pulsar"
  | "harvester"
  | "warden"
  | "void-tyrant";

export type BossPhase = "intro" | "fighting" | "dying" | "defeated";

export interface SubEntity {
  type: "drone" | "mine" | "beam-segment";
  position: [number, number, number];
  velocity: [number, number, number];
  hp: number;
  createdAt: number;
  ttlMs: number;
}

export interface BossState {
  id: BossId;
  tier: number;
  hp: number;
  hpMax: number;
  position: [number, number, number];
  velocity: [number, number, number];
  phase: BossPhase;
  phaseStartAt: number;
  encounterStartAt: number;
  lastShotAt: number;
  patternIndex: number;
  difficultyMult: number;
  subEntities: SubEntity[];
  rng: () => number;
  // Warden-only: scrolling wall-gate segments (lazily initialized on first tick).
  wallSegments?: BossWallSegment[];
  // Harvester-only: tractor-beam state (lazily initialized on first tick).
  tractorBeam?: TractorBeam;
}

export interface BossProjectile {
  id: number;
  position: [number, number, number];
  velocity: [number, number, number];
  radius: number;
  color: string;
  spawnedAt: number;
  ttlMs: number;
  homing: boolean;
  shielded: boolean;
}

export interface TractorBeam {
  active: boolean;
  startAt: number;
  durationMs: number;
  shipOverlapAccum: number;
}

export interface BossWallSegment {
  gridIndex: number;
  position: [number, number, number];
  velocity: [number, number, number];
  isGap: boolean;
  createdAt: number;
  wallGroupId: number;
}

// ---------- GameRefs ----------
export interface GameRefs {
  now: number;
  status: GameStatus;
  score: number;
  kills: number;
  distance: number;
  combo: number;
  comboLastAt: number;
  comboPeak: number;
  obstacles: Obstacle[];
  bullets: Bullet[];
  explosions: Explosion[];
  speedLines: SpeedLine[];
  powerUps: PowerUp[];
  coins: Coin[];
  coinsThisRun: number;
  shipFireRateMul: number;
  shipDamageMul: number;
  shipAgilityMul: number;
  shipCoinMagnetMul: number;
  shipHullTint: string;
  shipEngineTint: string;
  shipDeathFxKind: string | null;
  shipId: string;
  startShieldCharges: number;
  coinBoostMul: number;
  reviveAvailable: boolean;
  reviveUsed: boolean;
  prefs: {
    reducedMotion: boolean;
    gyroEnabled: boolean;
    bloomEnabled: boolean;
    musicEnabled: boolean;
    sfxEnabled: boolean;
  };
  gyroTilt: { x: number; y: number };
  boss: BossState | null;
  bossProjectiles: BossProjectile[];
  bossSchedule: { distance: number; bossId: BossId }[];
  bossScheduleIdx: number;
  bossesDefeatedThisRun: number;
  damageTakenThisRun: number;
  dash: {
    lastLeftTapAt: number;
    lastRightTapAt: number;
    activeUntil: number;
    direction: "left" | "right" | null;
    cooldownUntil: number;
    startedAt: number;
    startX: number;
    targetX: number;
  };
  dashAfterimages: { pos: [number, number, number]; createdAt: number }[];
  lastAfterimageAt: number;
  normalSpawningPausedUntil: number;
  devHotkeyArmed: boolean;
  nextBossProjectileId: number;
  lastBossPulseAt: number;
  coinMagnetExtra: number;
  coinValueBonus: number;
  scoreMultiplier: number;
  comboWindowMs: number;
  shieldDurationMs: number;
  activePowerUps: ActivePowerUp[];
  debris: Debris[];
  scorePopups: ScorePopup[];
  targetX: number;
  targetY: number;
  shipX: number;
  shipY: number;
  shipZ: number;
  shipRotZ: number;
  deathVelX: number;
  deathVelY: number;
  deathVelZ: number;
  deathAngVel: number;
  fogColor: THREE.Color;
  ambientColor: THREE.Color;
  asteroidColor: THREE.Color;
  asteroidEmissive: THREE.Color;
  starColor: THREE.Color;
  shieldActiveLast: boolean;
  warpActiveLast: boolean;
  isMobile: boolean;
  warpIntensity: number;
  invertedArmed: boolean;
  currentEnv: Environment;
  nextBiomeAt: number;
  nextWallAt: number;
  lastBullet: number;
  lastSpawn: number;
  lastPowerUpSpawn: number;
  lastUiSync: number;
  nextId: number;
  startedAt: number;
  invulnUntil: number;
  // performance.now() when the run was paused (0 while not paused). resumeRun
  // shifts every absolute timestamp forward by the paused span so power-ups,
  // spawn timers, and the survival clock do not age while paused.
  pausedAt: number;
  dyingAt: number;
  // Which staged death-sequence burst has fired (0 = none). Stage flags, not
  // wall-clock windows, so a hitched frame can't skip a burst.
  deathFxStage: number;
  shipFallSpeed: number;
  cameraTargetX: number;
  cameraTargetY: number;
  cameraTargetZ: number;
}

export interface Viewport {
  width: number;
  height: number;
}

// ---------- shared helpers ----------
export function nextId(g: GameRefs): number {
  const id = g.nextId;
  g.nextId = id + 1;
  return id;
}

export function isPowerUpActive(g: GameRefs, t: PowerUpType): boolean {
  const now = performance.now();
  return g.activePowerUps.some((p) => p.type === t && p.expiresAt > now);
}

// Cached THREE.Color targets per environment (avoids per-frame allocation)
export const ENV_COLOR_CACHE = new WeakMap<
  Environment,
  {
    fog: THREE.Color;
    ambient: THREE.Color;
    asteroidColor: THREE.Color;
    asteroidEmissive: THREE.Color;
    starColor: THREE.Color;
  }
>();

export function envColors(env: Environment) {
  let c = ENV_COLOR_CACHE.get(env);
  if (!c) {
    c = {
      fog: new THREE.Color(env.fog),
      ambient: new THREE.Color(env.ambient),
      asteroidColor: new THREE.Color(env.asteroidColor),
      asteroidEmissive: new THREE.Color(env.asteroidEmissive),
      starColor: new THREE.Color(env.starColor),
    };
    ENV_COLOR_CACHE.set(env, c);
  }
  return c;
}

export function activatePowerUp(g: GameRefs, t: PowerUpType): void {
  const now = performance.now();
  // Shield duration is upgradable; other power-ups use the base duration.
  const durationMs =
    t === "shield" && g.shieldDurationMs > 0 ? g.shieldDurationMs : POWERUP_DURATION_MS;
  const expiresAt = now + durationMs;
  const existing = g.activePowerUps.find((p) => p.type === t);
  if (existing) {
    existing.expiresAt = expiresAt;
  } else {
    g.activePowerUps.push({ type: t, expiresAt });
  }
}

export function tryDash(g: GameRefs, direction: "left" | "right", now: number): boolean {
  const DASH_WINDOW = 300;
  const DASH_COOLDOWN = 2000;
  const DASH_DURATION = 300;
  const DASH_DISTANCE = 3.0;
  if (now < g.dash.cooldownUntil) return false;
  const lastKey: "lastLeftTapAt" | "lastRightTapAt" =
    direction === "left" ? "lastLeftTapAt" : "lastRightTapAt";
  const lastTap = g.dash[lastKey];
  if (now - lastTap <= DASH_WINDOW && lastTap > 0) {
    g.dash.activeUntil = now + DASH_DURATION;
    g.dash.direction = direction;
    g.dash.startedAt = now;
    g.dash.startX = g.shipX;
    g.dash.targetX = g.shipX + (direction === "left" ? -DASH_DISTANCE : DASH_DISTANCE);
    g.dash.cooldownUntil = now + DASH_COOLDOWN;
    g.invulnUntil = Math.max(g.invulnUntil, g.dash.activeUntil);
    g.dash.lastLeftTapAt = 0;
    g.dash.lastRightTapAt = 0;
    // Lifetime dash counter (additive schema -- stored under (p as any).totalDashes)
    try {
      const p = loadProfile();
      const pp = p as Profile & { totalDashes?: number };
      pp.totalDashes = (pp.totalDashes ?? 0) + 1;
      saveProfile(p);
    } catch {
      // silent-ok: best-effort lifetime dash-counter persistence via localStorage; must not block the dash itself
    }
    return true;
  }
  g.dash[lastKey] = now;
  return false;
}
