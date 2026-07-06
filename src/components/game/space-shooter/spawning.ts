import * as THREE from "three";
import type { GameRefs, Obstacle, BulletStyle, PowerUp } from "./types";
import {
  ARENA_W,
  ARENA_H,
  SPAWN_Z,
  MAX_BULLETS,
  POWERUP_TYPES,
  nextId,
  isPowerUpActive,
} from "./types";
import { difficulty, elapsedSeconds, unlockedVariants } from "./difficulty";
import type { SoundManager } from "./sound-manager";

export function spawnIntervalMs(g: GameRefs): number {
  const d = difficulty(g);
  return Math.max(280, 900 - d * 280);
}

export function fireIntervalMs(g: GameRefs): number {
  const base = isPowerUpActive(g, "rapid") ? 95 : 220;
  const d = difficulty(g);
  return Math.max(70, base - d * 30);
}

export function bulletDamage(g: GameRefs): number {
  const base = 1 + (isPowerUpActive(g, "mega") ? 3 : 0);
  return base * g.shipDamageMul;
}

// ---------- spawning ----------

export function spawnObstacle(g: GameRefs): Obstacle {
  const seconds = elapsedSeconds(g);
  const variants = unlockedVariants(seconds);
  const variant = variants[Math.floor(Math.random() * variants.length)];

  // Anti-camp: 35% of asteroids are loosely aimed at the player's wider
  // neighborhood (±3 X, ±2 Y), 65% uniform across the arena. The wider band
  // means aim-at-player no longer concentrates on the auto-fire lane so
  // camping at any single point no longer guarantees clean kills.
  // Spawn bounds factor in asteroid body radius + a safety margin so no part of
  // the obstacle ever sits outside the visible arena (especially on narrow mobile
  // viewports). Aim-at-player offsets also scale to the current arena size.
  const maxBodyHalf = 0.8;
  const spawnHalfW = Math.max(0.1, ARENA_W / 2 - maxBodyHalf);
  const spawnHalfH = Math.max(0.1, ARENA_H / 2 - maxBodyHalf);
  const aimOffsetX = Math.min(3, spawnHalfW * 1.2);
  const aimOffsetY = Math.min(2, spawnHalfH * 1.2);
  const aimAtPlayer = Math.random() < 0.35;
  let x: number, y: number;
  if (aimAtPlayer) {
    x = THREE.MathUtils.clamp(
      g.shipX + (Math.random() - 0.5) * aimOffsetX * 2,
      -spawnHalfW,
      spawnHalfW,
    );
    y = THREE.MathUtils.clamp(
      g.shipY + (Math.random() - 0.5) * aimOffsetY * 2,
      -spawnHalfH,
      spawnHalfH,
    );
  } else {
    x = (Math.random() - 0.5) * 2 * spawnHalfW;
    y = (Math.random() - 0.5) * 2 * spawnHalfH;
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
  } else if (variant === "shooter") {
    size = 0.7 + Math.random() * 0.2;
    hp = 2;
    speed = baseSpeed * 0.55; // slow — gives the player time to dodge its shots
  } else if (variant === "zapper") {
    size = 0.6 + Math.random() * 0.2;
    hp = 3; // tougher than shooter, incentivizes dodging
    speed = baseSpeed * 0.6;
  } else if (variant === "drone") {
    size = 0.5 + Math.random() * 0.15;
    hp = 2;
    speed = baseSpeed * 0.15; // nearly stationary — persistent threat until shot down
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
    x,
    y,
    z: SPAWN_Z - Math.random() * 8,
    rx: Math.random() * Math.PI,
    ry: Math.random() * Math.PI,
    rz: Math.random() * Math.PI,
    rsx: (Math.random() - 0.5) * 1.8,
    rsy: (Math.random() - 0.5) * 1.8,
    rsz: (Math.random() - 0.5) * 1.8,
    vx,
    vy,
    vz: speed,
    size,
    hp,
    shape: Math.floor(Math.random() * 3) as 0 | 1 | 2,
    closestApproach: Infinity,
    brushed: false,
  };
}

// Pick a gap X position for a wall. The gap is placed at least MIN_GAP_DIST
// units from the player's current X so the player has to physically cross
// the arena to reach it — breaking the edge-camping strategy.
export function pickWallGapX(playerX: number, arenaW: number): number {
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
export function spawnWall(g: GameRefs) {
  const WALL_COUNT = 6; // 6 asteroid slots evenly spaced across ARENA_W
  const ROWS = 3; // 3 stacked rows so the gap is a full-height Y column
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
    if (d < gapBestDist) {
      gapBestDist = d;
      gapIndex = i;
    }
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
        vx: 0,
        vy: 0,
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
export function spawnCoin(g: GameRefs, x: number, y: number, z: number, value: number) {
  g.coins.push({
    id: nextId(g),
    x,
    y,
    z,
    rx: 0,
    ry: 0,
    rz: 0,
    vx: 0,
    vy: 0,
    value,
  });
}

export function spawnPowerUp(g: GameRefs): PowerUp {
  const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
  return {
    id: nextId(g),
    type,
    x: (Math.random() - 0.5) * (ARENA_W * 0.7),
    y: (Math.random() - 0.5) * (ARENA_H * 0.7),
    z: SPAWN_Z - 4,
    rx: 0,
    ry: 0,
    rz: 0,
  };
}

export function styleForBullet(g: GameRefs): BulletStyle {
  if (isPowerUpActive(g, "mega")) return "plasma";
  if (isPowerUpActive(g, "triple")) return "bolt";
  return "sprite";
}

export function bulletColor(g: GameRefs): string {
  if (isPowerUpActive(g, "mega")) return "#a78bfa";
  if (isPowerUpActive(g, "triple")) return "#f472b6";
  if (isPowerUpActive(g, "rapid")) return "#22d3ee";
  return "#fde047";
}

export function fireBullets(g: GameRefs, now: number, sounds: SoundManager) {
  if (g.bullets.length >= MAX_BULLETS) return;
  const style = styleForBullet(g);
  const color = bulletColor(g);
  const dmg = bulletDamage(g);
  const baseSize = 0.07;
  const make = (vx: number, sx: number, sizeMul = 1, hp = 1) => {
    g.bullets.push({
      id: nextId(g),
      x: g.shipX + sx,
      y: g.shipY + 0.05,
      z: 1.5,
      vx,
      vy: 0,
      vz: -55,
      size: baseSize * sizeMul,
      damage: dmg,
      color,
      hp,
      style,
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

export function spawnExplosion(
  g: GameRefs,
  x: number,
  y: number,
  z: number,
  color: string,
  duration = 600,
  scale = 0.3,
) {
  // Reduced-motion: drop ~80% of small cosmetic sparks (< 400ms duration).
  // Keep bigger, narratively important bursts (death, boss defeat) untouched.
  if (g.prefs.reducedMotion && duration < 400 && Math.random() > 0.2) return;
  g.explosions.push({
    id: nextId(g),
    x,
    y,
    z,
    startedAt: performance.now(),
    color,
    scale,
    opacity: 1,
    duration,
  });
}

export function spawnScorePopup(g: GameRefs, x: number, y: number, z: number, amount: number) {
  g.scorePopups.push({
    id: nextId(g),
    x,
    y,
    z,
    amount,
    spawnedAt: performance.now(),
    ttl: 1100,
  });
}

// Spawn the chunks that fly off when the ship is destroyed: two red wing
// tips and a cyan cockpit shard. Each gets the ship's death impulse plus a
// random kick so they fan out instead of moving in formation.
export function spawnShipDebris(g: GameRefs) {
  const baseVx = g.deathVelX;
  const baseVy = g.deathVelY;
  const baseVz = g.deathVelZ;
  const now = performance.now();
  const make = (
    offsetX: number,
    offsetY: number,
    offsetZ: number,
    color: string,
    sx: number,
    sy: number,
    sz: number,
    kickX: number,
    kickY: number,
  ) => {
    g.debris.push({
      id: nextId(g),
      x: g.shipX + offsetX,
      y: g.shipY + offsetY,
      z: g.shipZ + offsetZ,
      vx: baseVx + kickX,
      vy: baseVy + kickY,
      vz: baseVz * 0.7 + (Math.random() - 0.5) * 2,
      rx: 0,
      ry: 0,
      rz: 0,
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
