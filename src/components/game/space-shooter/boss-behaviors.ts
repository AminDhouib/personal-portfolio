import type { GameRefs, BossState, BossId } from "./types";
import { isPowerUpActive } from "./types";
import { spawnExplosion, spawnShipDebris } from "./spawning";
import { sounds } from "./sound-manager";
import { loadProfile, spendCoins } from "../profile";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildBossSchedule(): { distance: number; bossId: BossId }[] {
  return [
    { distance: 1500, bossId: "sentinel" },
    { distance: 3000, bossId: "drifter" },
    { distance: 4500, bossId: "swarm-mother" },
    { distance: 6000, bossId: "mirror" },
    { distance: 7500, bossId: "pulsar" },
    { distance: 9000, bossId: "harvester" },
    { distance: 11000, bossId: "warden" },
    { distance: 13000, bossId: "void-tyrant" },
    { distance: 16000, bossId: "sentinel" },
    { distance: 19000, bossId: "drifter" },
    { distance: 22000, bossId: "swarm-mother" },
  ];
}

// The roster cycled after the authored schedule runs out, in tier order so a
// long run keeps escalating through the full cast.
const RECYCLE_ROSTER: BossId[] = [
  "sentinel",
  "drifter",
  "swarm-mother",
  "mirror",
  "pulsar",
  "harvester",
  "warden",
  "void-tyrant",
];

// Endless boss scheduling: authored entries first, then the roster recycles
// forever at a 3000m cadence. Without this, runs past the last authored
// distance silently stopped producing bosses.
export function bossScheduleEntry(
  schedule: { distance: number; bossId: BossId }[],
  idx: number,
): { distance: number; bossId: BossId } {
  const authored = schedule[idx];
  if (authored) return authored;
  const lastDistance = schedule[schedule.length - 1]?.distance ?? 0;
  const extra = idx - schedule.length; // 0-based index into the recycled tail
  return {
    distance: lastDistance + (extra + 1) * 3000,
    bossId: RECYCLE_ROSTER[extra % RECYCLE_ROSTER.length] ?? "sentinel",
  };
}

export const BOSS_TIERS: Record<BossId, number> = {
  sentinel: 1,
  drifter: 2,
  "swarm-mother": 3,
  mirror: 4,
  pulsar: 5,
  harvester: 6,
  warden: 7,
  "void-tyrant": 8,
};

export const BOSS_BASE_HP: Record<BossId, number> = {
  sentinel: 8,
  drifter: 12,
  "swarm-mother": 20,
  mirror: 18,
  pulsar: 25,
  harvester: 30,
  warden: 40,
  "void-tyrant": 60,
};

export const BOSS_DISPLAY_NAMES: Record<BossId, string> = {
  sentinel: "SENTINEL",
  drifter: "DRIFTER",
  "swarm-mother": "SWARM MOTHER",
  mirror: "MIRROR",
  pulsar: "PULSAR",
  harvester: "HARVESTER",
  warden: "WARDEN",
  "void-tyrant": "VOID TYRANT",
};

export function normalizeVec3(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function runWardenBehavior(g: GameRefs, boss: BossState, now: number, step: number): void {
  boss.position[0] = 0;
  boss.position[1] = 4;
  boss.position[2] = -15;
  if (!boss.wallSegments) boss.wallSegments = [];
  const segs = boss.wallSegments;
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
    if (!s) continue;
    s.position[0] += s.velocity[0] * step;
    s.position[1] += s.velocity[1] * step;
    s.position[2] += s.velocity[2] * step;
    if (!s.isGap) {
      const dx = g.shipX - s.position[0];
      const dy = g.shipY - s.position[1];
      const dz = g.shipZ - s.position[2];
      const shieldedShip = isPowerUpActive(g, "shield") || isPowerUpActive(g, "warp");
      if (
        now > g.invulnUntil &&
        !shieldedShip &&
        Math.abs(dx) < 1 &&
        Math.abs(dy) < 1 &&
        Math.abs(dz) < 1
      ) {
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

export function updateDronesGeneric(g: GameRefs, boss: BossState, now: number, step: number): void {
  for (let i = boss.subEntities.length - 1; i >= 0; i--) {
    const d = boss.subEntities[i];
    if (!d) continue;
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
    if (now > g.invulnUntil && !shieldedShip && sdx * sdx + sdy * sdy + sdz * sdz < 0.9 * 0.9) {
      g.status = "dying";
      g.dyingAt = now;
      g.deathVelX = (-sdx / (Math.hypot(sdx, sdy) || 1)) * 7;
      g.deathVelY = (-sdy / (Math.hypot(sdx, sdy) || 1)) * 7 + 3.5;
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

export function runVoidTyrantBehavior(
  g: GameRefs,
  boss: BossState,
  now: number,
  step: number,
): void {
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

export function runHarvesterBehavior(
  g: GameRefs,
  boss: BossState,
  now: number,
  step: number,
): void {
  boss.position[0] = Math.sin((now - boss.phaseStartAt) * 0.0004) * 4;
  boss.position[1] = 5;
  boss.position[2] = -14;
  if (!boss.tractorBeam) {
    boss.tractorBeam = { active: false, startAt: 0, durationMs: 2000, shipOverlapAccum: 0 };
  }
  const beam = boss.tractorBeam;
  // Clamp so the cycle always contains an off phase: past difficultyMult 2 the
  // raw cycle would shrink below the beam duration and the beam never shut off.
  const CYCLE_MS = Math.max(beam.durationMs + 1000, 4000 / boss.difficultyMult);
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

export function runMirrorBehavior(g: GameRefs, boss: BossState, now: number): void {
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

export function runPulsarBehavior(g: GameRefs, boss: BossState, now: number): void {
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

export function runSwarmMotherBehavior(
  g: GameRefs,
  boss: BossState,
  now: number,
  step: number,
): void {
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
    if (!d) continue;
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
    if (now > g.invulnUntil && !shieldedShip && sdx * sdx + sdy * sdy + sdz * sdz < 0.9 * 0.9) {
      g.status = "dying";
      g.dyingAt = now;
      g.deathVelX = (-sdx / (Math.hypot(sdx, sdy) || 1)) * 7;
      g.deathVelY = (-sdy / (Math.hypot(sdx, sdy) || 1)) * 7 + 3.5;
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

export function runDrifterBehavior(g: GameRefs, boss: BossState, now: number): void {
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

export function runSentinelBehavior(g: GameRefs, boss: BossState, now: number): void {
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

export function spawnBoss(state: GameRefs, bossId: BossId, recycleCount: number): void {
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
