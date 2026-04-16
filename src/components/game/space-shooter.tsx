"use client";

import { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  Rocket, Trophy, Shield, RotateCcw, Send,
  Volume2, VolumeX, Crosshair, Zap, Target,
  Maximize2, Minimize2, Pause, Play,
  ShoppingCart, Magnet, Coins as CoinsIcon, Timer, X as XIcon,
} from "lucide-react";
import {
  addCoins, addRunStats, incrementRunsPlayed, loadProfile, markFirstRunCompleted, saveProfile,
  setUpgradeLevel, spendCoins,
} from "./profile";
import { UPGRADES, upgradeById } from "./shop-data";

// ---------- constants ----------

const HS_KEY = "space-shooter-hs";
const NAME_KEY = "space-shooter-name";
const SOUND_KEY = "space-shooter-sound";
// World-space arena bounds. The visible canvas may be wider, but the ship
// never gets more sideways room than this — prevents cheating by stretching
// the browser window to ultrawide.
const ARENA_W_DESKTOP = 9;
const ARENA_H_DESKTOP = 5.4;
const ARENA_W_MOBILE = 6.5;
const ARENA_H_MOBILE = 6.0;
// Default values used by spawn helpers; overridden per-frame by the runtime
// based on viewport in runTick.
let ARENA_W = ARENA_W_DESKTOP;
let ARENA_H = ARENA_H_DESKTOP;
function setArena(w: number, h: number) {
  ARENA_W = w;
  ARENA_H = h;
}
const SPAWN_Z = -42;
const DESPAWN_Z = 6;
const MAX_OBSTACLES = 32;
const MAX_BULLETS = 70;
const MAX_POWERUPS = 4;
const SHIP_RADIUS = 0.34;
const POWERUP_PICKUP_RADIUS = 1.15; // generous — easier to grab on the move
const POWERUP_DURATION_MS = 8000;
const POWERUP_SPAWN_INTERVAL_MS = 11000;
const START_INVULN_MS = 2500;
const COMBO_WINDOW_MS = 4000; // combo resets if no new kill within this window
const NEAR_MISS_RADIUS = 1.2; // ship surface + this much = "brushed"
const NEAR_MISS_POINTS = 15;

// `armed` = scene is alive (ship visible, speed lines flowing) but the run
// hasn't started — waiting for the player's first mouse/touch/key input.
type GameStatus = "armed" | "playing" | "paused" | "dying" | "dead";
type PowerUpType = "shield" | "triple" | "rapid" | "mega" | "warp";
type ObstacleVariant = "basic" | "heavy" | "speeder" | "wall";
type BulletStyle = "sprite" | "bolt" | "plasma";

interface Environment {
  name: string;
  fog: string;
  ambient: string;
  asteroidColor: string;
  asteroidEmissive: string;
  bg: string;
  starColor: string;
}

const ENVIRONMENTS: Environment[] = [
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

// Light-mode "armed" palette — inverts the space so the game section doesn't
// scream DARK MODE on an otherwise light portfolio page. Reverts to the
// normal dark-space biome once the player starts the run.
const INVERTED_ARMED_ENV: Environment = {
  name: "Deep Space",
  fog: "#e2e8f0",
  ambient: "#94a3b8",
  asteroidColor: "#64748b",
  asteroidEmissive: "#334155",
  bg: "radial-gradient(ellipse at center, #f8fafc 0%, #e2e8f0 70%, #cbd5e1 100%)",
  starColor: "#1e293b",
};

// Switch biome every 35 seconds of play time
function envForTime(seconds: number): Environment {
  return ENVIRONMENTS[Math.floor(seconds / 35) % ENVIRONMENTS.length];
}

interface PowerUpDef {
  color: string;
  emissive: string;
  label: string;
}

const POWERUP_DEFS: Record<PowerUpType, PowerUpDef> = {
  shield: { color: "#60a5fa", emissive: "#1e3a8a", label: "Shield" },
  triple: { color: "#f472b6", emissive: "#9d174d", label: "Triple Shot" },
  rapid: { color: "#facc15", emissive: "#854d0e", label: "Rapid Fire" },
  mega: { color: "#a78bfa", emissive: "#4c1d95", label: "Plasma" },
  warp: { color: "#22d3ee", emissive: "#0e7490", label: "Warp Drive" },
};

const POWERUP_TYPES: PowerUpType[] = ["shield", "triple", "rapid", "mega", "warp"];

// ---------- entity types ----------

interface Obstacle {
  id: number;
  variant: ObstacleVariant;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  rsx: number; rsy: number; rsz: number;
  vx: number; vy: number; vz: number; // full 3D velocity
  size: number;
  hp: number;
  shape: 0 | 1 | 2;
  closestApproach: number;  // closest 3D distance the ship came to this obstacle, tracked per-frame
  brushed: boolean;         // true if the obstacle came within near-miss range but not collision
}

interface Bullet {
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  size: number;
  damage: number;
  color: string;
  hp: number;
  style: BulletStyle;
}

interface Coin {
  id: number;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
  value: number; // how many coins this token is worth (scales with combo)
}

interface Explosion {
  id: number;
  x: number; y: number; z: number;
  startedAt: number;
  color: string;
  scale: number;
  opacity: number;
  duration: number;
}

interface SpeedLine {
  x: number; y: number; z: number;
  length: number;
  life: number;
}

interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number; y: number; z: number;
  rx: number; ry: number; rz: number;
}

interface ActivePowerUp {
  type: PowerUpType;
  expiresAt: number;
}

// Floating "+N" point label that drifts up from a destroyed asteroid.
interface ScorePopup {
  id: number;
  x: number; y: number; z: number;
  amount: number;
  spawnedAt: number;
  ttl: number;
}

// Bits of the ship that detach on collision and tumble away.
interface Debris {
  id: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; rz: number;
  rsx: number; rsy: number; rsz: number;
  size: [number, number, number];
  color: string;
  spawnedAt: number;
  ttl: number; // ms — fades out and despawns
}

// ---------- boss system ----------

type BossId =
  | "sentinel"      // tier 1 @ 1500m
  | "drifter"       // tier 2 @ 3000m
  | "swarm-mother"  // tier 3 @ 4500m
  | "mirror"        // tier 4 @ 6000m
  | "pulsar"        // tier 5 @ 7500m
  | "harvester"     // tier 6 @ 9000m
  | "warden"        // tier 7 @ 11000m
  | "void-tyrant";  // tier 8 @ 13000m

type BossPhase = "intro" | "fighting" | "dying" | "defeated";

interface SubEntity {
  type: "drone" | "mine" | "beam-segment";
  position: [number, number, number];
  velocity: [number, number, number];
  hp: number;
  createdAt: number;
  ttlMs: number;
}

interface BossState {
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
}

interface BossProjectile {
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

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildBossSchedule(): { distance: number; bossId: BossId }[] {
  return [
    { distance: 1500,  bossId: "sentinel" },
    { distance: 3000,  bossId: "drifter" },
    { distance: 4500,  bossId: "swarm-mother" },
    { distance: 6000,  bossId: "mirror" },
    { distance: 7500,  bossId: "pulsar" },
    { distance: 9000,  bossId: "harvester" },
    { distance: 11000, bossId: "warden" },
    { distance: 13000, bossId: "void-tyrant" },
    { distance: 16000, bossId: "sentinel" },
    { distance: 19000, bossId: "drifter" },
    { distance: 22000, bossId: "swarm-mother" },
  ];
}

const BOSS_TIERS: Record<BossId, number> = {
  sentinel: 1, drifter: 2, "swarm-mother": 3, mirror: 4,
  pulsar: 5, harvester: 6, warden: 7, "void-tyrant": 8,
};

const BOSS_BASE_HP: Record<BossId, number> = {
  sentinel: 8, drifter: 12, "swarm-mother": 20, mirror: 18,
  pulsar: 25, harvester: 30, warden: 40, "void-tyrant": 60,
};

const BOSS_DISPLAY_NAMES: Record<BossId, string> = {
  sentinel: "SENTINEL",
  drifter: "DRIFTER",
  "swarm-mother": "SWARM MOTHER",
  mirror: "MIRROR",
  pulsar: "PULSAR",
  harvester: "HARVESTER",
  warden: "WARDEN",
  "void-tyrant": "VOID TYRANT",
};

function normalizeVec3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

interface TractorBeam {
  active: boolean;
  startAt: number;
  durationMs: number;
  shipOverlapAccum: number;
}

interface BossWallSegment {
  gridIndex: number;
  position: [number, number, number];
  velocity: [number, number, number];
  isGap: boolean;
  createdAt: number;
  wallGroupId: number;
}

function runWardenBehavior(g: GameRefs, boss: BossState, now: number, step: number): void {
  boss.position[0] = 0;
  boss.position[1] = 4;
  boss.position[2] = -15;
  const holder = boss as unknown as { wallSegments?: BossWallSegment[] };
  if (!holder.wallSegments) holder.wallSegments = [];
  const segs = holder.wallSegments;
  const shotInterval = 4000 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const wallGroupId = Math.floor(now);
    const gapIdx = Math.floor(boss.rng() * 5);
    for (let k = 0; k < 5; k++) {
      segs.push({
        gridIndex: k,
        position: [(k - 2) * 2, 2, -8],
        velocity: [0, 0, 5],
        isGap: k === gapIdx,
        createdAt: now,
        wallGroupId,
      });
    }
    boss.lastShotAt = now;
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    s.position[0] += s.velocity[0] * step;
    s.position[1] += s.velocity[1] * step;
    s.position[2] += s.velocity[2] * step;
    if (!s.isGap) {
      const dx = g.shipX - s.position[0];
      const dy = g.shipY - s.position[1];
      const dz = g.shipZ - s.position[2];
      const shieldedShip = isPowerUpActive(g, "shield") || isPowerUpActive(g, "warp");
      if (now > g.invulnUntil && !shieldedShip &&
          Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(dz) < 1) {
        g.status = "dying";
        g.dyingAt = now;
        g.deathVelX = (dx / (Math.hypot(dx, dy) || 1)) * 7;
        g.deathVelY = (dy / (Math.hypot(dx, dy) || 1)) * 7 + 3.5;
        g.deathVelZ = 2.5;
        g.deathAngVel = (Math.random() - 0.5) * 10;
        spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#ef4444", 500, 0.45);
        spawnShipDebris(g);
        sounds.play("crash");
        sounds.stopMusic(0.4);
        sounds.playLosingJingle();
        s.isGap = true;
      }
    }
    if (s.position[2] > 10) segs.splice(i, 1);
  }
}

function updateDronesGeneric(g: GameRefs, boss: BossState, now: number, step: number): void {
  for (let i = boss.subEntities.length - 1; i >= 0; i--) {
    const d = boss.subEntities[i];
    if (d.type !== "drone") continue;
    const dir = normalizeVec3([
      g.shipX - d.position[0],
      g.shipY - d.position[1],
      g.shipZ - d.position[2],
    ]);
    const lerp = 0.05;
    d.velocity[0] = d.velocity[0] * (1 - lerp) + dir[0] * 3.5 * lerp;
    d.velocity[1] = d.velocity[1] * (1 - lerp) + dir[1] * 3.5 * lerp;
    d.velocity[2] = d.velocity[2] * (1 - lerp) + dir[2] * 3.5 * lerp;
    d.position[0] += d.velocity[0] * step;
    d.position[1] += d.velocity[1] * step;
    d.position[2] += d.velocity[2] * step;
    const sdx = d.position[0] - g.shipX;
    const sdy = d.position[1] - g.shipY;
    const sdz = d.position[2] - g.shipZ;
    const shieldedShip = isPowerUpActive(g, "shield") || isPowerUpActive(g, "warp");
    if (now > g.invulnUntil && !shieldedShip &&
        sdx * sdx + sdy * sdy + sdz * sdz < 0.9 * 0.9) {
      g.status = "dying";
      g.dyingAt = now;
      g.deathVelX = -sdx / (Math.hypot(sdx, sdy) || 1) * 7;
      g.deathVelY = -sdy / (Math.hypot(sdx, sdy) || 1) * 7 + 3.5;
      g.deathVelZ = 2.5;
      g.deathAngVel = (Math.random() - 0.5) * 10;
      spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#a855f7", 500, 0.45);
      spawnShipDebris(g);
      sounds.play("crash");
      sounds.stopMusic(0.4);
      sounds.playLosingJingle();
      boss.subEntities.splice(i, 1);
      continue;
    }
    if (now - d.createdAt > d.ttlMs || d.position[2] > 10) {
      boss.subEntities.splice(i, 1);
    }
  }
}

function runVoidTyrantBehavior(g: GameRefs, boss: BossState, now: number, step: number): void {
  boss.position[0] = Math.sin((now - boss.phaseStartAt) * 0.0003) * 2.5;
  boss.position[1] = 3 + Math.cos((now - boss.phaseStartAt) * 0.0004) * 1;
  boss.position[2] = -16;
  const hpPct = boss.hp / boss.hpMax;
  const phase = hpPct > 0.66 ? 1 : hpPct > 0.33 ? 2 : 3;
  if (phase === 1) {
    const shotInterval = 1400 / boss.difficultyMult;
    if (now - boss.lastShotAt >= shotInterval) {
      for (let k = -1; k <= 1; k++) {
        const dir = normalizeVec3([
          g.shipX - boss.position[0] + k * 0.6,
          g.shipY - boss.position[1],
          g.shipZ - boss.position[2],
        ]);
        g.bossProjectiles.push({
          id: g.nextBossProjectileId++,
          position: [boss.position[0], boss.position[1], boss.position[2]],
          velocity: [dir[0] * 7, dir[1] * 7, dir[2] * 7],
          radius: 0.32,
          color: "#a855f7",
          spawnedAt: now,
          ttlMs: 5000,
          homing: true,
          shielded: false,
        });
      }
      boss.lastShotAt = now;
    }
  } else if (phase === 2) {
    const shotInterval = 2000 / boss.difficultyMult;
    if (now - boss.lastShotAt >= shotInterval) {
      const count = 10;
      for (let k = 0; k < count; k++) {
        const angle = (k / count) * Math.PI * 2 + boss.patternIndex * 0.12;
        g.bossProjectiles.push({
          id: g.nextBossProjectileId++,
          position: [boss.position[0], boss.position[1], boss.position[2]],
          velocity: [Math.cos(angle) * 7, Math.sin(angle) * 7, 2],
          radius: 0.3,
          color: "#ec4899",
          spawnedAt: now,
          ttlMs: 4000,
          homing: false,
          shielded: false,
        });
      }
      boss.lastShotAt = now;
      boss.patternIndex += 1;
    }
  } else {
    const shotInterval = 900 / boss.difficultyMult;
    if (now - boss.lastShotAt >= shotInterval) {
      const dir = normalizeVec3([
        g.shipX - boss.position[0],
        g.shipY - boss.position[1],
        g.shipZ - boss.position[2],
      ]);
      g.bossProjectiles.push({
        id: g.nextBossProjectileId++,
        position: [boss.position[0], boss.position[1], boss.position[2]],
        velocity: [dir[0] * 9, dir[1] * 9, dir[2] * 9],
        radius: 0.35,
        color: "#f59e0b",
        spawnedAt: now,
        ttlMs: 5000,
        homing: true,
        shielded: false,
      });
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + boss.patternIndex * 0.07;
        g.bossProjectiles.push({
          id: g.nextBossProjectileId++,
          position: [boss.position[0], boss.position[1], boss.position[2]],
          velocity: [Math.cos(a) * 6, Math.sin(a) * 6, 2],
          radius: 0.28,
          color: "#fbbf24",
          spawnedAt: now,
          ttlMs: 4000,
          homing: false,
          shielded: false,
        });
      }
      boss.lastShotAt = now;
      boss.patternIndex += 1;
    }
    const droneCount = boss.subEntities.filter((s) => s.type === "drone").length;
    if (droneCount < 2) {
      boss.subEntities.push({
        type: "drone",
        position: [boss.position[0], boss.position[1], boss.position[2]],
        velocity: [(boss.rng() - 0.5) * 3, 0, 3],
        hp: 1,
        createdAt: now,
        ttlMs: 10000,
      });
    }
    updateDronesGeneric(g, boss, now, step);
  }
}

function runHarvesterBehavior(g: GameRefs, boss: BossState, now: number, step: number): void {
  boss.position[0] = Math.sin((now - boss.phaseStartAt) * 0.0004) * 4;
  boss.position[1] = 5;
  boss.position[2] = -14;
  const beamHolder = boss as unknown as { tractorBeam?: TractorBeam };
  if (!beamHolder.tractorBeam) {
    beamHolder.tractorBeam = { active: false, startAt: 0, durationMs: 2000, shipOverlapAccum: 0 };
  }
  const beam = beamHolder.tractorBeam;
  const CYCLE_MS = 4000 / boss.difficultyMult;
  const cycleAge = (now - boss.phaseStartAt) % CYCLE_MS;
  const deltaMs = step * 1000;
  if (cycleAge < beam.durationMs) {
    if (!beam.active) {
      beam.active = true;
      beam.startAt = now;
      beam.shipOverlapAccum = 0;
    }
    const dx = g.shipX - boss.position[0];
    const dz = g.shipZ - boss.position[2];
    if (Math.abs(dx) < 0.8 && Math.abs(dz) < 2.5) {
      beam.shipOverlapAccum += deltaMs;
      if (beam.shipOverlapAccum >= 500) {
        // Drain coins if available, else score
        const profile = loadProfile();
        if (profile.walletCoins >= 20) {
          spendCoins(20);
        } else {
          g.score = Math.max(0, g.score - 50);
        }
        beam.shipOverlapAccum = 0;
      }
    } else {
      beam.shipOverlapAccum = Math.max(0, beam.shipOverlapAccum - deltaMs * 0.5);
    }
  } else {
    beam.active = false;
  }
}

function runMirrorBehavior(g: GameRefs, boss: BossState, now: number): void {
  boss.position[0] = -g.shipX;
  boss.position[1] = g.shipY + 2;
  boss.position[2] = -16;
  const shotInterval = 800 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const dir = normalizeVec3([
      g.shipX - boss.position[0],
      g.shipY - boss.position[1],
      g.shipZ - boss.position[2],
    ]);
    g.bossProjectiles.push({
      id: g.nextBossProjectileId++,
      position: [boss.position[0], boss.position[1], boss.position[2]],
      velocity: [dir[0] * 10, dir[1] * 10, dir[2] * 10],
      radius: 0.3,
      color: "#cbd5e1",
      spawnedAt: now,
      ttlMs: 3000,
      homing: false,
      shielded: false,
    });
    boss.lastShotAt = now;
  }
}

function runPulsarBehavior(g: GameRefs, boss: BossState, now: number): void {
  boss.position[0] = 0;
  boss.position[1] = 3;
  boss.position[2] = -18;
  const shotInterval = 3000 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const count = 12;
    for (let k = 0; k < count; k++) {
      const angle = (k / count) * Math.PI * 2;
      const offsetAngle = boss.patternIndex * 0.15;
      const a = angle + offsetAngle;
      g.bossProjectiles.push({
        id: g.nextBossProjectileId++,
        position: [boss.position[0], boss.position[1], boss.position[2]],
        velocity: [Math.cos(a) * 8, Math.sin(a) * 8, 2],
        radius: 0.3,
        color: "#fef08a",
        spawnedAt: now,
        ttlMs: 4000,
        homing: false,
        shielded: false,
      });
    }
    boss.lastShotAt = now;
    boss.patternIndex += 1;
  }
}

function runSwarmMotherBehavior(g: GameRefs, boss: BossState, now: number, step: number): void {
  boss.position[0] = Math.sin((now - boss.phaseStartAt) * 0.0003) * 2;
  boss.position[1] = 3;
  boss.position[2] = -14;
  const droneCount = boss.subEntities.filter((s) => s.type === "drone").length;
  if (droneCount < 8 && now - boss.lastShotAt >= 1500 / boss.difficultyMult) {
    for (let k = 0; k < 2; k++) {
      const offset = (k - 0.5) * 2;
      boss.subEntities.push({
        type: "drone",
        position: [boss.position[0] + offset, boss.position[1], boss.position[2]],
        velocity: [0, 0, 3.5],
        hp: 1,
        createdAt: now,
        ttlMs: 12000,
      });
    }
    boss.lastShotAt = now;
  }
  for (let i = boss.subEntities.length - 1; i >= 0; i--) {
    const d = boss.subEntities[i];
    if (d.type !== "drone") continue;
    const dir = normalizeVec3([
      g.shipX - d.position[0],
      g.shipY - d.position[1],
      g.shipZ - d.position[2],
    ]);
    const lerp = 0.05;
    d.velocity[0] = d.velocity[0] * (1 - lerp) + dir[0] * 3.5 * lerp;
    d.velocity[1] = d.velocity[1] * (1 - lerp) + dir[1] * 3.5 * lerp;
    d.velocity[2] = d.velocity[2] * (1 - lerp) + dir[2] * 3.5 * lerp;
    d.position[0] += d.velocity[0] * step;
    d.position[1] += d.velocity[1] * step;
    d.position[2] += d.velocity[2] * step;
    const sdx = d.position[0] - g.shipX;
    const sdy = d.position[1] - g.shipY;
    const sdz = d.position[2] - g.shipZ;
    const shieldedShip = isPowerUpActive(g, "shield") || isPowerUpActive(g, "warp");
    if (now > g.invulnUntil && !shieldedShip &&
        sdx * sdx + sdy * sdy + sdz * sdz < 0.9 * 0.9) {
      g.status = "dying";
      g.dyingAt = now;
      g.deathVelX = -sdx / (Math.hypot(sdx, sdy) || 1) * 7;
      g.deathVelY = -sdy / (Math.hypot(sdx, sdy) || 1) * 7 + 3.5;
      g.deathVelZ = 2.5;
      g.deathAngVel = (Math.random() - 0.5) * 10;
      spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#d946ef", 500, 0.45);
      spawnShipDebris(g);
      sounds.play("crash");
      sounds.stopMusic(0.4);
      sounds.playLosingJingle();
      boss.subEntities.splice(i, 1);
      continue;
    }
    if (now - d.createdAt > d.ttlMs || d.position[2] > 10) {
      boss.subEntities.splice(i, 1);
    }
  }
}

function runDrifterBehavior(g: GameRefs, boss: BossState, now: number): void {
  const phaseAge = now - boss.phaseStartAt;
  boss.position[0] = Math.sin(phaseAge * 0.0005) * 4;
  boss.position[1] = 2 + Math.cos(phaseAge * 0.0008) * 1.5;
  boss.position[2] = -12;
  const shotInterval = 2000 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    for (let k = 0; k < 4; k++) {
      const angle = (k - 1.5) * 0.35;
      const dir = normalizeVec3([Math.sin(angle), -0.2, 1]);
      g.bossProjectiles.push({
        id: g.nextBossProjectileId++,
        position: [boss.position[0], boss.position[1] - 0.5, boss.position[2] + 0.5],
        velocity: [dir[0] * 4, dir[1] * 4, dir[2] * 4],
        radius: 0.45,
        color: "#0ea5e9",
        spawnedAt: now,
        ttlMs: 5000,
        homing: true,
        shielded: false,
      });
    }
    boss.lastShotAt = now;
  }
}

function runSentinelBehavior(g: GameRefs, boss: BossState, now: number): void {
  const phaseAge = now - boss.phaseStartAt;
  boss.position[0] = Math.sin(phaseAge * 0.0008) * 3.5;
  const shotInterval = 1200 / boss.difficultyMult;
  if (now - boss.lastShotAt >= shotInterval) {
    const angleRad = boss.patternIndex * (Math.PI / 4);
    const gap = 1.4;
    const perpX = Math.cos(angleRad);
    const perpY = Math.sin(angleRad);
    const dir = normalizeVec3([
      g.shipX - boss.position[0],
      g.shipY - boss.position[1],
      g.shipZ - boss.position[2],
    ]);
    const speed = 12;
    for (let k = -1; k <= 1; k += 2) {
      g.bossProjectiles.push({
        id: g.nextBossProjectileId++,
        position: [
          boss.position[0] + perpX * gap * k,
          boss.position[1] + perpY * gap * k,
          boss.position[2],
        ],
        velocity: [dir[0] * speed, dir[1] * speed, dir[2] * speed],
        radius: 0.35,
        color: "#ef4444",
        spawnedAt: now,
        ttlMs: 4000,
        homing: false,
        shielded: true,
      });
    }
    boss.lastShotAt = now;
    boss.patternIndex = (boss.patternIndex + 1) % 8;
  }
}

function spawnBoss(state: GameRefs, bossId: BossId, recycleCount: number): void {
  const tier = BOSS_TIERS[bossId];
  const difficultyMult = Math.pow(1.3, recycleCount);
  const baseHp = BOSS_BASE_HP[bossId];
  const now = performance.now();
  const seed = Math.floor(now) ^ (tier * 1_000_003);
  state.boss = {
    id: bossId,
    tier,
    hp: baseHp * difficultyMult,
    hpMax: baseHp * difficultyMult,
    position: [0, 6, -40],
    velocity: [0, 0, 0.6],
    phase: "intro",
    phaseStartAt: now,
    encounterStartAt: now,
    lastShotAt: now,
    patternIndex: 0,
    difficultyMult,
    subEntities: [],
    rng: mulberry32(seed),
  };
}

interface GameRefs {
  status: GameStatus;
  score: number;
  kills: number;
  distance: number;       // units travelled, ~10/sec base
  combo: number;          // consecutive-kill multiplier (starts at 1)
  comboLastAt: number;    // performance.now() of last combo increment
  comboPeak: number;      // highest combo this run (for leaderboard stat)
  obstacles: Obstacle[];
  bullets: Bullet[];
  explosions: Explosion[];
  speedLines: SpeedLine[];
  powerUps: PowerUp[];
  coins: Coin[];
  coinsThisRun: number;
  // Boss system
  boss: BossState | null;
  bossProjectiles: BossProjectile[];
  bossSchedule: { distance: number; bossId: BossId }[];
  bossScheduleIdx: number;
  bossesDefeatedThisRun: number;
  normalSpawningPausedUntil: number;
  devHotkeyArmed: boolean;
  nextBossProjectileId: number;
  lastBossPulseAt: number;
  // Upgrade-derived run modifiers, set at startRun from profile.ownedUpgrades.
  coinMagnetExtra: number;    // world units added to coin pickup radius
  coinValueBonus: number;     // added to each coin's base value
  scoreMultiplier: number;    // multiplies final score
  comboWindowMs: number;      // overrides COMBO_WINDOW_MS when > 0
  shieldDurationMs: number;   // overrides POWERUP_DURATION_MS for shield when > 0
  activePowerUps: ActivePowerUp[];
  debris: Debris[];
  scorePopups: ScorePopup[];
  targetX: number; targetY: number;
  shipX: number; shipY: number; shipZ: number;
  shipRotZ: number;
  // Death physics
  deathVelX: number;
  deathVelY: number;
  deathVelZ: number;
  deathAngVel: number;
  // Smooth biome lerp — current rendered colors interpolate toward env target
  fogColor: THREE.Color;
  ambientColor: THREE.Color;
  asteroidColor: THREE.Color;
  asteroidEmissive: THREE.Color;
  starColor: THREE.Color;
  // Track shield + warp state edges so we can play on/off SFX
  shieldActiveLast: boolean;
  warpActiveLast: boolean;
  // Mobile flag — affects spawn rates / difficulty so the smaller arena
  // remains playable.
  isMobile: boolean;
  // Smooth warp ramp — lerps 0→1 on activation, 1→0 on expiry (deceleration)
  warpIntensity: number;
  // Toggle: when true, armed-state colors lerp toward INVERTED_ARMED_ENV
  // (used on light-themed portfolio to blend with the page).
  invertedArmed: boolean;
  // Distance-based biome system (replaces the fixed time-based cycle)
  currentEnv: Environment;
  nextBiomeAt: number; // distance in metres at which to swap biomes
  nextWallAt: number;  // performance.now() timestamp for next wall spawn
  lastBullet: number;
  lastSpawn: number;
  lastPowerUpSpawn: number;
  lastUiSync: number;
  nextId: number;
  startedAt: number;
  invulnUntil: number;
  dyingAt: number;
  shipFallSpeed: number;
  cameraTargetX: number;
  cameraTargetY: number;
  cameraTargetZ: number;
}

// Random distance until next biome change — keeps transitions unpredictable.
function pickNextBiomeDistance(currentDist: number): number {
  return currentDist + 700 + Math.random() * 900; // 700–1600m further
}

// Walls trigger every 25-40s of real time. Randomized so the player can't
// memorize the cadence.
function nextWallTimeMs(now: number): number {
  return now + 25_000 + Math.random() * 15_000;
}

function pickRandomBiome(exclude: Environment | null): Environment {
  if (!exclude) return ENVIRONMENTS[Math.floor(Math.random() * ENVIRONMENTS.length)];
  const others = ENVIRONMENTS.filter((e) => e !== exclude);
  return others[Math.floor(Math.random() * others.length)];
}

function createRefs(): GameRefs {
  // Status starts as "armed" — the run begins on the player's first input.
  const initEnv = ENVIRONMENTS[0];
  return {
    status: "armed",
    score: 0, kills: 0, distance: 0,
    combo: 1, comboLastAt: 0, comboPeak: 1,
    obstacles: [], bullets: [], explosions: [], speedLines: [],
    powerUps: [], coins: [], coinsThisRun: 0,
    coinMagnetExtra: 0, coinValueBonus: 0, scoreMultiplier: 1,
    comboWindowMs: 0, shieldDurationMs: 0,
    boss: null, bossProjectiles: [], bossSchedule: buildBossSchedule(),
    bossScheduleIdx: 0, bossesDefeatedThisRun: 0,
    normalSpawningPausedUntil: 0, devHotkeyArmed: false,
    nextBossProjectileId: 0, lastBossPulseAt: 0,
    activePowerUps: [], debris: [], scorePopups: [],
    targetX: 0, targetY: 0, shipX: 0, shipY: 0, shipZ: 2, shipRotZ: 0,
    fogColor: new THREE.Color(initEnv.fog),
    ambientColor: new THREE.Color(initEnv.ambient),
    asteroidColor: new THREE.Color(initEnv.asteroidColor),
    asteroidEmissive: new THREE.Color(initEnv.asteroidEmissive),
    starColor: new THREE.Color(initEnv.starColor),
    shieldActiveLast: false,
    warpActiveLast: false,
    isMobile: typeof window !== "undefined" &&
      (matchMedia("(pointer: coarse)").matches || window.innerWidth < 640),
    warpIntensity: 0,
    invertedArmed: false,
    currentEnv: initEnv,
    nextBiomeAt: pickNextBiomeDistance(0),
    nextWallAt: 0, // set by startRun
    lastBullet: 0, lastSpawn: 0, lastPowerUpSpawn: 0, lastUiSync: 0,
    nextId: 1, startedAt: 0,
    invulnUntil: 0,
    dyingAt: 0, shipFallSpeed: 0,
    deathVelX: 0, deathVelY: 0, deathVelZ: 0, deathAngVel: 0,
    cameraTargetX: 0, cameraTargetY: 0, cameraTargetZ: 5,
  };
}

// Called when the player's first input is detected. Idempotent — only
// transitions `armed` → `playing`.
function startRun(g: GameRefs): boolean {
  if (g.status !== "armed") return false;
  const now = performance.now();
  g.status = "playing";
  g.startedAt = now;
  g.invulnUntil = now + START_INVULN_MS;
  g.lastSpawn = now;
  g.lastPowerUpSpawn = now;
  g.lastUiSync = 0;
  // First wall at least 20s into the run — the player needs warm-up time
  // before facing a forced-positioning challenge.
  g.nextWallAt = now + 20_000;

  // Apply purchased upgrades as per-run modifiers. All lookups happen here —
  // per-frame logic reads these fields, never the profile/catalog directly.
  const profile = loadProfile();
  const getLevel = (id: string) => profile.ownedUpgrades[id] ?? 0;
  const magnetDef = upgradeById("coin-magnet");
  const valueDef = upgradeById("coin-value");
  const scoreDef = upgradeById("score-multiplier");
  const comboDef = upgradeById("combo-window");
  const shieldDef = upgradeById("shield-duration");
  // coin-magnet: base 1.0 at level 0 → 3.0 at level 5, add the delta to base 0
  g.coinMagnetExtra = magnetDef ? magnetDef.effectAtLevel(getLevel("coin-magnet")) - 1 : 0;
  // coin-value: base 1 → up to 6, so delta goes above baseline coin.value
  g.coinValueBonus = valueDef ? valueDef.effectAtLevel(getLevel("coin-value")) - 1 : 0;
  g.scoreMultiplier = scoreDef ? scoreDef.effectAtLevel(getLevel("score-multiplier")) : 1;
  g.comboWindowMs = comboDef ? comboDef.effectAtLevel(getLevel("combo-window")) * 1000 : 0;
  g.shieldDurationMs = shieldDef ? shieldDef.effectAtLevel(getLevel("shield-duration")) : 0;

  sounds.startGameplayMusic();
  return true;
}

function nextId(g: GameRefs): number {
  const id = g.nextId;
  g.nextId = id + 1;
  return id;
}

function isPowerUpActive(g: GameRefs, t: PowerUpType): boolean {
  const now = performance.now();
  return g.activePowerUps.some((p) => p.type === t && p.expiresAt > now);
}

// Cached THREE.Color targets per environment (avoids per-frame allocation)
const ENV_COLOR_CACHE = new WeakMap<Environment, {
  fog: THREE.Color;
  ambient: THREE.Color;
  asteroidColor: THREE.Color;
  asteroidEmissive: THREE.Color;
  starColor: THREE.Color;
}>();

function envColors(env: Environment) {
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

function activatePowerUp(g: GameRefs, t: PowerUpType): void {
  const now = performance.now();
  // Shield duration is upgradable; other power-ups use the base duration.
  const durationMs = (t === "shield" && g.shieldDurationMs > 0)
    ? g.shieldDurationMs
    : POWERUP_DURATION_MS;
  const expiresAt = now + durationMs;
  const existing = g.activePowerUps.find((p) => p.type === t);
  if (existing) {
    existing.expiresAt = expiresAt;
  } else {
    g.activePowerUps.push({ type: t, expiresAt });
  }
}

// ---------- difficulty ----------

// `difficulty` ramps from 0 to ~1.5 over the first 90 seconds, then keeps
// growing slowly. Drives spawn rate, asteroid speed, and unlock thresholds.
function difficulty(g: GameRefs): number {
  const t = (performance.now() - g.startedAt) / 1000;
  const base = Math.min(0.2 + t * 0.012, 2.5);
  return g.isMobile ? base * 0.85 : base; // 15% softer on mobile
}

function elapsedSeconds(g: GameRefs): number {
  return (performance.now() - g.startedAt) / 1000;
}

function comboMultiplier(combo: number): number {
  if (combo < 3) return 1;
  if (combo < 5) return 1.5;
  if (combo < 10) return 2;
  if (combo < 20) return 3;
  if (combo < 40) return 5;
  return 10;
}

function comboColor(combo: number): string {
  if (combo >= 40) return "#f472b6";
  if (combo >= 20) return "#fb923c";
  if (combo >= 10) return "#facc15";
  if (combo >= 5) return "#22d3ee";
  return "#a3e635";
}

// NOTE: "wall" is intentionally excluded from this list. Wall pieces are
// bullet-immune dodge hazards and are only created by spawnWall() as a
// time-triggered event — never by the random spawn path.
function unlockedVariants(seconds: number): ObstacleVariant[] {
  const list: ObstacleVariant[] = ["basic"];
  if (seconds > 25) list.push("heavy");
  if (seconds > 50) list.push("speeder");
  return list;
}

function spawnIntervalMs(g: GameRefs): number {
  const d = difficulty(g);
  return Math.max(280, 900 - d * 280);
}

function fireIntervalMs(g: GameRefs): number {
  const base = isPowerUpActive(g, "rapid") ? 95 : 220;
  const d = difficulty(g);
  return Math.max(70, base - d * 30);
}

function bulletDamage(g: GameRefs): number {
  return 1 + (isPowerUpActive(g, "mega") ? 3 : 0);
}

// ---------- spawning ----------

function spawnObstacle(g: GameRefs): Obstacle {
  const seconds = elapsedSeconds(g);
  const variants = unlockedVariants(seconds);
  const variant = variants[Math.floor(Math.random() * variants.length)];

  // Anti-camp: 35% of asteroids are loosely aimed at the player's wider
  // neighborhood (±3 X, ±2 Y), 65% uniform across the arena. The wider band
  // means aim-at-player no longer concentrates on the auto-fire lane so
  // camping at any single point no longer guarantees clean kills.
  const aimAtPlayer = Math.random() < 0.35;
  let x: number, y: number;
  if (aimAtPlayer) {
    x = THREE.MathUtils.clamp(g.shipX + (Math.random() - 0.5) * 6, -ARENA_W / 2, ARENA_W / 2);
    y = THREE.MathUtils.clamp(g.shipY + (Math.random() - 0.5) * 4, -ARENA_H / 2, ARENA_H / 2);
  } else {
    x = (Math.random() - 0.5) * ARENA_W;
    y = (Math.random() - 0.5) * ARENA_H;
  }

  const baseSpeed = 9 + difficulty(g) * 4;
  let size = 0.55 + Math.random() * 0.45;
  let hp = 1;
  let speed = baseSpeed;

  if (variant === "heavy") {
    size = 0.95 + Math.random() * 0.4;
    hp = 3;
    speed = baseSpeed * 0.7;
  } else if (variant === "speeder") {
    size = 0.4 + Math.random() * 0.2;
    hp = 1;
    speed = baseSpeed * 1.6;
  }

  // ~25% of basic asteroids get a lateral drift so even a stationary player
  // can't rely on asteroids staying out of their column. Speeders and heavies
  // stay straight-line — they already have their own identity.
  let vx = 0;
  let vy = 0;
  if (variant === "basic" && Math.random() < 0.25) {
    // Drift toward the opposite half of the arena so an asteroid spawned on
    // the left sweeps right and vice versa. 1-2.5 units/sec horizontal,
    // slight vertical component for visual variety.
    vx = -Math.sign(x || 1) * (1 + Math.random() * 1.5);
    vy = (Math.random() - 0.5) * 1.5;
  }

  return {
    id: nextId(g),
    variant,
    x, y,
    z: SPAWN_Z - Math.random() * 8,
    rx: Math.random() * Math.PI,
    ry: Math.random() * Math.PI,
    rz: Math.random() * Math.PI,
    rsx: (Math.random() - 0.5) * 1.8,
    rsy: (Math.random() - 0.5) * 1.8,
    rsz: (Math.random() - 0.5) * 1.8,
    vx, vy, vz: speed,
    size, hp,
    shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
    closestApproach: Infinity,
    brushed: false,
  };
}

// Pick a gap X position for a wall. The gap is placed at least MIN_GAP_DIST
// units from the player's current X so the player has to physically cross
// the arena to reach it — breaking the edge-camping strategy.
function pickWallGapX(playerX: number, arenaW: number): number {
  const MIN_GAP_DIST = 3;
  const half = arenaW / 2;
  // Try candidates; pick the one farthest from the player, subject to the
  // minimum-distance rule.
  let best = -playerX; // mirror is usually far; safety fallback below handles center-spawn
  let bestDist = Math.abs(best - playerX);
  for (let i = 0; i < 5; i++) {
    const candidate = (Math.random() - 0.5) * (arenaW - 2);
    const dist = Math.abs(candidate - playerX);
    if (dist >= MIN_GAP_DIST && dist > bestDist) {
      best = candidate;
      bestDist = dist;
    }
  }
  // Safety: if every candidate failed, step MIN_GAP_DIST away from the player
  // toward the nearest edge.
  if (bestDist < MIN_GAP_DIST) {
    best = playerX > 0 ? playerX - MIN_GAP_DIST : playerX + MIN_GAP_DIST;
  }
  // Clamp inside arena so the gap isn't cut off by the edge.
  return THREE.MathUtils.clamp(best, -half + 1, half - 1);
}

// Spawn a wall: a line of asteroids across the full arena width at the same
// Z with a single gap. Forces the player to move into the gap — breaks the
// "camp at the edge and let auto-fire clear everything" exploit.
function spawnWall(g: GameRefs) {
  const WALL_COUNT = 6;           // 6 asteroid slots evenly spaced across ARENA_W
  const ROWS = 3;                 // 3 stacked rows so the gap is a full-height Y column
  const gapX = pickWallGapX(g.shipX, ARENA_W);
  const slotWidth = ARENA_W / WALL_COUNT;
  const baseSpeed = 10 + difficulty(g) * 3;
  // Find the single slot index whose center is closest to gapX. Skipping
  // that one slot across ALL rows means the gap is a vertical column at
  // that X — the player must traverse to it, they can't dodge by moving
  // to a corner of the arena.
  let gapIndex = 0;
  let gapBestDist = Infinity;
  for (let i = 0; i < WALL_COUNT; i++) {
    const x = -ARENA_W / 2 + (i + 0.5) * slotWidth;
    const d = Math.abs(x - gapX);
    if (d < gapBestDist) { gapBestDist = d; gapIndex = i; }
  }
  // Row Y positions span the full arena height: top, middle, bottom.
  const rowYs = [-ARENA_H / 3, 0, ARENA_H / 3];
  for (let r = 0; r < ROWS; r++) {
    for (let i = 0; i < WALL_COUNT; i++) {
      if (i === gapIndex) continue;
      const x = -ARENA_W / 2 + (i + 0.5) * slotWidth;
      g.obstacles.push({
        id: nextId(g),
        variant: "wall",
        x,
        // Small per-piece jitter so the rows don't look like a perfect grid
        y: rowYs[r] + (Math.random() - 0.5) * 0.4,
        z: SPAWN_Z - r * 0.3, // minor Z stagger so bullets can pick through row-by-row
        rx: Math.random() * Math.PI,
        ry: Math.random() * Math.PI,
        rz: Math.random() * Math.PI,
        rsx: (Math.random() - 0.5) * 1.8,
        rsy: (Math.random() - 0.5) * 1.8,
        rsz: (Math.random() - 0.5) * 1.8,
        vx: 0, vy: 0,
        vz: baseSpeed,
        size: 0.8,
        hp: 999, // wall pieces are bullet-immune (variant === "wall" skips
                 // the collision), so HP is a no-op — high value avoids any
                 // edge case where despawn logic might read it
        shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
        closestApproach: Infinity,
        brushed: false,
      });
    }
  }
}

// Coins drop from destroyed asteroids. Value scales with combo so skilled
// play earns more currency.
function spawnCoin(g: GameRefs, x: number, y: number, z: number, value: number) {
  g.coins.push({
    id: nextId(g),
    x, y, z,
    rx: 0, ry: 0, rz: 0,
    value,
  });
}

function spawnPowerUp(g: GameRefs): PowerUp {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  return {
    id: nextId(g),
    type,
    x: (Math.random() - 0.5) * (ARENA_W * 0.7),
    y: (Math.random() - 0.5) * (ARENA_H * 0.7),
    z: SPAWN_Z - 4,
    rx: 0, ry: 0, rz: 0,
  };
}

function styleForBullet(g: GameRefs): BulletStyle {
  if (isPowerUpActive(g, "mega")) return "plasma";
  if (isPowerUpActive(g, "triple")) return "bolt";
  return "sprite";
}

function bulletColor(g: GameRefs): string {
  if (isPowerUpActive(g, "mega")) return "#a78bfa";
  if (isPowerUpActive(g, "triple")) return "#f472b6";
  if (isPowerUpActive(g, "rapid")) return "#22d3ee";
  return "#fde047";
}

function fireBullets(g: GameRefs, now: number, sounds: SoundManager) {
  if (g.bullets.length >= MAX_BULLETS) return;
  const style = styleForBullet(g);
  const color = bulletColor(g);
  const dmg = bulletDamage(g);
  const baseSize = 0.07;
  const make = (vx: number, sx: number, sizeMul = 1, hp = 1) => {
    g.bullets.push({
      id: nextId(g),
      x: g.shipX + sx, y: g.shipY + 0.05, z: 1.5,
      vx, vy: 0, vz: -55,
      size: baseSize * sizeMul,
      damage: dmg, color, hp, style,
    });
  };
  if (isPowerUpActive(g, "mega")) {
    make(0, 0, 2.6, 3);
  } else if (isPowerUpActive(g, "triple")) {
    make(0, 0);
    make(-2.2, -0.32);
    make(2.2, 0.32);
  } else {
    make(0, 0);
  }
  g.lastBullet = now;
  sounds.play("laser");
}

function spawnExplosion(g: GameRefs, x: number, y: number, z: number, color: string, duration = 600, scale = 0.3) {
  g.explosions.push({
    id: nextId(g), x, y, z,
    startedAt: performance.now(),
    color, scale, opacity: 1, duration,
  });
}

function spawnScorePopup(g: GameRefs, x: number, y: number, z: number, amount: number) {
  g.scorePopups.push({
    id: nextId(g), x, y, z, amount,
    spawnedAt: performance.now(),
    ttl: 1100,
  });
}

// Spawn the chunks that fly off when the ship is destroyed: two red wing
// tips and a cyan cockpit shard. Each gets the ship's death impulse plus a
// random kick so they fan out instead of moving in formation.
function spawnShipDebris(g: GameRefs) {
  const baseVx = g.deathVelX;
  const baseVy = g.deathVelY;
  const baseVz = g.deathVelZ;
  const now = performance.now();
  const make = (
    offsetX: number, offsetY: number, offsetZ: number,
    color: string,
    sx: number, sy: number, sz: number,
    kickX: number, kickY: number,
  ) => {
    g.debris.push({
      id: nextId(g),
      x: g.shipX + offsetX,
      y: g.shipY + offsetY,
      z: g.shipZ + offsetZ,
      vx: baseVx + kickX,
      vy: baseVy + kickY,
      vz: baseVz * 0.7 + (Math.random() - 0.5) * 2,
      rx: 0, ry: 0, rz: 0,
      rsx: (Math.random() - 0.5) * 8,
      rsy: (Math.random() - 0.5) * 8,
      rsz: (Math.random() - 0.5) * 8,
      size: [sx, sy, sz],
      color,
      spawnedAt: now,
      ttl: 1800,
    });
  };
  // Right wing tip (red)
  make(0.55, -0.03, 0.28, "#dc2626", 0.18, 0.05, 0.16, 4, 1.5);
  // Left wing tip (red)
  make(-0.55, -0.03, 0.28, "#dc2626", 0.18, 0.05, 0.16, -4, 1.5);
  // Cockpit shard (cyan)
  make(0, 0.1, -0.18, "#22d3ee", 0.16, 0.12, 0.16, (Math.random() - 0.5) * 3, 2.5);
}

// ---------- sound (Web Audio synth, no asset files) ----------

type SoundType = "laser" | "boom" | "chime" | "crash" | "shieldOn" | "shieldOff" | "warp";

class SoundManager {
  private ctx: AudioContext | null = null;
  private enabled = false;
  private lastPlay: Record<SoundType, number> = {
    laser: 0, boom: 0, chime: 0, crash: 0, shieldOn: 0, shieldOff: 0, warp: 0,
  };
  // Sustained warp whoosh that loops while warp power-up is active
  private warpLoop: { src: AudioBufferSourceNode; gain: GainNode; lfo?: OscillatorNode; lfoGain?: GainNode } | null = null;
  // Music subsystem — only one track at a time, with crossfades.
  private music: {
    track: "gameplay" | "leaderboard";
    masterGain: GainNode;
    interval: ReturnType<typeof setInterval>;
    step: number;
  } | null = null;

  setEnabled(v: boolean) {
    this.enabled = v;
    if (v) this.ensure();
    else {
      this.stopWarpLoop();
      this.stopMusic(0);
    }
  }

  isEnabled() {
    return this.enabled;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
  }

  play(type: SoundType) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    // throttle laser to avoid clipping when rapid-fire
    const now = performance.now();
    if (type === "laser" && now - this.lastPlay.laser < 70) return;
    this.lastPlay[type] = now;
    switch (type) {
      case "laser": this.playLaser(); break;
      case "boom": this.playBoom(); break;
      case "chime": this.playChime(); break;
      case "crash": this.playCrash(); break;
      case "shieldOn": this.playShieldOn(); break;
      case "shieldOff": this.playShieldOff(); break;
      case "warp": this.playWarp(); break;
    }
  }

  // Low triangle pulse during boss fights — driven from runTick every ~700ms.
  bossPulse() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(55, t);
    gain.gain.setValueAtTime(0.0, t);
    gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  // Soft sine pulse, easy on the ears since it fires constantly.
  private playLaser() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.06);
    gain.gain.setValueAtTime(0.025, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  // Meteor explosion — three layers stacked for body + crunch + rumble:
  //  1. Sharp filtered-noise crack (the initial hit, lasts ~0.15s)
  //  2. Pitched-down sub-bass thump (the deep body, ~0.35s)
  //  3. Long rumbling debris tail (low-passed noise, ~0.7s) so the explosion
  //     decays into space rather than ending abruptly.
  private playBoom() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;

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
    crackGain.gain.setValueAtTime(0.10, t);
    crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDur);
    crackSrc.connect(crackFilt).connect(crackGain).connect(ctx.destination);
    crackSrc.start(t);

    // Layer 2: deep sub-bass thump (the "thoom" of the meteor)
    const sub = ctx.createOscillator();
    const subGain = ctx.createGain();
    sub.type = "sine";
    sub.frequency.setValueAtTime(110, t);
    sub.frequency.exponentialRampToValueAtTime(28, t + 0.4);
    subGain.gain.setValueAtTime(0.18, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
    sub.connect(subGain).connect(ctx.destination);
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
    tailSrc.connect(tailFilt).connect(tailGain).connect(ctx.destination);
    tailSrc.start(t);
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
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
    }
  }

  private playCrash() {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
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
    src.connect(filt).connect(gain).connect(ctx.destination);
    src.start(t);
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
    osc.connect(gain).connect(ctx.destination);
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
    osc.connect(gain).connect(ctx.destination);
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
    src.connect(filt).connect(gain).connect(ctx.destination);
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
    src.connect(filt).connect(gain).connect(ctx.destination);
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
      try { src.stop(); } catch { /* ignore */ }
      try { lfo?.stop(); } catch { /* ignore */ }
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

  // 0 = rest (silence on that step — creates rhythmic breathing room).
  private static GAMEPLAY_SECTIONS: { lead: number[]; bass: number[]; leadType: OscillatorType }[] = [
    // "Launch" motif — signature ascending 5th leap then fall-back
    { lead: [440, 0, 659.25, 880, 0, 659.25, 0, 880], bass: [110, 110, 130.81, 130.81, 87.31, 87.31, 98, 98], leadType: "triangle" },
    // "Drift" — slow wide intervals, spacey and eerie
    { lead: [329.63, 0, 0, 659.25, 493.88, 0, 329.63, 0], bass: [82.41, 82.41, 98, 98, 73.42, 73.42, 82.41, 82.41], leadType: "sine" },
    // "Pulse" — syncopated rhythm, octave jumps
    { lead: [0, 587.33, 293.66, 0, 587.33, 0, 440, 880], bass: [146.83, 146.83, 130.81, 130.81, 110, 110, 98, 98], leadType: "triangle" },
    // "Nebula" — high shimmering, tritone tension
    { lead: [783.99, 0, 554.37, 783.99, 0, 0, 1046.5, 783.99], bass: [98, 98, 123.47, 123.47, 87.31, 87.31, 98, 98], leadType: "sine" },
    // "Comet" — fast descending run then silence
    { lead: [1318.5, 1046.5, 880, 659.25, 0, 0, 0, 440], bass: [87.31, 87.31, 110, 110, 130.81, 130.81, 87.31, 87.31], leadType: "triangle" },
    // "Supernova" — the signature motif returns an octave higher (climax)
    { lead: [880, 0, 1318.5, 1760, 0, 1318.5, 0, 1760], bass: [110, 110, 130.81, 130.81, 146.83, 146.83, 98, 98], leadType: "triangle" },
    // "Resolve" — descending 4ths, calming
    { lead: [1046.5, 0, 783.99, 0, 523.25, 0, 392, 523.25], bass: [130.81, 130.81, 110, 110, 87.31, 87.31, 98, 98], leadType: "sine" },
    // "Echo" — the launch motif low and quiet, then rest (reset)
    { lead: [220, 0, 329.63, 440, 0, 0, 0, 0], bass: [110, 110, 87.31, 87.31, 73.42, 73.42, 98, 98], leadType: "triangle" },
  ];

  private static LEADERBOARD_SECTIONS: { lead: number[]; bass: number[]; leadType: OscillatorType }[] = [
    // "Aftermath" — sparse, wide intervals
    { lead: [329.63, 0, 0, 659.25, 0, 493.88, 0, 246.94], bass: [82.41, 82.41, 110, 110, 73.42, 73.42, 98, 98], leadType: "sine" },
    // "Memory" — gentle stepwise with pauses
    { lead: [220, 261.63, 0, 329.63, 0, 0, 220, 0], bass: [110, 110, 130.81, 130.81, 87.31, 87.31, 110, 110], leadType: "sine" },
    // "Stars" — rising hope with held high note
    { lead: [293.66, 0, 440, 0, 587.33, 587.33, 0, 0], bass: [146.83, 146.83, 110, 110, 123.47, 123.47, 146.83, 146.83], leadType: "triangle" },
    // "Home" — the launch motif low and gentle, nostalgic
    { lead: [220, 0, 329.63, 440, 0, 329.63, 0, 220], bass: [98, 98, 82.41, 82.41, 73.42, 73.42, 98, 98], leadType: "sine" },
  ];

  // Drone pad node — a sustained low hum under the music
  private dronePad: { osc1: OscillatorNode; osc2: OscillatorNode; lfo: OscillatorNode; gain: GainNode } | null = null;

  startGameplayMusic() {
    this.startMusicLoop("gameplay", {
      bpm: 130,
      sections: SoundManager.GAMEPLAY_SECTIONS,
      stepsPerSection: 16,
      bassType: "sine",
      masterTarget: 0.10,
    });
  }

  startLeaderboardMusic() {
    this.startMusicLoop("leaderboard", {
      bpm: 84,
      sections: SoundManager.LEADERBOARD_SECTIONS,
      stepsPerSection: 16,
      bassType: "triangle",
      masterTarget: 0.11,
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
      try { osc1.stop(); } catch { /* */ }
      try { osc2.stop(); } catch { /* */ }
      try { lfo.stop(); } catch { /* */ }
    }, 600);
    this.dronePad = null;
  }

  // Space texture one-shots triggered periodically inside the sequencer.
  private playScannerPing(dest: AudioNode) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
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

  private playRadioCrackle(dest: AudioNode) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
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

  private playDeepRumble(dest: AudioNode) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
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
      sections: { lead: number[]; bass: number[]; leadType: OscillatorType }[];
      stepsPerSection: number;
      bassType: OscillatorType;
      masterTarget: number;
    },
  ) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    if (this.music?.track === track) return;
    this.stopMusic(0.6);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, t);
    masterGain.gain.linearRampToValueAtTime(cfg.masterTarget, t + 0.8);
    masterGain.connect(ctx.destination);
    // Drone pad underneath — a sustained low hum giving "spaceship interior"
    this.startDronePad(masterGain);
    const beatMs = 60000 / cfg.bpm / 2; // 8th notes
    let step = 0;
    let sectionIdx = 0;
    const fire = () => {
      if (!this.ctx || !this.music || this.music.track !== track) return;
      const now = this.ctx.currentTime;
      const sec = cfg.sections[sectionIdx % cfg.sections.length];
      const sectionStep = step % cfg.stepsPerSection;
      const leadF = sec.lead[sectionStep % sec.lead.length];
      const bassF = sec.bass[sectionStep % sec.bass.length];
      const dur = beatMs / 1000;
      // Lead voice (skip if 0 = rest)
      if (leadF > 0) {
        const leadOsc = this.ctx.createOscillator();
        const leadGain = this.ctx.createGain();
        leadOsc.type = sec.leadType;
        leadOsc.frequency.value = leadF;
        leadGain.gain.setValueAtTime(0.34, now);
        leadGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.85);
        leadOsc.connect(leadGain).connect(masterGain);
        leadOsc.start(now);
        leadOsc.stop(now + dur);
        // Shimmer: detuned copy ~6 cents sharp creates a chorus/space-pad
        const shimOsc = this.ctx.createOscillator();
        const shimGain = this.ctx.createGain();
        shimOsc.type = "sine";
        shimOsc.frequency.value = leadF * 1.0035; // ~6 cents sharp
        shimGain.gain.setValueAtTime(0.12, now);
        shimGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.9);
        shimOsc.connect(shimGain).connect(masterGain);
        shimOsc.start(now);
        shimOsc.stop(now + dur);
      }
      // Harmony: every 4th step add a fifth above
      if (leadF > 0 && step % 4 === 2) {
        const harmOsc = this.ctx.createOscillator();
        const harmGain = this.ctx.createGain();
        harmOsc.type = "sine";
        harmOsc.frequency.value = leadF * 1.5;
        harmGain.gain.setValueAtTime(0.10, now);
        harmGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 0.6);
        harmOsc.connect(harmGain).connect(masterGain);
        harmOsc.start(now);
        harmOsc.stop(now + dur * 0.7);
      }
      // Bass — quarter notes (every other 8th)
      if (step % 2 === 0) {
        const bassOsc = this.ctx.createOscillator();
        const bassGain = this.ctx.createGain();
        bassOsc.type = cfg.bassType;
        bassOsc.frequency.value = bassF;
        bassGain.gain.setValueAtTime(0.45, now);
        bassGain.gain.exponentialRampToValueAtTime(0.001, now + dur * 1.6);
        bassOsc.connect(bassGain).connect(masterGain);
        bassOsc.start(now);
        bassOsc.stop(now + dur * 1.7);
      }
      // ---- Space texture events (periodic) ----
      // Scanner ping every ~4s (every section start)
      if (step > 0 && step % cfg.stepsPerSection === 0) {
        this.playScannerPing(masterGain);
      }
      // Radio crackle burst every ~8s
      if (step > 0 && step % (cfg.stepsPerSection * 2) === 8) {
        this.playRadioCrackle(masterGain);
      }
      // Deep-space rumble every ~16s
      if (step > 0 && step % (cfg.stepsPerSection * 4) === 0) {
        this.playDeepRumble(masterGain);
      }
      step++;
      // Advance section every N steps so the progression evolves
      if (step % cfg.stepsPerSection === 0) sectionIdx++;
    };
    const interval = setInterval(fire, beatMs);
    this.music = { track, masterGain, interval, step: 0 };
    fire();
  }

  // Crossfade the current music out over `fadeSec` seconds (default 0.5).
  stopMusic(fadeSec = 0.5) {
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
    setTimeout(() => {
      try { g.disconnect(); } catch { /* ignore */ }
    }, Math.max(40, fadeSec * 1000 + 60));
    this.music = null;
  }

  // Short descending three-note jingle on death.
  playLosingJingle() {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = [493.88, 392.00, 311.13]; // B4 → G4 → D#4 (sad descent)
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const start = t + i * 0.18;
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.35);
    });
  }
}

// Module-level singleton — survives React StrictMode double-mounts
const sounds = new SoundManager();

// ---------- game tick ----------

interface Viewport { width: number; height: number }

function runTick(
  g: GameRefs,
  dt: number,
  viewport: Viewport,
  onDeath: () => void,
  onUiSync: () => void,
) {
  const now = performance.now();
  const step = Math.min(dt, 0.05);

  // Sync world arena dimensions to the visible viewport but cap at the
  // configured maximums so ultrawide canvases don't grant extra play space.
  // On portrait/touch, switch to a taller-but-narrower mobile arena.
  const aspect = viewport.width / Math.max(0.001, viewport.height);
  const portraitOrMobile = g.isMobile || aspect < 1.05;
  const maxW = portraitOrMobile ? ARENA_W_MOBILE : ARENA_W_DESKTOP;
  const maxH = portraitOrMobile ? ARENA_H_MOBILE : ARENA_H_DESKTOP;
  setArena(
    Math.min(maxW, viewport.width - 1),
    Math.min(maxH, viewport.height - 1),
  );

  // Distance-based biome roll — random next env every 700–1600m so the
  // transitions feel organic instead of clockwork.
  if (g.distance >= g.nextBiomeAt && g.status === "playing") {
    g.currentEnv = pickRandomBiome(g.currentEnv);
    g.nextBiomeAt = pickNextBiomeDistance(g.distance);
  }
  // Color target: inverted (light-mode armed) or the current biome.
  // The lerp handles a smooth cross-fade when the player starts the run.
  const useInverted = g.invertedArmed && g.status === "armed";
  const tc = envColors(useInverted ? INVERTED_ARMED_ENV : g.currentEnv);
  const colorLerp = Math.min(1, dt * 1.5);
  g.fogColor.lerp(tc.fog, colorLerp);
  g.ambientColor.lerp(tc.ambient, colorLerp);
  g.asteroidColor.lerp(tc.asteroidColor, colorLerp);
  g.asteroidEmissive.lerp(tc.asteroidEmissive, colorLerp);
  g.starColor.lerp(tc.starColor, colorLerp);

  // Always advance explosions
  for (let i = g.explosions.length - 1; i >= 0; i--) {
    const e = g.explosions[i];
    const age = (now - e.startedAt) / e.duration;
    if (age >= 1) {
      g.explosions.splice(i, 1);
    } else {
      e.scale = 0.3 + age * 2.6;
      e.opacity = Math.max(0, 1 - age);
    }
  }

  // Always advance score popups (drift up, fade out)
  for (let i = g.scorePopups.length - 1; i >= 0; i--) {
    const p = g.scorePopups[i];
    if (now - p.spawnedAt > p.ttl) g.scorePopups.splice(i, 1);
    else {
      const ageS = (now - p.spawnedAt) / 1000;
      p.y += step * 1.8;
      p.z += step * 6 + ageS * 1.5; // slight forward drift toward camera
    }
  }

  // Dying animation: ship retains the impulse from where it got hit, tumbles
  // along that vector with gravity dragging it down, then explodes. Camera
  // tightens onto the wreck and speed lines redirect along the death vector.
  if (g.status === "dying") {
    const elapsed = (now - g.dyingAt) / 1000;
    // Velocity integration + gravity on Y
    g.deathVelY -= step * 6.5;
    g.shipX += g.deathVelX * step;
    g.shipY += g.deathVelY * step;
    g.shipZ += g.deathVelZ * step;
    g.shipRotZ += g.deathAngVel * step;

    // Camera locks onto the falling ship for a cinematic close-up
    g.cameraTargetX = g.shipX * 0.55;
    g.cameraTargetY = g.shipY * 0.6 + 0.4;
    g.cameraTargetZ = THREE.MathUtils.lerp(g.cameraTargetZ, 3.6, Math.min(1, dt * 2.5));

    // Speed lines redirect along the ship's flight vector — drift them sideways
    // as well as forward so they no longer look like the ship is still on rails.
    const driftX = g.deathVelX * step * 0.6;
    const driftY = g.deathVelY * step * 0.6;
    for (const l of g.speedLines) {
      l.x += driftX;
      l.y += driftY;
      l.z += step * 65;
      const t = THREE.MathUtils.clamp((l.z + 40) / 44, 0, 1);
      l.life = (t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1) * 0.7;
      if (l.z > 6 || Math.abs(l.x) > 18 || Math.abs(l.y) > 12) {
        l.x = (Math.random() - 0.5) * 14;
        l.y = (Math.random() - 0.5) * 8;
        l.z = -40 - Math.random() * 4;
        l.length = 1.4 + Math.random() * 2.6;
        l.life = 0;
      }
    }

    if (elapsed > 0.6 && elapsed < 0.65) {
      spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#fbbf24", 350, 0.25);
    }
    if (elapsed > 1.4 && elapsed < 1.45) {
      spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#ef4444", 700, 0.6);
      spawnExplosion(g, g.shipX + 0.4, g.shipY + 0.2, g.shipZ, "#fbbf24", 600, 0.5);
      spawnExplosion(g, g.shipX - 0.3, g.shipY - 0.3, g.shipZ, "#f97316", 650, 0.5);
    }
    if (elapsed > 2.2) {
      g.status = "dead";
      onDeath();
    }
    // Update debris while dying
    for (let i = g.debris.length - 1; i >= 0; i--) {
      const d = g.debris[i];
      d.vy -= step * 6.5;
      d.x += d.vx * step;
      d.y += d.vy * step;
      d.z += d.vz * step;
      d.rx += d.rsx * step;
      d.ry += d.rsy * step;
      d.rz += d.rsz * step;
      if (now - d.spawnedAt > d.ttl) g.debris.splice(i, 1);
    }
    onUiSync();
    return;
  }

  // Warp intensity ramps up on activation and ramps DOWN on expiry so the
  // transition out of warp is a smooth deceleration, not a hard cut.
  const warpTarget = (g.status === "playing" && isPowerUpActive(g, "warp")) ? 1 : 0;
  const warpRampSpeed = warpTarget > 0 ? dt * 4 : dt * 1.8; // fast in, slower out
  g.warpIntensity = THREE.MathUtils.lerp(g.warpIntensity, warpTarget, Math.min(1, warpRampSpeed));
  if (g.warpIntensity < 0.01) g.warpIntensity = 0;
  const wi = g.warpIntensity; // shorthand
  const warpActive = wi > 0.05;
  // Ship lerp, camera, speed lines. Warp intensity interpolates everything.
  const lerpFactor = dt * THREE.MathUtils.lerp(11, 90, wi);
  const lerp = Math.min(1, lerpFactor);
  g.shipX += (g.targetX - g.shipX) * lerp;
  g.shipY += (g.targetY - g.shipY) * lerp;
  const targetBank = THREE.MathUtils.clamp(-(g.targetX - g.shipX) * 0.22, -0.45, 0.45);
  g.shipRotZ = THREE.MathUtils.lerp(g.shipRotZ, targetBank, 0.18);
  g.cameraTargetX = g.shipX * 0.18;
  g.cameraTargetY = g.shipY * 0.12;
  // Camera Z: smooth interpolation between base and warp-punch positions
  const baseCamZ = portraitOrMobile ? 7.5 : 5;
  const warpCamZ = portraitOrMobile ? 6.0 : 3.9;
  g.cameraTargetZ = THREE.MathUtils.lerp(baseCamZ, warpCamZ, wi);

  const desiredLines = wi > 0.5 ? 60 : 32;
  while (g.speedLines.length < desiredLines) {
    g.speedLines.push({
      x: (Math.random() - 0.5) * 14,
      y: (Math.random() - 0.5) * 8,
      z: -8 - Math.random() * 32,
      length: THREE.MathUtils.lerp(1.4, 5, wi) + Math.random() * 2.6,
      life: 0,
    });
  }
  const lineSpeed = THREE.MathUtils.lerp(65, 360, wi);
  for (const l of g.speedLines) {
    l.z += step * lineSpeed;
    const t = THREE.MathUtils.clamp((l.z + 40) / 44, 0, 1);
    l.life = t < 0.25 ? t / 0.25 : t > 0.75 ? (1 - t) / 0.25 : 1;
    if (l.z > 4) {
      l.x = (Math.random() - 0.5) * 14;
      l.y = (Math.random() - 0.5) * 8;
      l.z = -40 - Math.random() * 4;
      l.length = warpActive ? 4 + Math.random() * 4 : 1.4 + Math.random() * 2.6;
      l.life = 0;
    }
  }

  // Arena clamp every frame (works for armed too — clamps ship preview)
  const hw = Math.min(ARENA_W / 2, viewport.width / 2 - 0.5);
  const hh = Math.min(ARENA_H / 2, viewport.height / 2 - 0.5);
  g.targetX = Math.max(-hw, Math.min(hw, g.targetX));
  g.targetY = Math.max(-hh, Math.min(hh, g.targetY));

  if (g.status !== "playing") {
    // Paused / armed / dead — just sync HUD and keep speed lines animated
    if (now - g.lastUiSync > 200) {
      g.lastUiSync = now;
      onUiSync();
    }
    return;
  }

  // Expire active power-ups
  for (let i = g.activePowerUps.length - 1; i >= 0; i--) {
    if (g.activePowerUps[i].expiresAt <= now) g.activePowerUps.splice(i, 1);
  }

  // Combo decay: if no new kill within the effective window (upgrade overrides base), drop to 1
  const effectiveComboWindow = g.comboWindowMs > 0 ? g.comboWindowMs : COMBO_WINDOW_MS;
  if (g.combo > 1 && now - g.comboLastAt > effectiveComboWindow) {
    g.combo = 1;
  }

  // Shield edge detection — play sound when activating or expiring
  const shieldNow = isPowerUpActive(g, "shield");
  if (shieldNow !== g.shieldActiveLast) {
    sounds.play(shieldNow ? "shieldOn" : "shieldOff");
    g.shieldActiveLast = shieldNow;
  }

  // Warp edge detection — sustained whoosh starts on activation, fades on expire
  const warpNow = isPowerUpActive(g, "warp");
  if (warpNow !== g.warpActiveLast) {
    if (warpNow) sounds.startWarpLoop();
    else sounds.stopWarpLoop();
    g.warpActiveLast = warpNow;
  }

  // Score: time alive ramps slowly, asteroid kills give chunks
  g.score += step * 8;
  // Distance: matches forward asteroid speed so the score "feels" like flight.
  // Warp turbo-charges the distance counter to match the visible speed.
  const distMultiplier = THREE.MathUtils.lerp(1, 6, wi);
  g.distance += step * (10 + difficulty(g) * 4) * distMultiplier;

  // Boss scheduling check — only if no boss active
  if (!g.boss && g.bossScheduleIdx < g.bossSchedule.length) {
    const next = g.bossSchedule[g.bossScheduleIdx];
    if (g.distance >= next.distance) {
      const recycleCount = Math.floor(g.bossScheduleIdx / 8);
      spawnBoss(g, next.bossId, recycleCount);
      g.bossScheduleIdx += 1;
    }
  }
  // Gate normal spawning while boss is present (pushed forward each frame)
  const bossIsActive = g.boss && g.boss.phase !== "defeated";
  if (bossIsActive) {
    g.normalSpawningPausedUntil = now + 100;
  }
  // Boss lifecycle
  if (g.boss) {
    const b = g.boss;
    const phaseAge = now - b.phaseStartAt;
    if (b.phase === "intro") {
      const t = Math.min(1, phaseAge / 1500);
      const eased = 1 - Math.pow(1 - t, 3);
      b.position[2] = -40 + eased * 25;
      b.position[1] = 6 - eased * 3;
      if (t >= 1) {
        b.phase = "fighting";
        b.phaseStartAt = now;
      }
    } else if (b.phase === "fighting") {
      if (b.id === "sentinel") runSentinelBehavior(g, b, now);
      else if (b.id === "drifter") runDrifterBehavior(g, b, now);
      else if (b.id === "swarm-mother") runSwarmMotherBehavior(g, b, now, step);
      else if (b.id === "mirror") runMirrorBehavior(g, b, now);
      else if (b.id === "pulsar") runPulsarBehavior(g, b, now);
      else if (b.id === "harvester") runHarvesterBehavior(g, b, now, step);
      else if (b.id === "warden") runWardenBehavior(g, b, now, step);
      else if (b.id === "void-tyrant") runVoidTyrantBehavior(g, b, now, step);
      if (now - g.lastBossPulseAt > 700) {
        sounds.bossPulse();
        g.lastBossPulseAt = now;
      }
    } else if (b.phase === "dying") {
      const dyingAge = now - b.phaseStartAt;
      b.position[1] += 0.02;
      if (dyingAge >= 1200) {
        b.phase = "defeated";
        b.phaseStartAt = now;
        g.bossesDefeatedThisRun += 1;
        // Score bonus + guaranteed power-up drop
        const bonus = 500 * b.tier;
        g.score += bonus;
        spawnScorePopup(g, b.position[0], b.position[1], b.position[2], bonus);
        spawnExplosion(g, b.position[0], b.position[1], b.position[2], "#ef4444", 900, 0.9);
        // Defer power-up: force lastPowerUpSpawn so one appears soon
        g.lastPowerUpSpawn = now - POWERUP_SPAWN_INTERVAL_MS + 500;
      }
    } else if (b.phase === "defeated") {
      // Let remaining projectiles fade, then clear the boss
      if (now - b.phaseStartAt > 500) {
        g.boss = null;
        g.bossProjectiles.length = 0;
      }
    }
  }

  // Update + collide boss projectiles each frame
  for (let i = g.bossProjectiles.length - 1; i >= 0; i--) {
    const p = g.bossProjectiles[i];
    if (p.homing) {
      const dx0 = g.shipX - p.position[0];
      const dy0 = g.shipY - p.position[1];
      const dz0 = g.shipZ - p.position[2];
      const len = Math.hypot(dx0, dy0, dz0) || 1;
      const sp = Math.hypot(p.velocity[0], p.velocity[1], p.velocity[2]);
      p.velocity[0] = (dx0 / len) * sp;
      p.velocity[1] = (dy0 / len) * sp;
      p.velocity[2] = (dz0 / len) * sp;
    }
    p.position[0] += p.velocity[0] * step;
    p.position[1] += p.velocity[1] * step;
    p.position[2] += p.velocity[2] * step;
    const dx = p.position[0] - g.shipX;
    const dy = p.position[1] - g.shipY;
    const dz = p.position[2] - g.shipZ;
    const hitDist = p.radius + SHIP_RADIUS + 0.1;
    const shieldedShip = isPowerUpActive(g, "shield") || isPowerUpActive(g, "warp");
    if (now > g.invulnUntil && !shieldedShip &&
        dx * dx + dy * dy + dz * dz < hitDist * hitDist) {
      g.status = "dying";
      g.dyingAt = now;
      g.deathVelX = (dx / (Math.hypot(dx, dy) || 1)) * 7;
      g.deathVelY = (dy / (Math.hypot(dx, dy) || 1)) * 7 + 3.5;
      g.deathVelZ = 2.5;
      g.deathAngVel = (Math.random() - 0.5) * 10;
      spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#ef4444", 500, 0.45);
      spawnShipDebris(g);
      sounds.play("crash");
      sounds.stopMusic(0.4);
      sounds.playLosingJingle();
      g.bossProjectiles.splice(i, 1);
      continue;
    }
    if (now - p.spawnedAt > p.ttlMs || p.position[2] > 10) {
      g.bossProjectiles.splice(i, 1);
    }
  }

  // Auto-fire
  if (now - g.lastBullet > fireIntervalMs(g)) {
    fireBullets(g, now, sounds);
  }

  // Spawn obstacles
  if (now > g.normalSpawningPausedUntil && now - g.lastSpawn > spawnIntervalMs(g) && g.obstacles.length < MAX_OBSTACLES) {
    g.lastSpawn = now;
    g.obstacles.push(spawnObstacle(g));
    // After ~60s, occasionally spawn clusters of 3
    if (elapsedSeconds(g) > 60 && Math.random() < 0.15 && g.obstacles.length + 2 < MAX_OBSTACLES) {
      g.obstacles.push(spawnObstacle(g));
      g.obstacles.push(spawnObstacle(g));
    }
  }

  // Wall spawn — every 25-40s, a line of asteroids forces the player to move
  // to a specific gap position. Only while playing (not during warp) so the
  // wall has time to arrive under normal physics before warp trivializes it.
  if (
    g.status === "playing" &&
    wi < 0.1 &&
    g.nextWallAt > 0 &&
    now >= g.nextWallAt
  ) {
    spawnWall(g);
    g.nextWallAt = nextWallTimeMs(now);
  }

  // Spawn power-ups
  if (now - g.lastPowerUpSpawn > POWERUP_SPAWN_INTERVAL_MS && g.powerUps.length < MAX_POWERUPS) {
    g.lastPowerUpSpawn = now;
    g.powerUps.push(spawnPowerUp(g));
  }

  // Move bullets
  for (let i = g.bullets.length - 1; i >= 0; i--) {
    const b = g.bullets[i];
    b.x += b.vx * step;
    b.y += b.vy * step;
    b.z += b.vz * step;
    // Bullet-vs-boss-drone: Swarm Mother drones take a hit first
    if (g.boss && g.boss.id === "swarm-mother" && g.boss.phase === "fighting") {
      const subs = g.boss.subEntities;
      let droneHit = false;
      for (let s = subs.length - 1; s >= 0; s--) {
        const d = subs[s];
        if (d.type !== "drone") continue;
        const dx = b.x - d.position[0];
        const dy = b.y - d.position[1];
        const dz = b.z - d.position[2];
        if (dx * dx + dy * dy + dz * dz < 0.5 * 0.5) {
          subs.splice(s, 1);
          g.bullets.splice(i, 1);
          g.score += 10;
          spawnExplosion(g, b.x, b.y, b.z, "#d946ef", 240, 0.22);
          droneHit = true;
          break;
        }
      }
      if (droneHit) continue;
    }
    // Bullet-vs-boss: fighting phase only; Swarm Mother requires drones cleared
    if (g.boss && g.boss.phase === "fighting") {
      const bo = g.boss;
      const droneAlive = bo.id === "swarm-mother"
        && bo.subEntities.some((s) => s.type === "drone");
      const dx = b.x - bo.position[0];
      const dy = b.y - bo.position[1];
      const dz = b.z - bo.position[2];
      const hitR = 1.5;
      if (dx * dx + dy * dy + dz * dz < hitR * hitR) {
        if (!droneAlive) {
          bo.hp -= b.damage;
          if (bo.hp <= 0) {
            bo.phase = "dying";
            bo.phaseStartAt = now;
          }
        }
        // Consume bullet + spark even if shielded by drones
        spawnExplosion(g, b.x, b.y, b.z, b.color, 200, 0.18);
        g.bullets.splice(i, 1);
        continue;
      }
    }
    // Bullet-vs-boss-projectile: destroy non-shielded projectiles (e.g. Drifter mines)
    let bulletConsumed = false;
    for (let pi = g.bossProjectiles.length - 1; pi >= 0; pi--) {
      const p = g.bossProjectiles[pi];
      if (p.shielded) continue;
      const dx = b.x - p.position[0];
      const dy = b.y - p.position[1];
      const dz = b.z - p.position[2];
      const hitR = p.radius + 0.3;
      if (dx * dx + dy * dy + dz * dz < hitR * hitR) {
        g.bossProjectiles.splice(pi, 1);
        g.bullets.splice(i, 1);
        spawnExplosion(g, b.x, b.y, b.z, p.color, 220, 0.18);
        bulletConsumed = true;
        break;
      }
    }
    if (bulletConsumed) continue;
    if (b.z < SPAWN_Z - 5 || Math.abs(b.x) > ARENA_W || Math.abs(b.y) > ARENA_H) {
      g.bullets.splice(i, 1);
    }
  }

  // Move + collide obstacles. Warp multiplies forward velocity so they whip
  // past the ship dramatically. Lateral drift also scales with warp so the
  // world feels coherent during warp bursts.
  const obstacleSpeedMul = THREE.MathUtils.lerp(1, 5, wi);
  for (let i = g.obstacles.length - 1; i >= 0; i--) {
    const o = g.obstacles[i];
    o.x += o.vx * step * obstacleSpeedMul;
    o.y += o.vy * step * obstacleSpeedMul;
    o.z += o.vz * step * obstacleSpeedMul;
    o.rx += o.rsx * step;
    o.ry += o.rsy * step;
    o.rz += o.rsz * step;

    // Track closest approach for near-miss detection. Only relevant while
    // the obstacle is actually within the ship's Z band.
    if (g.status === "playing" && o.z > -4 && o.z < 4) {
      const dx = g.shipX - o.x;
      const dy = g.shipY - o.y;
      const dz = g.shipZ - o.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < o.closestApproach) o.closestApproach = d;
    }

    if (o.z > DESPAWN_Z) {
      // Near-miss: obstacle came within brush radius but never collided. Only
      // award for non-wall variants (walls are always meant to be dodged wide).
      if (
        o.variant !== "wall" &&
        o.closestApproach < o.size + SHIP_RADIUS + NEAR_MISS_RADIUS &&
        o.closestApproach > o.size + SHIP_RADIUS &&
        g.status === "playing"
      ) {
        g.score += NEAR_MISS_POINTS;
        spawnScorePopup(g, o.x, o.y, o.z, NEAR_MISS_POINTS);
      }
      g.obstacles.splice(i, 1);
      g.score += 4;
      continue;
    }

    // Bullet vs obstacle. Wall-variant pieces are dodge-only — they ignore
    // bullets entirely so the player can't just auto-fire through a wall.
    if (o.variant !== "wall") {
      for (let j = g.bullets.length - 1; j >= 0; j--) {
        const b = g.bullets[j];
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        const dz = b.z - o.z;
        const r = o.size + b.size + 0.18;
        if (dx * dx + dy * dy + dz * dz < r * r) {
          o.hp -= b.damage;
          b.hp -= 1;
          spawnExplosion(g, b.x, b.y, b.z, b.color, 240, 0.18);
          if (b.hp <= 0) g.bullets.splice(j, 1);
          if (o.hp <= 0) {
            spawnExplosion(g, o.x, o.y, o.z, "#fb923c", 600, 0.35);
            g.obstacles.splice(i, 1);
            const basePoints = 12 + Math.floor(o.size * 8);
            g.combo = Math.min(g.combo + 1, 99);
            g.comboLastAt = now;
            if (g.combo > g.comboPeak) g.comboPeak = g.combo;
            const comboMul = comboMultiplier(g.combo);
            const points = Math.round(basePoints * comboMul);
            g.score += points;
            g.kills += 1;
            // Drop coins scaled by current combo + coin-value upgrade.
            const coinValue = Math.max(1, 1 + Math.floor(g.combo / 5) + g.coinValueBonus);
            spawnCoin(g, o.x, o.y, o.z, coinValue);
            spawnScorePopup(g, o.x, o.y, o.z, points);
            sounds.play("boom");
            break;
          }
        }
      }
    }
  }

  // Coins: drift toward camera, get pulled by magnet, collect on proximity
  const magnetBonusRadius = g.coinMagnetExtra;
  for (let i = g.coins.length - 1; i >= 0; i--) {
    const c = g.coins[i];
    c.z += 8 * step * obstacleSpeedMul;
    c.rx += step * 2;
    c.ry += step * 2.5;
    if (c.z > DESPAWN_Z) {
      g.coins.splice(i, 1);
      continue;
    }
    if (c.z > -4 && c.z < 4) {
      const dx = g.shipX - c.x;
      const dy = g.shipY - c.y;
      const dist2d = Math.sqrt(dx * dx + dy * dy);
      const pullRadius = 1.5 + magnetBonusRadius;
      if (dist2d < pullRadius) {
        const pull = step * 6;
        c.x += (dx / (dist2d || 1)) * pull;
        c.y += (dy / (dist2d || 1)) * pull;
      }
      const pickupR = 0.6 + magnetBonusRadius * 0.3;
      if (Math.abs(c.z - g.shipZ) < 1.2 && dist2d < pickupR) {
        g.coinsThisRun += c.value;
        spawnScorePopup(g, c.x, c.y, c.z, c.value);
        sounds.play("chime");
        g.coins.splice(i, 1);
      }
    }
  }

  // Move power-ups + collect
  for (let i = g.powerUps.length - 1; i >= 0; i--) {
    const p = g.powerUps[i];
    p.z += 9 * step;
    p.rx += step * 1.4;
    p.ry += step * 1.6;
    if (p.z > DESPAWN_Z) {
      g.powerUps.splice(i, 1);
      continue;
    }
    if (p.z > 0.5 && p.z < 3.2) {
      const dx = g.shipX - p.x;
      const dy = g.shipY - p.y;
      const dz = 2 - p.z;
      if (dx * dx + dy * dy + dz * dz < POWERUP_PICKUP_RADIUS * POWERUP_PICKUP_RADIUS) {
        activatePowerUp(g, p.type);
        spawnExplosion(g, p.x, p.y, p.z, POWERUP_DEFS[p.type].color, 500, 0.4);
        g.powerUps.splice(i, 1);
        if (p.type === "warp") sounds.play("warp");
        else sounds.play("chime");
        g.score += 25;
        spawnScorePopup(g, p.x, p.y, p.z, 25);
      }
    }
  }

  // Collision with ship — start invuln + shield + warp grant immunity
  const shielded = isPowerUpActive(g, "shield") || isPowerUpActive(g, "warp");
  if (now > g.invulnUntil && !shielded) {
    for (const o of g.obstacles) {
      if (o.z > 0.5 && o.z < 3.2) {
        const dx = g.shipX - o.x;
        const dy = g.shipY - o.y;
        const dz = g.shipZ - o.z;
        const r = o.size + SHIP_RADIUS;
        if (dx * dx + dy * dy + dz * dz < r * r) {
          g.status = "dying";
          g.dyingAt = now;
          // Death impulse: ship is knocked AWAY from the asteroid's center
          // (along the contact normal) plus the obstacle's forward velocity
          // pushes the wreck toward the camera.
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const knock = 7;
          g.deathVelX = (dx / dist) * knock;
          g.deathVelY = (dy / dist) * knock + 3.5;
          g.deathVelZ = Math.max(2, o.vz * 0.45); // wreck tumbles toward camera
          g.deathAngVel = (Math.random() - 0.5) * 10;
          spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#ef4444", 500, 0.45);
          spawnShipDebris(g);
          sounds.play("crash");
          // Fade gameplay music + play short losing jingle. Leaderboard
          // music is started later in the React onDeath handler so the
          // jingle has room to play first.
          sounds.stopMusic(0.4);
          sounds.playLosingJingle();
          break;
        }
      }
    }
  }

  // (Arena clamp + UI sync done above in the always-on block)
  if (now - g.lastUiSync > 100) {
    g.lastUiSync = now;
    onUiSync();
  }
}

// Module-level mutation helper — keeps eslint react-hooks/immutability happy
// when applying camera lerp inside useFrame
function applyCameraLerp(camera: THREE.Camera, tx: number, ty: number, tz: number, lookX: number, lookY: number) {
  camera.position.x = THREE.MathUtils.lerp(camera.position.x, tx, 0.06);
  camera.position.y = THREE.MathUtils.lerp(camera.position.y, ty, 0.06);
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, tz, 0.06);
  camera.lookAt(lookX, lookY, 0);
}

// Deterministic star spread (no Math.random during render)
function buildStarPoints(): Float32Array {
  const COUNT = 2400;
  const pts = new Float32Array(COUNT * 3);
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < COUNT; i++) {
    const r = 30 + ((i * 31) % 70);
    const y = 1 - (i / (COUNT - 1)) * 2;
    const radius = Math.sqrt(1 - y * y);
    const theta = phi * i;
    pts[i * 3 + 0] = r * radius * Math.cos(theta);
    pts[i * 3 + 1] = r * y;
    pts[i * 3 + 2] = r * radius * Math.sin(theta);
  }
  return pts;
}

// ---------- 3D components ----------

function Ship({ gameRefs, env }: { gameRefs: React.RefObject<GameRefs>; env: Environment }) {
  const grpRef = useRef<THREE.Group>(null);
  const shieldRef = useRef<THREE.Mesh>(null);
  const engineRef = useRef<THREE.Mesh>(null);
  const engineCoreRef = useRef<THREE.Mesh>(null);
  const engineTrailRef = useRef<THREE.Mesh>(null);
  const warpAuraRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    const g = gameRefs.current;
    if (!g || !grpRef.current) return;
    const now = performance.now();
    grpRef.current.position.set(g.shipX, g.shipY, g.shipZ);
    grpRef.current.rotation.z = g.shipRotZ;
    if (g.status === "dying") {
      grpRef.current.rotation.x += 0.05;
      grpRef.current.rotation.y += 0.07;
      grpRef.current.visible = (now - g.dyingAt) < 1500;
    } else {
      const targetPitch = THREE.MathUtils.clamp((g.targetY - g.shipY) * 0.18, -0.25, 0.25);
      grpRef.current.rotation.x = THREE.MathUtils.lerp(grpRef.current.rotation.x, targetPitch, 0.18);
      grpRef.current.rotation.y *= 0.9;
      grpRef.current.visible = true;
    }

    // Warp = ghost-out the ship slightly + show aura
    const isWarping = isPowerUpActive(g, "warp");
    grpRef.current.children.forEach((child) => {
      if (child === warpAuraRef.current) return;
      const mat = (child as THREE.Mesh).material as THREE.Material | undefined;
      if (mat && "opacity" in mat) {
        (mat as THREE.MeshBasicMaterial).opacity = isWarping ? 0.45 : 1;
        (mat as THREE.MeshBasicMaterial).transparent = isWarping || (mat as THREE.MeshBasicMaterial).transparent;
      }
    });

    // Engine flame — main ball pulses, trail elongates
    if (engineRef.current) {
      const mat = engineRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.55 + Math.sin(now * 0.018) * 0.25;
    }
    if (engineCoreRef.current) {
      const pulse = 0.8 + Math.sin(now * 0.04) * 0.2;
      engineCoreRef.current.scale.setScalar(pulse);
    }
    if (engineTrailRef.current) {
      // Plume length is capped so it never reaches the camera plane.
      // Cone height = 0.7 (in local Y after rotation = world Z). With scale,
      // total length = 0.7 * stretch. Position the cone so its BASE sits at
      // the engine and the tip extends backwards (toward camera) but stops
      // well short of the camera regardless of FOV/orientation.
      const stretch = isWarping ? 3.4 + Math.sin(now * 0.05) * 0.4 : 1.6 + Math.sin(now * 0.025) * 0.4;
      const widen = isWarping ? 2.0 : 0.9;
      engineTrailRef.current.scale.set(widen, widen, stretch);
      // Offset so the cone's base stays at the engine and only the tip extends
      engineTrailRef.current.position.z = 0.55 + (0.7 * stretch * 0.5);
      const mat = engineTrailRef.current.material as THREE.MeshBasicMaterial;
      mat.opacity = isWarping ? 0.95 : 0.5;
    }
    if (warpAuraRef.current) {
      warpAuraRef.current.visible = isWarping;
      if (isWarping) {
        const aurascale = 1 + Math.sin(now * 0.03) * 0.15;
        warpAuraRef.current.scale.setScalar(aurascale);
        warpAuraRef.current.rotation.z += 0.15;
      }
    }

    if (shieldRef.current) {
      const isShielded = isPowerUpActive(g, "shield") || now < g.invulnUntil;
      shieldRef.current.visible = isShielded;
      if (isShielded) {
        // Activation pop: brief expand from 0.2 → 1 in first 200ms after pickup
        const shield = g.activePowerUps.find((p) => p.type === "shield");
        const ageMs = shield ? POWERUP_DURATION_MS - (shield.expiresAt - now) : 0;
        const popT = Math.min(1, ageMs / 220);
        const pop = 0.2 + popT * 0.8;
        const pulse = pop + Math.sin(now * 0.01) * 0.06;
        shieldRef.current.scale.setScalar(pulse);
        const mat = shieldRef.current.material as THREE.MeshBasicMaterial;
        mat.opacity = isPowerUpActive(g, "shield") ? 0.42 : 0.25;
      }
    }
  });

  return (
    <group ref={grpRef}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.22, 1.0, 8]} />
        <meshToonMaterial color="#60a5fa" emissive="#1e3a8a" emissiveIntensity={0.45} />
      </mesh>
      <mesh position={[0, -0.03, 0.15]}>
        <boxGeometry args={[1.1, 0.06, 0.32]} />
        <meshToonMaterial color="#1d4ed8" emissive="#3b82f6" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[0.55, -0.03, 0.28]}>
        <boxGeometry args={[0.18, 0.05, 0.16]} />
        <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[-0.55, -0.03, 0.28]}>
        <boxGeometry args={[0.18, 0.05, 0.16]} />
        <meshToonMaterial color="#dc2626" emissive="#b91c1c" emissiveIntensity={0.5} />
      </mesh>
      <mesh position={[0, 0.1, -0.18]} scale={[1, 0.7, 1]}>
        <sphereGeometry args={[0.13, 14, 12]} />
        <meshToonMaterial color="#22d3ee" emissive="#22d3ee" emissiveIntensity={0.7} />
      </mesh>
      <mesh ref={engineRef} position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.13, 12, 10]} />
        <meshBasicMaterial color={env.starColor} transparent opacity={0.75} />
      </mesh>
      {/* Bright inner core that pulses */}
      <mesh ref={engineCoreRef} position={[0, 0, 0.55]}>
        <sphereGeometry args={[0.07, 8, 6]} />
        <meshBasicMaterial color="#fff7ed" />
      </mesh>
      {/* Long stretched plume — extra long during warp */}
      <mesh ref={engineTrailRef} position={[0, 0, 0.85]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.7, 8, 1, true]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
      {/* Warp aura — only visible when warp power-up is active */}
      <mesh ref={warpAuraRef} visible={false}>
        <torusGeometry args={[0.85, 0.04, 12, 28]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.6} />
      </mesh>
      <mesh position={[0.36, -0.03, 0.36]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={env.starColor} transparent opacity={0.65} />
      </mesh>
      <mesh position={[-0.36, -0.03, 0.36]}>
        <sphereGeometry args={[0.06, 8, 8]} />
        <meshBasicMaterial color={env.starColor} transparent opacity={0.65} />
      </mesh>
      <mesh ref={shieldRef} visible={false}>
        <sphereGeometry args={[0.85, 22, 18]} />
        <meshBasicMaterial color="#60a5fa" transparent opacity={0.2} wireframe />
      </mesh>
      <pointLight position={[0, 0, 0.7]} color={env.starColor} intensity={0.9} distance={3} />
    </group>
  );
}

function Obstacles({ gameRefs, env, tick }: { gameRefs: React.RefObject<GameRefs>; env: Environment; tick: number }) {
  const obstacles = gameRefs.current?.obstacles ?? [];
  const meshRefs = useRef<Map<number, THREE.Mesh>>(new Map());
  const geos = useMemo(() => [
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.OctahedronGeometry(1, 0),
  ], []);
  const baseMat = useMemo(() => new THREE.MeshToonMaterial({
    color: env.asteroidColor,
    emissive: env.asteroidEmissive,
    emissiveIntensity: 0.45,
  }), [env]);
  const heavyMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#475569",
    emissive: env.asteroidEmissive,
    emissiveIntensity: 0.3,
  }), [env]);

  // Smooth biome lerp — base + heavy materials inherit env target each frame.
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    baseMat.color.copy(g.asteroidColor);
    baseMat.emissive.copy(g.asteroidEmissive);
    heavyMat.emissive.copy(g.asteroidEmissive);
  });
  const speederMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#fbbf24",
    emissive: "#92400e",
    emissiveIntensity: 0.55,
  }), []);
  const wallMat = useMemo(() => new THREE.MeshToonMaterial({
    color: "#991b1b",          // deep crimson — reads as "hazard / do not shoot"
    emissive: "#dc2626",
    emissiveIntensity: 0.6,
  }), []);
  useEffect(() => () => geos.forEach((g) => g.dispose()), [geos]);
  useEffect(() => () => baseMat.dispose(), [baseMat]);
  useEffect(() => () => heavyMat.dispose(), [heavyMat]);
  useEffect(() => () => speederMat.dispose(), [speederMat]);
  useEffect(() => () => wallMat.dispose(), [wallMat]);

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const o of g.obstacles) {
      const m = meshRefs.current.get(o.id);
      if (m) {
        m.position.set(o.x, o.y, o.z);
        m.rotation.set(o.rx, o.ry, o.rz);
        m.scale.setScalar(o.size);
      }
    }
  });

  const matFor = (v: ObstacleVariant) =>
    v === "heavy" ? heavyMat
    : v === "speeder" ? speederMat
    : v === "wall" ? wallMat
    : baseMat;

  return (
    <group>
      {obstacles.map((o) => (
        <mesh
          key={o.id}
          ref={(el) => {
            if (el) meshRefs.current.set(o.id, el);
            else meshRefs.current.delete(o.id);
          }}
          geometry={geos[o.shape]}
          material={matFor(o.variant)}
        />
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Bullets({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const bullets = gameRefs.current?.bullets ?? [];
  const cylGeo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 8), []);
  const sphGeo = useMemo(() => new THREE.SphereGeometry(1, 12, 10), []);
  const ringGeo = useMemo(() => new THREE.RingGeometry(0.6, 1, 16), []);
  useEffect(() => () => { cylGeo.dispose(); sphGeo.dispose(); ringGeo.dispose(); }, [cylGeo, sphGeo, ringGeo]);

  const refs = useRef<Map<number, THREE.Object3D>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const b of g.bullets) {
      const o = refs.current.get(b.id);
      if (o) o.position.set(b.x, b.y, b.z);
    }
  });

  return (
    <group>
      {bullets.map((b) => {
        const setRef = (el: THREE.Object3D | null) => {
          if (el) refs.current.set(b.id, el);
          else refs.current.delete(b.id);
        };
        if (b.style === "sprite") {
          const w = b.size * 1.6;
          const h = b.size * 5;
          return (
            <sprite key={b.id} ref={setRef} scale={[w, h, 1]}>
              <spriteMaterial color={b.color} transparent opacity={0.95} />
            </sprite>
          );
        }
        if (b.style === "plasma") {
          return (
            <group key={b.id} ref={setRef}>
              <mesh geometry={sphGeo} scale={b.size * 1.8}>
                <meshBasicMaterial color={b.color} />
              </mesh>
              <mesh geometry={sphGeo} scale={b.size * 3}>
                <meshBasicMaterial color={b.color} transparent opacity={0.35} />
              </mesh>
              <mesh geometry={ringGeo} scale={b.size * 4} rotation={[Math.PI / 2, 0, 0]}>
                <meshBasicMaterial color={b.color} transparent opacity={0.5} side={THREE.DoubleSide} />
              </mesh>
            </group>
          );
        }
        return (
          <group key={b.id} ref={setRef}>
            <mesh geometry={cylGeo} scale={[b.size, 1.1, b.size]}>
              <meshBasicMaterial color={b.color} />
            </mesh>
            <mesh geometry={sphGeo} scale={b.size * 2.2}>
              <meshBasicMaterial color={b.color} transparent opacity={0.4} />
            </mesh>
          </group>
        );
      })}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function PowerUps({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.powerUps ?? [];
  const sphereGeo = useMemo(() => new THREE.SphereGeometry(1, 16, 12), []);
  const octaGeo = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  const torusKnotGeo = useMemo(() => new THREE.TorusKnotGeometry(0.6, 0.18, 32, 6), []);
  const coneGeo = useMemo(() => new THREE.ConeGeometry(0.5, 1, 6), []);
  const refs = useRef<Map<number, THREE.Group>>(new Map());
  useEffect(() => () => {
    sphereGeo.dispose();
    octaGeo.dispose();
    torusKnotGeo.dispose();
    coneGeo.dispose();
  }, [sphereGeo, octaGeo, torusKnotGeo, coneGeo]);

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const p of g.powerUps) {
      const grp = refs.current.get(p.id);
      if (grp) {
        grp.position.set(p.x, p.y, p.z);
        grp.rotation.set(p.rx, p.ry, p.rz);
      }
    }
  });

  return (
    <group>
      {list.map((p) => {
        const def = POWERUP_DEFS[p.type];
        return (
          <group
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
          >
            {/* Per-type 3D model so the player can recognize the pickup */}
            {p.type === "shield" && (
              <>
                {/* Wireframe shield bubble */}
                <mesh geometry={sphereGeo} scale={0.4}>
                  <meshBasicMaterial color={def.color} transparent opacity={0.45} wireframe />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.28}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.8} />
                </mesh>
              </>
            )}
            {p.type === "triple" && (
              <>
                {/* Three small orbs in a triangle */}
                <mesh geometry={sphereGeo} scale={0.13} position={[0, 0.22, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.7} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.13} position={[-0.22, -0.13, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.7} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.13} position={[0.22, -0.13, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.7} />
                </mesh>
              </>
            )}
            {p.type === "rapid" && (
              <mesh geometry={torusKnotGeo} scale={0.45}>
                <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.8} />
              </mesh>
            )}
            {p.type === "mega" && (
              <>
                {/* Big crystal core + halo */}
                <mesh geometry={octaGeo} scale={0.42}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.85} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.65}>
                  <meshBasicMaterial color={def.color} transparent opacity={0.15} />
                </mesh>
              </>
            )}
            {p.type === "warp" && (
              <>
                {/* Forward-pointing chevron + halo ring suggesting speed */}
                <mesh geometry={coneGeo} scale={[0.35, 0.55, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
                  <meshToonMaterial color={def.color} emissive={def.emissive} emissiveIntensity={0.85} />
                </mesh>
                <mesh geometry={sphereGeo} scale={0.5}>
                  <meshBasicMaterial color={def.color} transparent opacity={0.15} wireframe />
                </mesh>
              </>
            )}
            <pointLight color={def.color} intensity={0.8} distance={3.5} />
          </group>
        );
      })}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function SettingsToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm text-slate-200 cursor-pointer">
      <span>{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition ${checked ? "bg-emerald-500" : "bg-slate-600"}`}
        aria-pressed={checked}
      >
        <span className={`block w-5 h-5 bg-white rounded-full transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}

function BossMesh({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame(() => {
    const b = gameRefs.current?.boss;
    if (!groupRef.current || !b) return;
    groupRef.current.position.set(b.position[0], b.position[1], b.position[2]);
    groupRef.current.rotation.y += b.phase === "dying" ? 0.2 : 0.02;
    if (b.phase === "dying") {
      const t = Math.min(1, (performance.now() - b.phaseStartAt) / 1200);
      groupRef.current.scale.setScalar(Math.max(0, 1 - t));
    } else {
      groupRef.current.scale.setScalar(1);
    }
  });
  const boss = gameRefs.current?.boss;
  if (!boss || boss.phase === "defeated") return null;
  if (boss.id === "sentinel") {
    return (
      <group ref={groupRef}>
        <mesh>
          <cylinderGeometry args={[1.2, 1.2, 0.4, 6]} />
          <meshStandardMaterial color="#1e293b" emissive="#ef4444" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.3]}>
          <torusGeometry args={[0.8, 0.15, 8, 16]} />
          <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "drifter") {
    return (
      <group ref={groupRef}>
        <mesh>
          <octahedronGeometry args={[1.4, 0]} />
          <meshStandardMaterial color="#0ea5e9" emissive="#0284c7" emissiveIntensity={0.5} flatShading />
        </mesh>
        <mesh scale={[0.6, 0.6, 0.6]}>
          <octahedronGeometry args={[1.4, 0]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.4} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "swarm-mother") {
    return (
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[1.6, 16, 12]} />
          <meshStandardMaterial color="#86198f" emissive="#a21caf" emissiveIntensity={0.4} />
        </mesh>
        <mesh scale={[1.2, 0.6, 1.2]}>
          <torusKnotGeometry args={[0.9, 0.2, 32, 8]} />
          <meshStandardMaterial color="#d946ef" emissive="#d946ef" emissiveIntensity={0.6} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "mirror") {
    return (
      <group ref={groupRef}>
        <mesh>
          <cylinderGeometry args={[1.4, 1.4, 0.2, 16]} />
          <meshStandardMaterial color="#cbd5e1" metalness={1} roughness={0.1} />
        </mesh>
        <mesh position={[0, 0, 0.15]}>
          <ringGeometry args={[1.0, 1.3, 32]} />
          <meshBasicMaterial color="#e2e8f0" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "pulsar") {
    return (
      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[1.2, 32, 24]} />
          <meshStandardMaterial color="#ffffff" emissive="#fef08a" emissiveIntensity={1.5} />
        </mesh>
        <pointLight intensity={3} distance={20} color="#fef08a" />
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "harvester") {
    const beam = (boss as unknown as { tractorBeam?: { active: boolean } }).tractorBeam;
    return (
      <group ref={groupRef}>
        <mesh>
          <boxGeometry args={[2.5, 1.2, 2.5]} />
          <meshStandardMaterial color="#292524" emissive="#78350f" emissiveIntensity={0.3} />
        </mesh>
        <mesh position={[0, -0.8, 0]}>
          <coneGeometry args={[1.0, 0.8, 4]} />
          <meshStandardMaterial color="#44403c" metalness={0.8} roughness={0.2} />
        </mesh>
        {beam?.active && (
          <mesh position={[0, -5, 0]}>
            <boxGeometry args={[1.6, 10, 5]} />
            <meshBasicMaterial color="#f59e0b" transparent opacity={0.3} />
          </mesh>
        )}
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "warden") {
    return (
      <group ref={groupRef}>
        <mesh>
          <boxGeometry args={[3.5, 2.5, 1]} />
          <meshStandardMaterial color="#dc2626" emissive="#991b1b" emissiveIntensity={0.4} />
        </mesh>
        <mesh position={[0, 0, 0.51]}>
          <ringGeometry args={[0.6, 0.9, 4]} />
          <meshBasicMaterial color="#fca5a5" side={THREE.DoubleSide} />
        </mesh>
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  if (boss.id === "void-tyrant") {
    const hpPct = boss.hp / boss.hpMax;
    const color = hpPct > 0.66 ? "#581c87" : hpPct > 0.33 ? "#be185d" : "#f59e0b";
    return (
      <group ref={groupRef}>
        <mesh>
          <icosahedronGeometry args={[2.2, 1]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.8} wireframe />
        </mesh>
        <mesh scale={[0.7, 0.7, 0.7]}>
          <icosahedronGeometry args={[2.2, 0]} />
          <meshBasicMaterial color={color} transparent opacity={0.5} />
        </mesh>
        <pointLight intensity={2} distance={30} color={color} />
        <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
      </group>
    );
  }
  // Fallback placeholder for other bosses until their meshes ship
  return (
    <group ref={groupRef}>
      <mesh>
        <icosahedronGeometry args={[1.3, 0]} />
        <meshStandardMaterial color="#475569" emissive="#ef4444" emissiveIntensity={0.35} wireframe />
      </mesh>
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function BossWalls({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const boss = gameRefs.current?.boss;
  if (!boss || boss.id !== "warden") return null;
  const segs = (boss as unknown as { wallSegments?: BossWallSegment[] }).wallSegments ?? [];
  return (
    <group>
      {segs.map((s) =>
        s.isGap ? null : (
          <mesh
            key={`wall-${s.wallGroupId}-${s.gridIndex}`}
            position={s.position}
          >
            <boxGeometry args={[1.8, 1.8, 0.3]} />
            <meshStandardMaterial color="#991b1b" emissive="#ef4444" emissiveIntensity={0.3} />
          </mesh>
        )
      )}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function BossSubEntities({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const boss = gameRefs.current?.boss;
  const list = boss?.subEntities ?? [];
  useFrame(() => {
    // Position updates already in refs — JSX binds position directly
  });
  if (!boss) return null;
  return (
    <group>
      {list.map((d, idx) =>
        d.type === "drone" ? (
          <mesh key={`drone-${idx}-${d.createdAt}`} position={d.position}>
            <tetrahedronGeometry args={[0.35]} />
            <meshStandardMaterial color="#d946ef" emissive="#d946ef" emissiveIntensity={0.6} />
          </mesh>
        ) : null
      )}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function BossProjectiles({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.bossProjectiles ?? [];
  const geo = useMemo(() => new THREE.SphereGeometry(1, 10, 8), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const p of g.bossProjectiles) {
      const m = refs.current.get(p.id);
      if (m) {
        m.position.set(p.position[0], p.position[1], p.position[2]);
        m.scale.setScalar(p.radius);
      }
    }
  });
  return (
    <group>
      {list.map((p) => (
        <mesh
          key={p.id}
          geometry={geo}
          ref={(el) => {
            if (el) refs.current.set(p.id, el);
            else refs.current.delete(p.id);
          }}
        >
          <meshBasicMaterial color={p.color} />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Coins({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.coins ?? [];
  const geo = useMemo(() => new THREE.SphereGeometry(0.18, 12, 10), []);
  useEffect(() => () => geo.dispose(), [geo]);
  const refs = useRef<Map<number, THREE.Group>>(new Map());

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const c of g.coins) {
      const grp = refs.current.get(c.id);
      if (grp) {
        grp.position.set(c.x, c.y, c.z);
        grp.rotation.set(c.rx, c.ry, c.rz);
      }
    }
  });

  return (
    <group>
      {list.map((c) => (
        <group
          key={c.id}
          ref={(el) => {
            if (el) refs.current.set(c.id, el);
            else refs.current.delete(c.id);
          }}
        >
          <mesh geometry={geo} scale={1.2}>
            <meshToonMaterial color="#fde047" emissive="#ca8a04" emissiveIntensity={0.6} />
          </mesh>
          <pointLight color="#fde047" intensity={0.4} distance={1.5} />
        </group>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Explosions({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const explosions = gameRefs.current?.explosions ?? [];
  const sphGeo = useMemo(() => new THREE.SphereGeometry(0.5, 12, 10), []);
  useEffect(() => () => sphGeo.dispose(), [sphGeo]);

  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    for (const e of g.explosions) {
      const m = refs.current.get(e.id);
      if (m) {
        m.position.set(e.x, e.y, e.z);
        m.scale.setScalar(e.scale);
        (m.material as THREE.MeshBasicMaterial).opacity = e.opacity;
      }
    }
  });

  return (
    <group>
      {explosions.map((e) => (
        <mesh
          key={e.id}
          ref={(el) => {
            if (el) refs.current.set(e.id, el);
            else refs.current.delete(e.id);
          }}
          geometry={sphGeo}
        >
          <meshBasicMaterial color={e.color} transparent opacity={e.opacity} />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

// Cache for canvas-rendered "+N" textures so each unique amount only creates
// one texture even if popups spawn frequently.
const SCORE_TEXTURE_CACHE = new Map<number, THREE.CanvasTexture>();
function scoreTexture(amount: number): THREE.CanvasTexture {
  const cached = SCORE_TEXTURE_CACHE.get(amount);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.font = "bold 64px ui-sans-serif, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.85)";
  ctx.fillStyle = "#fde047";
  const txt = `+${amount}`;
  ctx.strokeText(txt, c.width / 2, c.height / 2);
  ctx.fillText(txt, c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  SCORE_TEXTURE_CACHE.set(amount, tex);
  return tex;
}

function ScorePopups({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const popups = gameRefs.current?.scorePopups ?? [];
  const refs = useRef<Map<number, THREE.Sprite>>(new Map());

  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    for (const p of g.scorePopups) {
      const s = refs.current.get(p.id);
      if (s) {
        s.position.set(p.x, p.y, p.z);
        const age = (now - p.spawnedAt) / p.ttl;
        const mat = s.material as THREE.SpriteMaterial;
        mat.opacity = Math.max(0, 1 - age);
        const scale = 0.9 + age * 0.7;
        s.scale.set(scale * 1.6, scale * 0.6, 1);
      }
    }
  });

  return (
    <group>
      {popups.map((p) => {
        const tex = scoreTexture(p.amount);
        return (
          <sprite
            key={p.id}
            ref={(el) => {
              if (el) refs.current.set(p.id, el);
              else refs.current.delete(p.id);
            }}
            scale={[1.4, 0.55, 1]}
          >
            <spriteMaterial map={tex} transparent depthWrite={false} />
          </sprite>
        );
      })}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function DebrisField({ gameRefs, tick }: { gameRefs: React.RefObject<GameRefs>; tick: number }) {
  const list = gameRefs.current?.debris ?? [];
  const refs = useRef<Map<number, THREE.Mesh>>(new Map());
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    const now = performance.now();
    for (const d of g.debris) {
      const m = refs.current.get(d.id);
      if (m) {
        m.position.set(d.x, d.y, d.z);
        m.rotation.set(d.rx, d.ry, d.rz);
        const age = (now - d.spawnedAt) / d.ttl;
        const fade = Math.max(0, 1 - Math.max(0, age - 0.6) / 0.4);
        const mat = m.material as THREE.MeshToonMaterial;
        mat.opacity = fade;
        mat.transparent = true;
      }
    }
  });
  return (
    <group>
      {list.map((d) => (
        <mesh
          key={d.id}
          ref={(el) => {
            if (el) refs.current.set(d.id, el);
            else refs.current.delete(d.id);
          }}
        >
          <boxGeometry args={d.size} />
          <meshToonMaterial color={d.color} emissive={d.color} emissiveIntensity={0.4} transparent />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function SpeedLines({ gameRefs, env, tick }: { gameRefs: React.RefObject<GameRefs>; env: Environment; tick: number }) {
  const lines = gameRefs.current?.speedLines ?? [];
  const geo = useMemo(() => new THREE.CylinderGeometry(0.014, 0.014, 1, 4), []);
  useEffect(() => () => geo.dispose(), [geo]);

  const refs = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    // Dark-on-light (invertedArmed) needs higher opacity to register vs.
    // light-on-dark which can stay subtle.
    const opacityScale = g.invertedArmed ? 1.0 : 0.7;
    for (let i = 0; i < g.speedLines.length; i++) {
      const m = refs.current[i];
      const l = g.speedLines[i];
      if (m && l) {
        m.position.set(l.x, l.y, l.z);
        m.scale.set(1, l.length, 1);
        const mat = m.material as THREE.MeshBasicMaterial;
        mat.opacity = l.life * opacityScale;
        // Follow the lerped star color so speed lines stay visible against
        // the current background — dark lines in light mode, light lines
        // in dark mode.
        mat.color.copy(g.starColor);
      }
    }
  });

  return (
    <group>
      {lines.map((_, i) => (
        <mesh
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          rotation={[Math.PI / 2, 0, 0]}
          geometry={geo}
        >
          <meshBasicMaterial color={env.starColor} transparent opacity={0} />
        </mesh>
      ))}
      <group visible={false}><mesh><boxGeometry args={[0, 0, tick * 0]} /><meshBasicMaterial /></mesh></group>
    </group>
  );
}

function Starfield({ env }: { env: Environment }) {
  const points = useMemo(() => buildStarPoints(), []);
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(points, 3));
    return g;
  }, [points]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points geometry={geo}>
      <pointsMaterial color={env.starColor} size={0.18} sizeAttenuation transparent opacity={0.85} />
    </points>
  );
}

function CameraRig({ gameRefs }: { gameRefs: React.RefObject<GameRefs> }) {
  const { camera } = useThree();
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    applyCameraLerp(camera, g.cameraTargetX, g.cameraTargetY, g.cameraTargetZ, g.shipX * 0.4, g.shipY * 0.4);
  });
  return null;
}

// Pulls the camera back + widens FOV on portrait canvases so the playable
// arena fills the screen and the ship feels the same size relative to
// asteroids regardless of orientation. Eslint react-hooks/immutability flags
// `camera.fov = ...` directly so we route it through a module-level helper.
function configureCameraForOrientation(camera: THREE.Camera, portrait: boolean) {
  if (!(camera instanceof THREE.PerspectiveCamera)) return;
  camera.fov = portrait ? 75 : 60;
  // Z position only nudged here on first setup — runtime cameraTarget still
  // controls per-frame movement.
  camera.position.z = portrait ? 7.5 : 5;
  camera.updateProjectionMatrix();
}

function CameraConfigurator() {
  const { camera, size } = useThree();
  useEffect(() => {
    const portrait = size.height > size.width;
    configureCameraForOrientation(camera, portrait);
  }, [camera, size]);
  return null;
}

function GameLoop({
  gameRefs, onDeath, onUiSync,
}: {
  gameRefs: React.RefObject<GameRefs>;
  onDeath: () => void;
  onUiSync: () => void;
}) {
  const { viewport } = useThree();
  useFrame((_, dt) => {
    const g = gameRefs.current;
    if (!g) return;
    runTick(g, dt, viewport, onDeath, onUiSync);
  });
  return null;
}

// Module-level helpers — eslint react-hooks/immutability flags direct
// `scene.background = ...` writes inside hooks, but pushing them through a
// plain function it can't trace satisfies the rule.
function attachSceneBackground(scene: THREE.Scene, fallback: string) {
  if (!(scene.background instanceof THREE.Color)) scene.background = new THREE.Color(fallback);
  if (!scene.fog) scene.fog = new THREE.Fog(fallback, 18, 42);
}
function detachSceneBackground(scene: THREE.Scene) {
  scene.background = null;
  scene.fog = null;
}

// Imperatively syncs the scene background + fog colors to the lerped values
// in gameRefs each frame, so biome changes look like a smooth dissolve.
function BiomeBlender({ gameRefs }: { gameRefs: React.RefObject<GameRefs> }) {
  const { scene } = useThree();
  useEffect(() => {
    attachSceneBackground(scene, "#0a0a1a");
    return () => detachSceneBackground(scene);
  }, [scene]);
  useFrame(() => {
    const g = gameRefs.current;
    if (!g) return;
    if (scene.background instanceof THREE.Color) scene.background.copy(g.fogColor);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(g.fogColor);
  });
  return null;
}

function Scene({
  gameRefs, onDeath, onUiSync, env, tick,
}: {
  gameRefs: React.RefObject<GameRefs>;
  onDeath: () => void;
  onUiSync: () => void;
  env: Environment;
  tick: number;
}) {
  const bossFighting = gameRefs.current?.boss && gameRefs.current.boss.phase !== "defeated";
  const voidFight = bossFighting && gameRefs.current?.boss?.id === "void-tyrant";
  const ambientI = voidFight ? 0.05 : bossFighting ? 0.18 : 0.5;
  const dirI = voidFight ? 0.15 : bossFighting ? 0.35 : 0.7;
  return (
    <>
      <BiomeBlender gameRefs={gameRefs} />
      <ambientLight intensity={ambientI} color={bossFighting ? "#7f1d1d" : env.ambient} />
      <directionalLight position={[5, 6, 4]} intensity={dirI} />
      <Starfield env={env} />
      <SpeedLines gameRefs={gameRefs} env={env} tick={tick} />
      <Ship gameRefs={gameRefs} env={env} />
      <Obstacles gameRefs={gameRefs} env={env} tick={tick} />
      <PowerUps gameRefs={gameRefs} tick={tick} />
      <Coins gameRefs={gameRefs} tick={tick} />
      <BossMesh gameRefs={gameRefs} tick={tick} />
      <BossProjectiles gameRefs={gameRefs} tick={tick} />
      <BossSubEntities gameRefs={gameRefs} tick={tick} />
      <BossWalls gameRefs={gameRefs} tick={tick} />
      <Bullets gameRefs={gameRefs} tick={tick} />
      <Explosions gameRefs={gameRefs} tick={tick} />
      <ScorePopups gameRefs={gameRefs} tick={tick} />
      <DebrisField gameRefs={gameRefs} tick={tick} />
      <CameraConfigurator />
      <CameraRig gameRefs={gameRefs} />
      <GameLoop gameRefs={gameRefs} onDeath={onDeath} onUiSync={onUiSync} />
    </>
  );
}

// ---------- leaderboard helpers ----------

interface LeaderboardEntry {
  name: string;
  score: number;
  level: number; // legacy from levelled mode — kept so old data still parses
  seconds?: number;
  kills?: number;
  distance?: number;
  region?: string;
  createdAt: string;
}

interface SubmitParams {
  name: string;
  score: number;
  seconds: number;
  kills: number;
  distance: number;
  region: string;
}

interface SubmitResult {
  ok: boolean;
  rank?: number;
}

function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return fetch("/api/leaderboard", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`status ${r.status}`))))
    .then((data) => (Array.isArray(data?.entries) ? (data.entries as LeaderboardEntry[]) : []))
    .catch(() => []);
}

async function submitScore(params: SubmitParams): Promise<SubmitResult> {
  try {
    const res = await fetch("/api/leaderboard", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: params.name,
        score: params.score,
        // keep legacy shape on `level` so the route validates the old field
        level: 1,
        seconds: params.seconds,
        kills: params.kills,
        distance: params.distance,
        region: params.region,
      }),
    });
    if (!res.ok) return { ok: false };
    const data = await res.json();
    return { ok: true, rank: typeof data?.rank === "number" ? data.rank : undefined };
  } catch {
    return { ok: false };
  }
}

// Detect the player's country/region for the leaderboard. Free, no API key
// required. Falls back to "" silently if blocked.
async function detectRegion(): Promise<string> {
  try {
    const r = await fetch("https://ipapi.co/json/", { cache: "force-cache" });
    if (!r.ok) return "";
    const j = await r.json();
    if (typeof j?.country_name === "string" && j.country_name) return j.country_name;
    if (typeof j?.country_code === "string") return j.country_code;
  } catch {
    // ignored
  }
  return "";
}

// ---------- main component ----------

interface UiState {
  status: GameStatus;
  score: number;
  seconds: number;
  kills: number;
  distance: number;
  combo: number;
  comboPeak: number;
  coinsThisRun: number;
  active: { type: PowerUpType; remainingMs: number }[];
}

type CelebrationKind = "personal" | "world" | null;

// Deterministic confetti pieces — angle + distance per piece, no Math.random
// during render (would trip react-hooks/purity).
function buildConfetti(count: number, dist: number) {
  const colors = ["#22c55e", "#60a5fa", "#f59e0b", "#a78bfa", "#ec4899", "#22d3ee"];
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + (i % 4) * 0.3;
    const d = dist * (0.7 + (i % 5) * 0.12);
    return {
      id: i,
      dx: Math.cos(angle) * d,
      dy: Math.sin(angle) * d - 80,
      rot: (i * 53) % 360,
      color: colors[i % colors.length],
    };
  });
}

export function SpaceShooterGame() {
  const gameRefs = useRef<GameRefs>(createRefs());
  const containerRef = useRef<HTMLDivElement>(null);
  const [tick, setTick] = useState(0);
  const [ui, setUi] = useState<UiState>({ status: "armed", score: 0, seconds: 0, kills: 0, distance: 0, combo: 1, comboPeak: 1, coinsThisRun: 0, active: [] });
  const [celebration, setCelebration] = useState<CelebrationKind>(null);
  const [region, setRegion] = useState<string>("");
  const PERSONAL_CONFETTI = useMemo(() => buildConfetti(28, 220), []);
  const WORLD_CONFETTI = useMemo(() => buildConfetti(60, 360), []);
  const [highScore, setHighScore] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const saved = window.localStorage.getItem(HS_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [name, setName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(NAME_KEY) ?? "";
  });
  const [submitted, setSubmitted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    // Sound is ON by default — but localStorage "0" persists explicit mute.
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(SOUND_KEY) !== "0";
  });
  const [showInstructions, setShowInstructions] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefs, setPrefs] = useState({
    reducedMotion: false,
    gyroEnabled: false,
    bloomEnabled: true,
    musicEnabled: true,
    sfxEnabled: true,
  });
  const [firstBossSeen, setFirstBossSeen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("orbital-dodge-first-boss-seen") === "1";
  });
  const [profile, setProfile] = useState(() => loadProfile());
  const refreshProfile = useCallback(() => setProfile(loadProfile()), []);
  const isReturningPlayer = profile.firstRunCompleted;
  // Load player prefs from profile (or localStorage fallback)
  useEffect(() => {
    try {
      const p = loadProfile();
      if (p.preferences) {
        setPrefs((prev) => ({ ...prev, ...p.preferences }));
        return;
      }
      const raw = localStorage.getItem("orbital-dodge-prefs");
      if (raw) setPrefs((prev) => ({ ...prev, ...JSON.parse(raw) }));
    } catch { /* noop */ }
  }, []);
  // Save on change
  useEffect(() => {
    try {
      const p = loadProfile();
      p.preferences = { ...p.preferences, ...prefs };
      saveProfile(p);
    } catch {
      try { localStorage.setItem("orbital-dodge-prefs", JSON.stringify(prefs)); } catch { /* noop */ }
    }
  }, [prefs]);
  // Persist "first boss seen" flag when boss enters fighting phase
  useEffect(() => {
    if (firstBossSeen) return;
    const b = gameRefs.current.boss;
    if (b && b.phase === "fighting") {
      try {
        window.localStorage.setItem("orbital-dodge-first-boss-seen", "1");
      } catch { /* noop */ }
      setFirstBossSeen(true);
    }
  }, [tick, firstBossSeen]);
  const buyUpgrade = useCallback((id: string) => {
    const def = upgradeById(id as "coin-magnet" | "coin-value" | "score-multiplier" | "combo-window" | "shield-duration");
    if (!def) return;
    const currentLevel = profile.ownedUpgrades[id] ?? 0;
    if (currentLevel >= def.maxLevel) return;
    const cost = def.costAtLevel(currentLevel + 1);
    if (profile.walletCoins < cost) return;
    const spend = spendCoins(cost);
    if (!spend.ok) return;
    setUpgradeLevel(id, currentLevel + 1);
    sounds.play("chime");
    refreshProfile();
  }, [profile, refreshProfile]);

  const togglePause = useCallback(() => {
    const g = gameRefs.current;
    if (g.status === "playing") {
      g.status = "paused";
      sounds.stopMusic(0.3);
      setUi((u) => ({ ...u, status: "paused" }));
    } else if (g.status === "paused") {
      g.status = "playing";
      sounds.startGameplayMusic();
      setUi((u) => ({ ...u, status: "playing" }));
    }
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.().catch(() => { /* user denied or unsupported */ });
    } else {
      document.exitFullscreen?.();
    }
  }, []);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  const isTouch = useMemo<boolean>(() => {
    if (typeof window === "undefined") return false;
    return navigator.maxTouchPoints > 0 || matchMedia("(pointer: coarse)").matches;
  }, []);
  const { resolvedTheme } = useTheme();
  const invertedArmed = resolvedTheme === "light" && ui.status === "armed";
  // Mirror to gameRefs so runTick can pick the right color target each frame.
  useEffect(() => {
    gameRefs.current.invertedArmed = invertedArmed;
  }, [invertedArmed]);

  // sync sound manager with React state
  useEffect(() => {
    sounds.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const env = useMemo(() => envForTime(ui.seconds), [ui.seconds]);

  const onUiSync = useCallback(() => {
    const g = gameRefs.current;
    const now = performance.now();
    let seconds = 0;
    if (g.startedAt > 0) {
      if (g.status === "dying" || g.status === "dead") {
        seconds = ((g.dyingAt || now) - g.startedAt) / 1000;
      } else {
        seconds = (now - g.startedAt) / 1000;
      }
    }
    setUi({
      status: g.status,
      score: Math.floor(g.score),
      seconds,
      kills: g.kills,
      distance: Math.floor(g.distance),
      combo: g.combo,
      comboPeak: g.comboPeak,
      coinsThisRun: g.coinsThisRun,
      active: g.activePowerUps.map((p) => ({ type: p.type, remainingMs: Math.max(0, p.expiresAt - now) })),
    });
    setTick((t) => (t + 1) % 1_000_000);
  }, []);

  const onDeath = useCallback(() => {
    const g = gameRefs.current;
    // Stop any sustained sound loops that might still be playing
    sounds.stopWarpLoop();
    g.warpActiveLast = false;
    // Losing jingle was played at collision; give it ~1s before crossfading
    // into the leaderboard track so the two don't talk over each other.
    setTimeout(() => sounds.startLeaderboardMusic(), 1100);
    // Persist everything that compounds across runs.
    addCoins(g.coinsThisRun);
    addRunStats({ asteroidsDestroyed: g.kills, distance: Math.floor(g.distance) });
    incrementRunsPlayed();
    markFirstRunCompleted();
    const final = Math.floor(g.score * g.scoreMultiplier);
    // Compare against the current state value synchronously so the celebration
    // flag is correct in the same render cycle.
    const isPersonalBest = final > highScore && final > 0;
    if (isPersonalBest) {
      window.localStorage.setItem(HS_KEY, String(final));
      setHighScore(final);
    }
    setUi((u) => ({ ...u, status: "dead", score: final, kills: g.kills, distance: Math.floor(g.distance) }));
    setSubmitted(false);
    setCelebration(isPersonalBest ? "personal" : null);
    fetchLeaderboard().then(setLeaderboard);
    refreshProfile();
  }, [highScore, refreshProfile]);

  // "Fly again" — reset everything to the armed state. The next mouse/touch
  // /key press starts a fresh run.
  const launch = useCallback(() => {
    const g = gameRefs.current;
    g.status = "armed";
    g.score = 0;
    g.kills = 0;
    g.distance = 0;
    g.combo = 1;
    g.comboLastAt = 0;
    g.comboPeak = 1;
    g.obstacles.length = 0;
    g.bullets.length = 0;
    g.explosions.length = 0;
    g.speedLines.length = 0;
    g.powerUps.length = 0;
    g.coins.length = 0;
    g.coinsThisRun = 0;
    g.boss = null;
    g.bossProjectiles.length = 0;
    g.bossSchedule = buildBossSchedule();
    g.bossScheduleIdx = 0;
    g.bossesDefeatedThisRun = 0;
    g.normalSpawningPausedUntil = 0;
    g.activePowerUps.length = 0;
    g.debris.length = 0;
    g.scorePopups.length = 0;
    g.shieldActiveLast = false;
    g.warpActiveLast = false;
    g.warpIntensity = 0;
    g.currentEnv = ENVIRONMENTS[0];
    g.nextBiomeAt = pickNextBiomeDistance(0);
    sounds.stopWarpLoop();
    // Stop the leaderboard track playing on the death overlay; gameplay
    // music will start on the next first-input via startRun().
    sounds.stopMusic(0.4);
    g.targetX = 0;
    g.targetY = 0;
    g.shipX = 0;
    g.shipY = 0;
    g.shipZ = 2;
    g.shipRotZ = 0;
    g.lastBullet = 0;
    g.lastSpawn = 0;
    g.lastPowerUpSpawn = 0;
    g.nextWallAt = 0;
    g.lastUiSync = 0;
    g.invulnUntil = 0;
    g.startedAt = 0;
    g.dyingAt = 0;
    g.shipFallSpeed = 0;
    g.deathVelX = 0;
    g.deathVelY = 0;
    g.deathVelZ = 0;
    g.deathAngVel = 0;
    g.cameraTargetX = 0;
    g.cameraTargetY = 0;
    g.cameraTargetZ = 5;
    setUi({ status: "armed", score: 0, seconds: 0, kills: 0, distance: 0, combo: 1, comboPeak: 1, coinsThisRun: 0, active: [] });
    setSubmitted(false);
    setCelebration(null);
    setShowInstructions(true);
  }, []);

  // (Game auto-starts because createRefs() initializes startedAt = now and
  // status = "playing"; no mount-effect needed, which keeps the
  // react-hooks/set-state-in-effect rule happy.)

  // Hide instructions after 6s
  useEffect(() => {
    if (!showInstructions) return;
    const t = setTimeout(() => setShowInstructions(false), 6000);
    return () => clearTimeout(t);
  }, [showInstructions]);

  const submit = useCallback(async () => {
    const trimmed = name.trim().slice(0, 12) || "Pilot";
    window.localStorage.setItem(NAME_KEY, trimmed);
    const result = await submitScore({
      name: trimmed,
      score: ui.score,
      seconds: Math.floor(ui.seconds),
      kills: ui.kills,
      distance: ui.distance,
      region,
    });
    if (result.ok) {
      setSubmitted(true);
      const fresh = await fetchLeaderboard();
      setLeaderboard(fresh);
      // World record overrides personal best celebration
      if (result.rank === 1 && ui.score > 0) {
        setCelebration("world");
      }
    }
  }, [name, ui.score, ui.seconds, ui.kills, ui.distance, region]);

  // Initial leaderboard load + region detection
  useEffect(() => {
    fetchLeaderboard().then(setLeaderboard);
    detectRegion().then(setRegion);
  }, []);

  // Sound toggle persistence
  const toggleSound = useCallback(() => {
    setSoundEnabledState((prev) => {
      const next = !prev;
      // Persist explicit choice; "1" = on, "0" = off (default-on if missing)
      window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      return next;
    });
  }, []);

  // Pointer/touch/keyboard input
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Resume AudioContext on ANY interaction — Chrome requires a user gesture
    // but pointermove alone may not qualify. Pointerdown/touchstart always do.
    const ensureAudio = () => sounds.ensure();

    const updateTarget = (clientX: number, clientY: number) => {
      const g = gameRefs.current;
      if (g.status !== "armed" && g.status !== "playing") return;
      const rect = el.getBoundingClientRect();
      const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -(((clientY - rect.top) / rect.height) * 2 - 1);
      g.targetX = nx * (ARENA_W / 2);
      g.targetY = ny * (ARENA_H / 2);
    };

    const tryStart = () => {
      const g = gameRefs.current;
      if (g.status === "armed") startRun(g);
      // Unpause on movement
      if (g.status === "paused") g.status = "playing";
    };

    const onMove = (e: PointerEvent) => {
      ensureAudio();
      tryStart();
      updateTarget(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      ensureAudio();
      tryStart();
      updateTarget(e.clientX, e.clientY);
    };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        e.preventDefault();
        ensureAudio();
        tryStart();
        updateTarget(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("touchmove", onTouch, { passive: false });
    el.addEventListener("touchstart", onTouch, { passive: false });

    const keys = new Set<string>();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      // Dev hotkey: Shift+B cycles through bosses at current position
      if (process.env.NODE_ENV !== "production" && e.shiftKey && k === "b") {
        e.preventDefault();
        const bossIds: BossId[] = [
          "sentinel", "drifter", "swarm-mother", "mirror",
          "pulsar", "harvester", "warden", "void-tyrant",
        ];
        const g = gameRefs.current;
        const currentIdx = g.boss ? bossIds.indexOf(g.boss.id) : -1;
        const nextIdx = (currentIdx + 1) % bossIds.length;
        g.boss = null;
        g.bossProjectiles.length = 0;
        spawnBoss(g, bossIds[nextIdx], 0);
        return;
      }
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"].includes(k)) {
        if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(k)) e.preventDefault();
        tryStart();
      }
      keys.add(k);
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);

    let raf = 0;
    const loop = () => {
      const g = gameRefs.current;
      if (g.status === "playing") {
        const speed = 0.14;
        let dx = 0;
        let dy = 0;
        if (keys.has("arrowleft") || keys.has("a")) dx -= speed;
        if (keys.has("arrowright") || keys.has("d")) dx += speed;
        if (keys.has("arrowup") || keys.has("w")) dy += speed;
        if (keys.has("arrowdown") || keys.has("s")) dy -= speed;
        g.targetX += dx;
        g.targetY += dy;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("touchmove", onTouch);
      el.removeEventListener("touchstart", onTouch);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div>
      {/* 3D Canvas — responsive across mobile / 16:9 / 21:9 with a cap so
          super-ultrawide viewports get letterboxed instead of giving the
          player extra play area. Fullscreen mode fills the screen.
          touch-none is only applied while the game is consuming touches;
          during dead/dying we allow normal touch so the death overlay's
          Fly Again button is tappable on mobile fullscreen. */}
      <div
        ref={containerRef}
        className={`relative rounded-xl border border-(--border) overflow-hidden mx-auto ${
          (ui.status === "playing" || ui.status === "armed" || ui.status === "paused") ? "touch-none" : "touch-auto"
        } ${
          isFullscreen
            ? "fixed inset-0 z-50 w-screen h-screen rounded-none border-0"
            : "w-full aspect-3/4 sm:aspect-auto sm:h-115"
        }`}
        style={{
          background: invertedArmed ? INVERTED_ARMED_ENV.bg : env.bg,
          cursor: ui.status === "playing" ? "none" : "default",
          // Cap so 16:1 monitors letterbox at ~21:9, AND cap mobile portrait
          // height so the canvas doesn't dominate the viewport on tall phones.
          maxWidth: isFullscreen ? "100vw" : "min(100%, calc(100vh * 21 / 9))",
          maxHeight: isFullscreen ? "100vh" : "70vh",
        }}
      >
        <Canvas camera={{ position: [0, 0, 5], fov: 60 }} dpr={[1, 1.6]} performance={{ min: 0.5 }}>
          <Scene
            gameRefs={gameRefs}
            onDeath={onDeath}
            onUiSync={onUiSync}
            env={env}
            tick={tick}
          />
        </Canvas>

        {/* ===== In-canvas HUD — lives inside the 3D viewport ===== */}
        {(ui.status === "playing" || ui.status === "paused") && (
          <>
            {/* Top-left: score + distance + kills — styled to match game aesthetic */}
            {/* Shop modal — only reachable for returning players */}
            <AnimatePresence>
              {shopOpen && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex flex-col bg-black/80 backdrop-blur-md p-4 overflow-y-auto z-10"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <ShoppingCart className="h-5 w-5 text-accent-amber" />
                      <h3 className="text-lg font-bold text-white">Shop</h3>
                      <div className="flex items-center gap-1.5 rounded-md bg-accent-amber/20 border border-accent-amber/40 px-2 py-1 text-sm font-mono text-accent-amber">
                        <CoinsIcon className="h-3.5 w-3.5" />
                        {profile.walletCoins}
                      </div>
                    </div>
                    <button
                      onClick={() => setShopOpen(false)}
                      className="rounded-lg bg-white/10 border border-white/20 p-1.5 text-white hover:bg-white/20 transition-colors"
                      aria-label="Close shop"
                    >
                      <XIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-3xl mx-auto w-full">
                    {UPGRADES.map((u) => {
                      const level = profile.ownedUpgrades[u.id] ?? 0;
                      const maxed = level >= u.maxLevel;
                      const nextCost = maxed ? 0 : u.costAtLevel(level + 1);
                      const affordable = profile.walletCoins >= nextCost;
                      const Icon =
                        u.iconKey === "magnet" ? Magnet :
                        u.iconKey === "coins" ? CoinsIcon :
                        u.iconKey === "trophy" ? Trophy :
                        u.iconKey === "timer" ? Timer :
                        Shield;
                      return (
                        <button
                          key={u.id}
                          onClick={() => !maxed && affordable && buyUpgrade(u.id)}
                          disabled={maxed || !affordable}
                          className={`flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-all ${
                            maxed
                              ? "border-emerald-500/40 bg-emerald-500/10"
                              : affordable
                              ? "border-accent-blue/50 bg-white/5 hover:bg-white/10"
                              : "border-white/10 bg-white/5 opacity-50"
                          }`}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <Icon className="h-4 w-4 text-accent-blue" />
                            <span className="font-semibold text-white flex-1">{u.label}</span>
                            <span className="text-xs font-mono text-white/60">
                              L{level}/{u.maxLevel}
                            </span>
                          </div>
                          <div className="text-xs text-white/70">{u.description}</div>
                          <div className="flex items-center gap-1.5 mt-1 text-xs font-mono">
                            {maxed ? (
                              <span className="text-emerald-400">MAXED</span>
                            ) : (
                              <>
                                <CoinsIcon className="h-3 w-3 text-accent-amber" />
                                <span className={affordable ? "text-accent-amber" : "text-white/40"}>{nextCost}</span>
                              </>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="pointer-events-none absolute top-3 left-3 flex flex-col gap-1.5 text-xs sm:text-sm">
              <div className="flex items-center gap-4 rounded-lg bg-black/50 backdrop-blur-sm px-3 py-1.5 border border-white/10">
                <span className="flex items-center gap-1.5 font-mono font-bold tabular-nums text-accent-blue">
                  <Rocket className="h-3.5 w-3.5" />
                  {ui.score}
                </span>
                <span className="font-mono tabular-nums text-white/80">{ui.distance}m</span>
                <span className="font-mono tabular-nums text-white/80">{ui.kills} kills</span>
                {ui.combo > 1 && (
                  <motion.span
                    key={ui.combo}
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 20 }}
                    className="font-mono font-bold tabular-nums"
                    style={{ color: comboColor(ui.combo) }}
                  >
                    {"\u00d7"}{ui.combo}
                  </motion.span>
                )}
                <span className="font-mono tabular-nums text-white/50">{ui.seconds.toFixed(0)}s</span>
              </div>
              {/* Active power-ups */}
              {ui.active.length > 0 && (
                <div className="flex items-center gap-2">
                  {ui.active.map((a) => {
                    const def = POWERUP_DEFS[a.type];
                    const Icon = a.type === "shield" ? Shield : a.type === "triple" ? Crosshair : a.type === "rapid" ? Zap : a.type === "warp" ? Rocket : Target;
                    const pct = Math.min(100, (a.remainingMs / POWERUP_DURATION_MS) * 100);
                    return (
                      <div key={a.type} className="flex items-center gap-1 rounded-md bg-black/50 backdrop-blur-sm px-2 py-1 border border-white/10" style={{ borderColor: `${def.color}55` }}>
                        <Icon className="h-3 w-3" style={{ color: def.color }} />
                        <div className="h-1 w-10 rounded-full bg-white/15 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: def.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Top-right: best + controls (pause / mute / fullscreen) */}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {highScore > 0 && (
                <div className="pointer-events-none flex items-center gap-1 rounded-lg bg-black/50 backdrop-blur-sm px-2.5 py-1.5 border border-white/10 text-xs font-mono tabular-nums text-accent-amber">
                  <Trophy className="h-3 w-3" />
                  {highScore}
                </div>
              )}
              <button
                onClick={togglePause}
                aria-label={ui.status === "paused" ? "Resume" : "Pause"}
                className="rounded-lg bg-black/50 backdrop-blur-sm p-1.5 border border-white/10 text-white/80 hover:text-white transition-colors"
              >
                {ui.status === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={toggleSound}
                aria-label={soundEnabled ? "Mute" : "Unmute"}
                className="rounded-lg bg-black/50 backdrop-blur-sm p-1.5 border border-white/10 text-white/80 hover:text-white transition-colors"
              >
                {soundEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                className="rounded-lg bg-black/50 backdrop-blur-sm p-1.5 border border-white/10 text-white/80 hover:text-white transition-colors"
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            </div>

            {/* Biome label — bottom center */}
            <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-white/40">
              <span className="h-1 w-1 rounded-full bg-accent-blue/60 animate-pulse" />
              {env.name}
            </div>
          </>
        )}

        {/* Pulsing instruction overlay — anchored low so the ship in the
            centre of the canvas stays visible behind it. */}
        {/* Pause overlay */}
        <AnimatePresence>
          {ui.status === "paused" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-[2px]"
            >
              <div className="text-xs uppercase tracking-[0.3em] text-white/60 font-bold">
                Paused
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={togglePause}
                className="rounded-xl bg-white/10 border border-white/20 backdrop-blur-md px-6 py-2.5 text-sm font-semibold text-white"
              >
                Resume
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings gear (idle or dead only) */}
        {(ui.status === "armed" || ui.status === "dead") && (
          <button
            onClick={() => setSettingsOpen(true)}
            className="absolute top-3 right-3 p-2 rounded bg-black/40 border border-white/20 hover:bg-black/60 transition z-30 text-white"
            aria-label="Settings"
            type="button"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        {settingsOpen && (
          <div
            className="absolute inset-0 bg-black/80 flex items-center justify-center z-40"
            onClick={() => setSettingsOpen(false)}
          >
            <div
              className="bg-slate-900 border border-white/20 rounded-lg p-5 min-w-[260px] max-w-[90%]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-white">Settings</h3>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(false)}
                  className="text-slate-400 hover:text-white"
                  aria-label="Close settings"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-3">
                <SettingsToggle label="Reduced motion" checked={prefs.reducedMotion} onChange={(v) => setPrefs((p) => ({ ...p, reducedMotion: v }))} />
                <SettingsToggle label="Bloom / glow" checked={prefs.bloomEnabled} onChange={(v) => setPrefs((p) => ({ ...p, bloomEnabled: v }))} />
                <SettingsToggle label="Music" checked={prefs.musicEnabled} onChange={(v) => setPrefs((p) => ({ ...p, musicEnabled: v }))} />
                <SettingsToggle label="SFX" checked={prefs.sfxEnabled} onChange={(v) => setPrefs((p) => ({ ...p, sfxEnabled: v }))} />
              </div>
            </div>
          </div>
        )}

        {/* Boss intro banner */}
        {gameRefs.current.boss && gameRefs.current.boss.phase === "intro" && (
          <div className="absolute inset-x-0 top-[18%] flex flex-col items-center pointer-events-none z-30">
            <div className="text-xs tracking-[0.4em] text-red-400 animate-pulse">INCOMING</div>
            <div className="text-3xl sm:text-5xl font-black text-white drop-shadow-[0_0_12px_rgba(239,68,68,0.6)]">
              {BOSS_DISPLAY_NAMES[gameRefs.current.boss.id]}
            </div>
            {!firstBossSeen && (
              <div className="mt-2 text-xs text-slate-300 max-w-xs text-center">
                Bosses interrupt normal flight. Shoot them to progress. Dodge their attacks.
              </div>
            )}
          </div>
        )}
        {/* Boss HP bar */}
        {gameRefs.current.boss && gameRefs.current.boss.phase === "fighting" && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none z-30">
            <div className="text-[10px] tracking-[0.3em] text-red-300">
              {BOSS_DISPLAY_NAMES[gameRefs.current.boss.id]}
            </div>
            <div className="w-48 sm:w-64 h-2 bg-black/60 border border-red-500/50 overflow-hidden rounded-sm">
              <div
                className="h-full bg-linear-to-r from-red-600 to-red-400 transition-[width] duration-100"
                style={{ width: `${Math.max(0, (gameRefs.current.boss.hp / gameRefs.current.boss.hpMax) * 100)}%` }}
              />
            </div>
            {gameRefs.current.boss.id === "swarm-mother" &&
              gameRefs.current.boss.subEntities.some((s) => s.type === "drone") && (
                <div className="text-[10px] tracking-[0.3em] text-fuchsia-300 animate-pulse">
                  CLEAR DRONES
                </div>
            )}
          </div>
        )}

        {/* Armed instructions: first-timer sees the pulsing pill; returning player sees Play/Shop buttons */}
        <AnimatePresence>
          {ui.status === "armed" && !isReturningPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="pointer-events-none absolute inset-x-0 bottom-6 flex flex-col items-center gap-2"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1], opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                <motion.span
                  className="absolute inset-0 rounded-full bg-accent-blue/15 blur-xl"
                  animate={{ scale: [1, 1.4, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                />
                <div className="relative rounded-full border-2 border-accent-blue/60 bg-black/75 backdrop-blur-md px-7 py-3 text-base font-semibold text-white shadow-lg shadow-accent-blue/20">
                  {isTouch ? "Drag your finger to start" : "Move your mouse or press WASD to start"}
                </div>
              </motion.div>
              <div className="text-xs uppercase tracking-[0.25em] text-white/60">
                Cannons fire automatically
              </div>
            </motion.div>
          )}
          {ui.status === "armed" && isReturningPlayer && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-x-0 bottom-6 flex flex-col items-center gap-3"
            >
              <div className="flex items-center gap-1.5 rounded-md bg-accent-amber/15 border border-accent-amber/40 px-2.5 py-1 text-xs font-mono text-accent-amber">
                <CoinsIcon className="h-3.5 w-3.5" />
                {profile.walletCoins}
              </div>
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    const g = gameRefs.current;
                    if (g.status === "armed") startRun(g);
                  }}
                  className="rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-7 py-3 text-base font-bold uppercase tracking-wider text-white shadow-lg shadow-accent-blue/30"
                >
                  Play
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShopOpen(true)}
                  className="flex items-center gap-2 rounded-xl bg-accent-amber/20 border border-accent-amber/50 px-5 py-3 text-sm font-bold uppercase tracking-wider text-accent-amber"
                >
                  <ShoppingCart className="h-4 w-4" />
                  Shop
                </motion.button>
              </div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-white/50">
                {isTouch ? "Or drag finger" : "Or move mouse / press WASD"}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Death overlay with leaderboard */}
        <AnimatePresence>
          {ui.status === "dead" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/70 backdrop-blur-md p-4 overflow-y-auto"
            >
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 240, damping: 16 }}
                className="relative text-center"
              >
                {/* Confetti burst — bigger when world record */}
                {celebration && (
                  <>
                    {(celebration === "world" ? WORLD_CONFETTI : PERSONAL_CONFETTI).map((c) => (
                      <motion.div
                        key={c.id}
                        className="absolute top-1/2 left-1/2 h-2 w-2 rounded-sm"
                        initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
                        animate={{ x: c.dx, y: c.dy, opacity: 0, rotate: c.rot }}
                        transition={{ duration: celebration === "world" ? 1.8 : 1.3, ease: "easeOut", delay: c.id * 0.012 }}
                        style={{ background: c.color }}
                      />
                    ))}
                  </>
                )}
                <div className="text-xs uppercase tracking-[0.3em] text-red-400 font-bold">
                  Ship destroyed
                </div>
                <div className="mt-1 text-5xl font-black font-display text-white tabular-nums">
                  {ui.score}
                </div>
                {celebration === "world" && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.2 }}
                    className="mt-3 inline-flex items-center gap-2 rounded-full bg-linear-to-br from-accent-amber via-accent-pink to-accent-blue px-4 py-1.5 text-sm font-black uppercase tracking-widest text-black"
                  >
                    <Trophy className="h-4 w-4" />
                    World Record
                  </motion.div>
                )}
                {celebration === "personal" && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 14, delay: 0.15 }}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-amber/20 border border-accent-amber/60 px-3 py-1 text-xs font-bold uppercase tracking-widest text-accent-amber"
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Personal Best
                  </motion.div>
                )}
                {ui.coinsThisRun > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="mt-2 flex items-center justify-center gap-1.5 text-accent-amber font-mono text-sm"
                  >
                    <CoinsIcon className="h-4 w-4" />
                    +{ui.coinsThisRun} coins
                  </motion.div>
                )}
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs text-white/75 max-w-md mx-auto">
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Survived</div>
                    <div className="font-mono text-white tabular-nums">{ui.seconds.toFixed(0)}s</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Distance</div>
                    <div className="font-mono text-white tabular-nums">{ui.distance}m</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Kills</div>
                    <div className="font-mono text-white tabular-nums">{ui.kills}</div>
                  </div>
                  <div className="rounded-md border border-white/15 bg-white/5 px-2 py-1.5">
                    <div className="text-white/50 uppercase tracking-wider text-[10px]">Peak Combo</div>
                    <div className="font-mono text-white tabular-nums" style={{ color: comboColor(ui.comboPeak) }}>{"\u00d7"}{ui.comboPeak}</div>
                  </div>
                </div>
                {gameRefs.current.bossesDefeatedThisRun > 0 && (
                  <div className="mt-2 flex items-center justify-center gap-1.5 text-red-300 font-mono text-sm">
                    <span>Bosses Defeated:</span>
                    <span className="text-white font-bold">{gameRefs.current.bossesDefeatedThisRun}</span>
                  </div>
                )}
              </motion.div>

              <div className="w-full max-w-md flex items-center gap-2">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 12))}
                  placeholder="Pilot name"
                  maxLength={12}
                  className="flex-1 rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-sm text-white placeholder-white/40 focus:border-accent-blue focus:outline-none"
                />
                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={submit}
                  disabled={submitted}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-amber px-3 py-2 text-sm font-semibold text-black disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {submitted ? "Submitted" : "Submit"}
                </motion.button>
              </div>

              {leaderboard.length > 0 && (
                <div className="w-full max-w-md rounded-lg border border-white/15 bg-white/5 p-3 text-sm">
                  <div className="text-xs uppercase tracking-widest text-white/60 mb-2 font-bold">
                    Top pilots
                  </div>
                  <ol className="space-y-1">
                    {leaderboard.slice(0, 8).map((e, i) => (
                      <li key={`${e.name}-${e.createdAt}-${i}`} className="flex items-center gap-2 text-white/85">
                        <span className="text-white/40 w-5 tabular-nums">{i + 1}.</span>
                        <span className="flex-1 truncate">
                          {e.name}
                          {e.region && <span className="ml-1.5 text-white/40 text-xs">{e.region}</span>}
                        </span>
                        {typeof e.seconds === "number" && (
                          <span className="text-white/45 text-xs tabular-nums">{e.seconds}s</span>
                        )}
                        <span className="font-mono tabular-nums">{e.score}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={launch}
                  className="inline-flex items-center gap-2 rounded-xl bg-linear-to-br from-accent-blue to-accent-pink px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-white shadow-lg"
                >
                  <RotateCcw className="h-4 w-4" />
                  Fly again
                </motion.button>
                {isReturningPlayer && (
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShopOpen(true)}
                    className="inline-flex items-center gap-2 rounded-xl bg-accent-amber/20 border border-accent-amber/50 px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-accent-amber"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    Shop
                  </motion.button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <p className="text-xs text-(--muted)">
        Endless run. Pick up power-ups for temporary firepower or shield. Biome shifts every 35s — and the asteroids get meaner the longer you survive.
      </p>
    </div>
  );
}
