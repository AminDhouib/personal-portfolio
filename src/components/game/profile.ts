// src/components/game/profile.ts
//
// Persistent per-player profile stored in localStorage under a single key.
// All profile state for Orbital Dodge lives here — no other file writes to
// the profile key directly. Schema is versioned so we can migrate additively.

import { safeJsonParse } from "@/lib/safe-json";

const STORAGE_KEY = "orbital-dodge-profile";
const CURRENT_VERSION = 1;

export interface Profile {
  v: number;
  firstRunCompleted: boolean;
  totalRunsPlayed: number;
  totalCoinsEarned: number;
  walletCoins: number;
  totalAsteroidsDestroyed: number;
  totalDistance: number;
  totalBossesDefeated: number;
  ownedUpgrades: Record<string, number>;
  ownedCosmetics: string[];
  equippedShip: string;
  equippedHull: string | null;
  equippedEngine: string | null;
  equippedDeathFx: string | null;
  unlockedAchievements: string[];
  consumableInventory: Record<string, number>;
  missionsToday: { id: string; progress: number; claimed: boolean }[];
  missionsResetDate: string;
  tutorialComplete: boolean;
  preferences?: {
    reducedMotion?: boolean;
    gyroEnabled?: boolean;
    bloomEnabled?: boolean;
    musicEnabled?: boolean;
    sfxEnabled?: boolean;
  };
}

function defaultProfile(): Profile {
  return {
    v: CURRENT_VERSION,
    firstRunCompleted: false,
    totalRunsPlayed: 0,
    totalCoinsEarned: 0,
    walletCoins: 500, // starting gift so first purchases feel immediate
    totalAsteroidsDestroyed: 0,
    totalDistance: 0,
    totalBossesDefeated: 0,
    ownedUpgrades: {},
    ownedCosmetics: [],
    equippedShip: "falcon",
    equippedHull: null,
    equippedEngine: null,
    equippedDeathFx: null,
    unlockedAchievements: [],
    consumableInventory: {},
    missionsToday: [],
    missionsResetDate: "",
    tutorialComplete: false,
  };
}

export function loadProfile(): Profile {
  if (typeof window === "undefined") return defaultProfile();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    const parsed = safeJsonParse<Partial<Profile>>(raw, "profile.load");
    if (typeof parsed !== "object" || !parsed) return defaultProfile();
    return { ...defaultProfile(), ...parsed, v: CURRENT_VERSION };
  } catch {
    // silent-ok: localStorage.getItem can throw (SecurityError in sandboxed/private contexts); fall back to default
    return defaultProfile();
  }
}

export function saveProfile(p: Profile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // silent-ok: localStorage write may fail (quota exceeded/blocked); profile persistence is non-critical
  }
}

export function addCoins(n: number): Profile {
  const p = loadProfile();
  p.walletCoins += n;
  p.totalCoinsEarned += n;
  saveProfile(p);
  return p;
}

export function spendCoins(n: number): { ok: boolean; profile: Profile } {
  const p = loadProfile();
  if (p.walletCoins < n) return { ok: false, profile: p };
  p.walletCoins -= n;
  saveProfile(p);
  return { ok: true, profile: p };
}

// TODO: markTutorialComplete was removed (dead — tutorial.ts deleted). If a
// tutorial is re-added, re-implement against the profile schema.

export function markFirstRunCompleted(): Profile {
  const p = loadProfile();
  if (!p.firstRunCompleted) {
    p.firstRunCompleted = true;
    saveProfile(p);
  }
  return p;
}

export function incrementRunsPlayed(): Profile {
  const p = loadProfile();
  p.totalRunsPlayed += 1;
  saveProfile(p);
  return p;
}

export function addRunStats(stats: { asteroidsDestroyed: number; distance: number }): Profile {
  const p = loadProfile();
  p.totalAsteroidsDestroyed += stats.asteroidsDestroyed;
  p.totalDistance += stats.distance;
  saveProfile(p);
  return p;
}

export function setUpgradeLevel(upgradeId: string, level: number): Profile {
  const p = loadProfile();
  p.ownedUpgrades[upgradeId] = level;
  saveProfile(p);
  return p;
}

// TODO: getUpgradeLevel, addConsumable, consumeConsumable, getConsumableCount,
// unlockCosmetic, equipCosmetic, ownsCosmetic, unlockShip were removed (dead --
// the game reads/writes upgrades, consumables, and cosmetics via loadProfile()/
// saveProfile() directly; these wrappers were built but never integrated).
// Re-add if the shop UI starts using dedicated accessors.

// TODO: getMissions, setMissions, advanceMission, claimMission, MissionProgress
// were removed (dead -- missions.ts deleted). Re-implement if a daily-mission
// system is re-added.
