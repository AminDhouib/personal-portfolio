import * as THREE from "three";
import type { GameRefs, Viewport, Environment } from "./types";
import {
  ARENA_W,
  ARENA_H,
  setArena,
  SPAWN_Z,
  DESPAWN_Z,
  MAX_OBSTACLES,
  MAX_POWERUPS,
  SHIP_RADIUS,
  POWERUP_PICKUP_RADIUS,
  POWERUP_SPAWN_INTERVAL_MS,
  COMBO_WINDOW_MS,
  NEAR_MISS_RADIUS,
  NEAR_MISS_POINTS,
  POWERUP_DEFS,
  ENVIRONMENTS,
  INVERTED_ARMED_ENV,
  isPowerUpActive,
  envColors,
  activatePowerUp,
} from "./types";
import { difficulty, elapsedSeconds, comboMultiplier } from "./difficulty";
import { sounds } from "./sound-manager";
import {
  spawnIntervalMs,
  fireIntervalMs,
  spawnObstacle,
  spawnWall,
  spawnCoin,
  fireBullets,
  spawnExplosion,
  spawnScorePopup,
  spawnShipDebris,
  spawnPowerUp,
} from "./spawning";
import {
  runWardenBehavior,
  runVoidTyrantBehavior,
  runHarvesterBehavior,
  runMirrorBehavior,
  runPulsarBehavior,
  runSwarmMotherBehavior,
  runDrifterBehavior,
  runSentinelBehavior,
  spawnBoss,
} from "./boss-behaviors";

// ---------- constants (duplicated from main file for module isolation) ----------
const ARENA_W_DESKTOP = 9;
const ARENA_H_DESKTOP = 5.4;
const ARENA_W_MOBILE = 6.5;
const ARENA_H_MOBILE = 6.0;

// ---------- small helpers that runTick needs (still in main file too) ----------
function pickNextBiomeDistance(currentDist: number): number {
  return currentDist + 700 + Math.random() * 900; // 700–1600m further
}

function nextWallTimeMs(now: number): number {
  return now + 25_000 + Math.random() * 15_000;
}

function pickRandomBiome(exclude: Environment | null): Environment {
  if (!exclude) return ENVIRONMENTS[Math.floor(Math.random() * ENVIRONMENTS.length)];
  const others = ENVIRONMENTS.filter((e) => e !== exclude);
  return others[Math.floor(Math.random() * others.length)];
}

// ---------- runTick ----------

export function runTick(
  g: GameRefs,
  dt: number,
  viewport: Viewport,
  onDeath: () => void,
  onUiSync: () => void,
) {
  const now = performance.now();
  g.now = now;
  const step = Math.min(dt, 0.05);

  // Sync world arena dimensions to the visible viewport but cap at the
  // configured maximums so ultrawide canvases don't grant extra play space.
  // On portrait/touch, switch to a taller-but-narrower mobile arena.
  const aspect = viewport.width / Math.max(0.001, viewport.height);
  const portraitOrMobile = g.isMobile || aspect < 1.05;
  const maxW = portraitOrMobile ? ARENA_W_MOBILE : ARENA_W_DESKTOP;
  const maxH = portraitOrMobile ? ARENA_H_MOBILE : ARENA_H_DESKTOP;
  setArena(Math.min(maxW, viewport.width - 1), Math.min(maxH, viewport.height - 1));

  // Distance-based biome roll — random next env every 700–1600m so the
  // transitions feel organic instead of clockwork.
  if (g.distance >= g.nextBiomeAt && g.status === "playing") {
    g.currentEnv = pickRandomBiome(g.currentEnv);
    sounds.biomeTransition();
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
    // Stop the zoom-lines — the world isn't flowing past the ship anymore
    g.speedLines.length = 0;
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
  const warpTarget = g.status === "playing" && isPowerUpActive(g, "warp") ? 1 : 0;
  const warpRampSpeed = warpTarget > 0 ? dt * 4 : dt * 1.8; // fast in, slower out
  g.warpIntensity = THREE.MathUtils.lerp(g.warpIntensity, warpTarget, Math.min(1, warpRampSpeed));
  if (g.warpIntensity < 0.01) g.warpIntensity = 0;
  const wi = g.warpIntensity; // shorthand
  const warpActive = wi > 0.05;
  // Ship lerp, camera, speed lines. Warp intensity interpolates everything.
  const lerpFactor = dt * THREE.MathUtils.lerp(11, 90, wi) * g.shipAgilityMul;
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

  // Kill speed lines once the ship is dead so the world stops streaming past
  // the wreck. ('dying' returns earlier in the tick via a separate branch.)
  if (g.status === "dead") {
    g.speedLines.length = 0;
  }
  const desiredLines = g.status === "dead" ? 0 : wi > 0.5 ? 60 : 32;
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

  // Dash: if active, override ship X with an ease-out toward target and spawn afterimages
  if (now < g.dash.activeUntil) {
    const progress = Math.min(1, (now - g.dash.startedAt) / 300);
    const eased = 1 - Math.pow(1 - progress, 3);
    g.shipX = g.dash.startX + (g.dash.targetX - g.dash.startX) * eased;
    g.targetX = g.shipX;
    if (now - g.lastAfterimageAt > 30) {
      g.dashAfterimages.push({ pos: [g.shipX, g.shipY, g.shipZ], createdAt: now });
      g.lastAfterimageAt = now;
    }
  }
  g.dashAfterimages = g.dashAfterimages.filter((a) => now - a.createdAt < 400);

  // Gyro influence: blend tilt into the target if the player enabled gyro.
  // Gamma/beta are already normalized to -1..1 on gameRefs.gyroTilt. Apply a
  // 60% influence so mouse/touch can still override.
  if (g.prefs.gyroEnabled) {
    const gyInf = 0.6;
    g.targetX = g.targetX * (1 - gyInf) + g.gyroTilt.x * (ARENA_W / 2) * gyInf;
    g.targetY = g.targetY * (1 - gyInf) + g.gyroTilt.y * (ARENA_H / 2) * gyInf;
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
        sounds.bossPulse(b.tier);
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
    if (now > g.invulnUntil && !shieldedShip && dx * dx + dy * dy + dz * dz < hitDist * hitDist) {
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
  if (
    now > g.normalSpawningPausedUntil &&
    now - g.lastSpawn > spawnIntervalMs(g) &&
    g.obstacles.length < MAX_OBSTACLES
  ) {
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
  if (g.status === "playing" && wi < 0.1 && g.nextWallAt > 0 && now >= g.nextWallAt) {
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
      const droneAlive = bo.id === "swarm-mother" && bo.subEntities.some((s) => s.type === "drone");
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

    // Zapper variant: a 1.1s vertical electric column fires every 2.5s while on
    // screen. Ship dies if in the column's X band during the beam-on phase.
    if (o.variant === "zapper" && g.status === "playing" && o.z > -25 && o.z < 2) {
      const CYCLE_MS = 2500;
      const BEAM_MS = 1100;
      const cycleAge = (now - g.startedAt + o.id * 317) % CYCLE_MS; // desync per-zapper
      const beamOn = cycleAge < BEAM_MS;
      // Muzzle flash at the base the instant a new beam cycle starts
      const cycleIdx = Math.floor((now - g.startedAt + o.id * 317) / CYCLE_MS);
      if (beamOn && o.lastBeamCycle !== cycleIdx) {
        o.lastBeamCycle = cycleIdx;
        spawnExplosion(g, o.x, o.y - 0.5, o.z, "#06b6d4", 300, 0.4);
        spawnExplosion(g, o.x, o.y + 2.5, o.z, "#22d3ee", 260, 0.3);
      }
      if (beamOn) {
        const dx = g.shipX - o.x;
        const dz = g.shipZ - o.z;
        const shieldedShip = isPowerUpActive(g, "shield") || isPowerUpActive(g, "warp");
        if (Math.abs(dx) < 0.6 && Math.abs(dz) < 2.5 && now > g.invulnUntil && !shieldedShip) {
          if (g.reviveAvailable && !g.reviveUsed) {
            g.reviveAvailable = false;
            g.reviveUsed = true;
            g.invulnUntil = now + 2500;
            spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#22d3ee", 900, 0.9);
            sounds.play("shieldOn");
          } else {
            g.damageTakenThisRun += 1;
            g.status = "dying";
            g.dyingAt = now;
            g.deathVelX = (Math.random() - 0.5) * 6;
            g.deathVelY = 4;
            g.deathVelZ = 2;
            g.deathAngVel = (Math.random() - 0.5) * 10;
            spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#06b6d4", 500, 0.5);
            spawnShipDebris(g);
            sounds.play("crash");
            sounds.stopMusic(0.4);
            sounds.playLosingJingle();
          }
        }
      }
    }

    // Drone variant: persistent shooter with fast fire rate (1.0s) — drifts
    // slowly so players must either strafe around its shots or kill it.
    if (o.variant === "drone" && g.status === "playing" && o.z > -28 && o.z < 2) {
      const DRONE_INTERVAL_MS = 1000;
      if (!o.lastShotAt || now - o.lastShotAt >= DRONE_INTERVAL_MS) {
        o.lastShotAt = now;
        const dx = g.shipX - o.x;
        const dy = g.shipY - o.y;
        const dz = g.shipZ - o.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const speed = 8;
        g.bossProjectiles.push({
          id: g.nextBossProjectileId++,
          position: [o.x, o.y, o.z],
          velocity: [(dx / len) * speed, (dy / len) * speed, (dz / len) * speed],
          radius: 0.24,
          color: "#ec4899",
          spawnedAt: now,
          ttlMs: 5000,
          homing: false,
          shielded: false,
        });
        // Muzzle flash at the source
        spawnExplosion(g, o.x, o.y, o.z, "#ec4899", 220, 0.22);
      }
    }

    // Shooter variant: fire aimed projectiles every 1.6s while in visible Z band
    if (o.variant === "shooter" && g.status === "playing" && o.z > -25 && o.z < 2) {
      const SHOOT_INTERVAL_MS = 1600;
      if (!o.lastShotAt || now - o.lastShotAt >= SHOOT_INTERVAL_MS) {
        o.lastShotAt = now;
        const dx = g.shipX - o.x;
        const dy = g.shipY - o.y;
        const dz = g.shipZ - o.z;
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const speed = 9;
        g.bossProjectiles.push({
          id: g.nextBossProjectileId++,
          position: [o.x, o.y, o.z],
          velocity: [(dx / len) * speed, (dy / len) * speed, (dz / len) * speed],
          radius: 0.28,
          color: "#f59e0b",
          spawnedAt: now,
          ttlMs: 4000,
          homing: false,
          shielded: false,
        });
        // Muzzle flash
        spawnExplosion(g, o.x, o.y, o.z, "#f59e0b", 240, 0.28);
      }
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

  // Coins: drift toward camera; when magnet is active, smoothly accelerate
  // each coin toward the ship with a velocity-based lerp (no more "sticking").
  // Magnet is OFF by default — the player earns it via the Magnet power-up OR
  // the coin-magnet upgrade (g.coinMagnetExtra > 0).
  const magnetActive = isPowerUpActive(g, "magnet") || g.coinMagnetExtra > 0;
  const magnetStrength = isPowerUpActive(g, "magnet")
    ? 1.8 // strong while power-up active
    : 0.6 + g.coinMagnetExtra * 0.15; // gentler from upgrade alone
  const magnetRange = isPowerUpActive(g, "magnet") ? 6 : 2 + g.coinMagnetExtra;
  for (let i = g.coins.length - 1; i >= 0; i--) {
    const c = g.coins[i];
    c.z += 8 * step * obstacleSpeedMul;
    c.rx += step * 2;
    c.ry += step * 2.5;
    if (c.z > DESPAWN_Z) {
      g.coins.splice(i, 1);
      continue;
    }
    // Magnet pull: build up velocity toward ship, lerp-decay if out of range
    if (magnetActive && c.z > -6 && c.z < 3) {
      const dx = g.shipX - c.x;
      const dy = g.shipY - c.y;
      const d2 = Math.sqrt(dx * dx + dy * dy);
      if (d2 < magnetRange && d2 > 0.001) {
        // Accel proportional to how close (inverse-distance) so faraway coins
        // catch a small tug; near coins snap in hard.
        const proximity = 1 - d2 / magnetRange; // 0..1
        const accel = magnetStrength * (8 + proximity * 14);
        c.vx += (dx / d2) * accel * step;
        c.vy += (dy / d2) * accel * step;
      }
    }
    // Damp transverse velocity so coins don't overshoot wildly
    const damp = Math.pow(0.0002, step);
    c.vx *= damp;
    c.vy *= damp;
    c.x += c.vx * step;
    c.y += c.vy * step;

    // Collect whenever the coin is close in 3D — generous, gameplay feel
    const pdx = g.shipX - c.x;
    const pdy = g.shipY - c.y;
    const pdz = g.shipZ - c.z;
    const d3 = Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz);
    const pickupR = 0.7;
    if (d3 < pickupR) {
      const val = Math.round(c.value * g.coinBoostMul);
      g.coinsThisRun += val;
      spawnScorePopup(g, c.x, c.y, c.z, val);
      sounds.play("chime");
      // Sparkle burst — a warm amber flash + a few offset flecks for sparkle feel
      spawnExplosion(g, c.x, c.y, c.z, "#fde047", 360, 0.22);
      spawnExplosion(g, c.x + 0.18, c.y + 0.12, c.z, "#fbbf24", 240, 0.1);
      spawnExplosion(g, c.x - 0.15, c.y - 0.1, c.z, "#facc15", 260, 0.1);
      g.coins.splice(i, 1);
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
          // Revive consumable: first fatal hit this run clears nearby threats
          // and grants a brief invulnerability window instead of dying.
          if (g.reviveAvailable && !g.reviveUsed) {
            g.reviveAvailable = false;
            g.reviveUsed = true;
            g.invulnUntil = now + 2500;
            spawnExplosion(g, g.shipX, g.shipY, g.shipZ, "#22d3ee", 900, 0.9);
            sounds.play("shieldOn");
            for (let k = g.obstacles.length - 1; k >= 0; k--) {
              const other = g.obstacles[k];
              const d2 =
                (other.x - g.shipX) ** 2 + (other.y - g.shipY) ** 2 + (other.z - g.shipZ) ** 2;
              if (d2 < 9 && other.variant !== "wall") g.obstacles.splice(k, 1);
            }
            break;
          }
          g.damageTakenThisRun += 1;
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
