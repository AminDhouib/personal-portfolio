// src/components/game/profile.ts
//
// Persistent per-player profile stored in localStorage under a single key.
// All profile state for Orbital Dodge lives here — no other file writes to
// the profile key directly. Schema is versioned so we can migrate additively.

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
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || !parsed) return defaultProfile();
    return { ...defaultProfile(), ...parsed, v: CURRENT_VERSION };
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(p: Profile): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Storage may be full or blocked; fail silently.
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

export function addRunStats(stats: {
  asteroidsDestroyed: number;
  distance: number;
}): Profile {
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

export function getUpgradeLevel(upgradeId: string): number {
  return loadProfile().ownedUpgrades[upgradeId] ?? 0;
}
