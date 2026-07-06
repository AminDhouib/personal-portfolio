import * as THREE from "three";
import type { GameRefs, Environment, PowerUpType } from "./types";
import { ENVIRONMENTS, POWERUP_DURATION_MS, START_INVULN_MS } from "./types";
import { buildBossSchedule } from "./boss-behaviors";
import { sounds } from "./sound-manager";
import { loadProfile, saveProfile } from "../profile";
import { upgradeById, shipById, SHIPS, cosmeticById } from "../shop-data";

// Random distance until next biome change -- keeps transitions unpredictable.
export function pickNextBiomeDistance(currentDist: number): number {
  return currentDist + 700 + Math.random() * 900; // 700-1600m further
}

// Walls trigger every 25-40s of real time. Randomized so the player can't
// memorize the cadence.
export function nextWallTimeMs(now: number): number {
  return now + 25_000 + Math.random() * 15_000;
}

export function pickRandomBiome(exclude: Environment | null): Environment {
  if (!exclude) return ENVIRONMENTS[Math.floor(Math.random() * ENVIRONMENTS.length)];
  const others = ENVIRONMENTS.filter((e) => e !== exclude);
  return others[Math.floor(Math.random() * others.length)];
}

export function createRefs(): GameRefs {
  // Status starts as "armed" -- the run begins on the player's first input.
  const initEnv = ENVIRONMENTS[0];
  return {
    status: "armed",
    now: 0,
    score: 0,
    kills: 0,
    distance: 0,
    combo: 1,
    comboLastAt: 0,
    comboPeak: 1,
    obstacles: [],
    bullets: [],
    explosions: [],
    speedLines: [],
    powerUps: [],
    coins: [],
    coinsThisRun: 0,
    coinMagnetExtra: 0,
    coinValueBonus: 0,
    scoreMultiplier: 1,
    comboWindowMs: 0,
    shieldDurationMs: 0,
    shipFireRateMul: 1,
    shipDamageMul: 1,
    shipAgilityMul: 1,
    shipCoinMagnetMul: 1,
    shipHullTint: "#60a5fa",
    shipEngineTint: "#22d3ee",
    shipDeathFxKind: null,
    shipId: "falcon",
    startShieldCharges: 0,
    coinBoostMul: 1,
    reviveAvailable: false,
    reviveUsed: false,
    prefs: {
      reducedMotion: false,
      gyroEnabled: false,
      bloomEnabled: true,
      musicEnabled: true,
      sfxEnabled: true,
    },
    gyroTilt: { x: 0, y: 0 },
    boss: null,
    bossProjectiles: [],
    bossSchedule: buildBossSchedule(),
    bossScheduleIdx: 0,
    bossesDefeatedThisRun: 0,
    damageTakenThisRun: 0,
    dash: {
      lastLeftTapAt: 0,
      lastRightTapAt: 0,
      activeUntil: 0,
      direction: null,
      cooldownUntil: 0,
      startedAt: 0,
      startX: 0,
      targetX: 0,
    },
    dashAfterimages: [],
    lastAfterimageAt: 0,
    normalSpawningPausedUntil: 0,
    devHotkeyArmed: false,
    nextBossProjectileId: 0,
    lastBossPulseAt: 0,
    activePowerUps: [],
    debris: [],
    scorePopups: [],
    targetX: 0,
    targetY: 0,
    shipX: 0,
    shipY: 0,
    shipZ: 2,
    shipRotZ: 0,
    fogColor: new THREE.Color(initEnv.fog),
    ambientColor: new THREE.Color(initEnv.ambient),
    asteroidColor: new THREE.Color(initEnv.asteroidColor),
    asteroidEmissive: new THREE.Color(initEnv.asteroidEmissive),
    starColor: new THREE.Color(initEnv.starColor),
    shieldActiveLast: false,
    warpActiveLast: false,
    isMobile:
      typeof window !== "undefined" &&
      (matchMedia("(pointer: coarse)").matches || window.innerWidth < 640),
    warpIntensity: 0,
    invertedArmed: false,
    currentEnv: initEnv,
    nextBiomeAt: pickNextBiomeDistance(0),
    nextWallAt: 0, // set by startRun
    lastBullet: 0,
    lastSpawn: 0,
    lastPowerUpSpawn: 0,
    lastUiSync: 0,
    nextId: 1,
    startedAt: 0,
    invulnUntil: 0,
    dyingAt: 0,
    shipFallSpeed: 0,
    deathVelX: 0,
    deathVelY: 0,
    deathVelZ: 0,
    deathAngVel: 0,
    cameraTargetX: 0,
    cameraTargetY: 0,
    cameraTargetZ: 5,
  };
}

// Called when the player's first input is detected. Idempotent -- only
// transitions `armed` -> `playing`.
export function startRun(g: GameRefs): boolean {
  if (g.status !== "armed") return false;
  const now = performance.now();
  g.status = "playing";
  g.startedAt = now;
  g.invulnUntil = now + START_INVULN_MS;
  g.lastSpawn = now;
  g.lastPowerUpSpawn = now;
  g.lastUiSync = 0;
  // First wall at least 20s into the run -- the player needs warm-up time
  // before facing a forced-positioning challenge.
  g.nextWallAt = now + 20_000;

  // Apply purchased upgrades as per-run modifiers. All lookups happen here --
  // per-frame logic reads these fields, never the profile/catalog directly.
  const profile = loadProfile();
  const getLevel = (id: string) => profile.ownedUpgrades[id] ?? 0;
  const magnetDef = upgradeById("coin-magnet");
  const valueDef = upgradeById("coin-value");
  const scoreDef = upgradeById("score-multiplier");
  const comboDef = upgradeById("combo-window");
  const shieldDef = upgradeById("shield-duration");
  // coin-magnet: base 1.0 at level 0 -> 3.0 at level 5, add the delta to base 0
  g.coinMagnetExtra = magnetDef ? magnetDef.effectAtLevel(getLevel("coin-magnet")) - 1 : 0;
  // coin-value: base 1 -> up to 6, so delta goes above baseline coin.value
  g.coinValueBonus = valueDef ? valueDef.effectAtLevel(getLevel("coin-value")) - 1 : 0;
  g.scoreMultiplier = scoreDef ? scoreDef.effectAtLevel(getLevel("score-multiplier")) : 1;
  g.comboWindowMs = comboDef ? comboDef.effectAtLevel(getLevel("combo-window")) * 1000 : 0;
  g.shieldDurationMs = shieldDef ? shieldDef.effectAtLevel(getLevel("shield-duration")) : 0;

  // Equipped ship stats
  const ship = shipById(profile.equippedShip) ?? SHIPS[0];
  g.shipId = ship.id;
  g.shipFireRateMul = ship.fireRateMul;
  g.shipDamageMul = ship.damageMul;
  g.shipAgilityMul = ship.moveAgilityMul;
  g.shipCoinMagnetMul = ship.coinMagnetMul;
  // Cosmetic hull (if equipped) overrides the ship's built-in tint
  const hullCosmetic = profile.equippedHull ? cosmeticById(profile.equippedHull) : undefined;
  g.shipHullTint =
    hullCosmetic && hullCosmetic.slot === "hull" ? hullCosmetic.value : ship.hullTint;
  // Engine trail / thruster tint -- cosmetic override falls back to cyan default
  const engineCosmetic = profile.equippedEngine ? cosmeticById(profile.equippedEngine) : undefined;
  g.shipEngineTint =
    engineCosmetic && engineCosmetic.slot === "engine" ? engineCosmetic.value : "#22d3ee";
  // Death FX variant (spiral / shatter / disintegrate) -- consumed in onDeath
  const deathCosmetic = profile.equippedDeathFx ? cosmeticById(profile.equippedDeathFx) : undefined;
  g.shipDeathFxKind =
    deathCosmetic && deathCosmetic.slot === "deathFx" ? deathCosmetic.value : null;
  g.startShieldCharges = ship.startShieldCharges;
  if (g.startShieldCharges > 0) {
    const effShieldMs = g.shieldDurationMs > 0 ? g.shieldDurationMs : POWERUP_DURATION_MS;
    g.activePowerUps.push({ type: "shield", expiresAt: now + effShieldMs * g.startShieldCharges });
  }

  // Consume queued pre-run consumables (each one is one-shot)
  g.coinBoostMul = 1;
  g.reviveAvailable = false;
  g.reviveUsed = false;
  try {
    const inv = profile.consumableInventory;
    if ((inv["coin-boost-2x"] ?? 0) > 0) {
      g.coinBoostMul = 2;
      const p2 = loadProfile();
      p2.consumableInventory["coin-boost-2x"] = (p2.consumableInventory["coin-boost-2x"] ?? 0) - 1;
      saveProfile(p2);
    }
    if ((inv["revive"] ?? 0) > 0) {
      g.reviveAvailable = true;
      const p2 = loadProfile();
      p2.consumableInventory["revive"] = (p2.consumableInventory["revive"] ?? 0) - 1;
      saveProfile(p2);
    }
    if ((inv["head-start-2000"] ?? 0) > 0) {
      g.distance = 2000;
      const p2 = loadProfile();
      p2.consumableInventory["head-start-2000"] =
        (p2.consumableInventory["head-start-2000"] ?? 0) - 1;
      saveProfile(p2);
    } else if ((inv["head-start-1000"] ?? 0) > 0) {
      g.distance = 1000;
      const p2 = loadProfile();
      p2.consumableInventory["head-start-1000"] =
        (p2.consumableInventory["head-start-1000"] ?? 0) - 1;
      saveProfile(p2);
    } else if ((inv["head-start-500"] ?? 0) > 0) {
      g.distance = 500;
      const p2 = loadProfile();
      p2.consumableInventory["head-start-500"] =
        (p2.consumableInventory["head-start-500"] ?? 0) - 1;
      saveProfile(p2);
    }
    if ((inv["lucky-start"] ?? 0) > 0) {
      const p2 = loadProfile();
      p2.consumableInventory["lucky-start"] = (p2.consumableInventory["lucky-start"] ?? 0) - 1;
      saveProfile(p2);
      const luckyTypes: PowerUpType[] = ["shield", "triple", "rapid", "mega", "warp"];
      const pick = luckyTypes[Math.floor(Math.random() * luckyTypes.length)];
      g.activePowerUps.push({ type: pick, expiresAt: now + POWERUP_DURATION_MS });
    }
  } catch {
    /* noop */
  }

  sounds.startGameplayMusic();
  return true;
}
