// src/components/game/shop-data.ts
//
// Upgrade catalog for the Orbital Dodge shop. Pure data. Any code that
// applies an upgrade effect calls `effectAtLevel(id, level)` — no hardcoded
// effect values outside this file.

export type UpgradeId =
  | "coin-magnet"
  | "coin-value"
  | "score-multiplier"
  | "combo-window"
  | "shield-duration";

export interface UpgradeDef {
  id: UpgradeId;
  label: string;
  description: string;
  maxLevel: number;
  costAtLevel(level: number): number;
  effectAtLevel(level: number): number;
  iconKey: "magnet" | "coins" | "trophy" | "timer" | "shield";
}

function stdCost(level: number): number {
  const table = [0, 100, 300, 800, 2000, 5000];
  return table[Math.max(0, Math.min(level, table.length - 1))];
}

export const UPGRADES: UpgradeDef[] = [
  {
    id: "coin-magnet",
    label: "Coin Magnet",
    description: "Coin pickup radius increases so fewer coins fly past.",
    maxLevel: 5,
    costAtLevel: stdCost,
    effectAtLevel: (lvl) => 1 + lvl * 0.4,
    iconKey: "magnet",
  },
  {
    id: "coin-value",
    label: "Coin Value",
    description: "Every coin is worth more points toward your wallet.",
    maxLevel: 5,
    costAtLevel: stdCost,
    effectAtLevel: (lvl) => 1 + lvl,
    iconKey: "coins",
  },
  {
    id: "score-multiplier",
    label: "Score Boost",
    description: "All score earned is multiplied at run's end.",
    maxLevel: 5,
    costAtLevel: stdCost,
    effectAtLevel: (lvl) => 1 + lvl * 0.2,
    iconKey: "trophy",
  },
  {
    id: "combo-window",
    label: "Combo Sustain",
    description: "Combo multiplier holds longer between kills.",
    maxLevel: 5,
    costAtLevel: stdCost,
    effectAtLevel: (lvl) => 4 + lvl,
    iconKey: "timer",
  },
  {
    id: "shield-duration",
    label: "Shield Duration",
    description: "Shield power-up lasts longer after pickup.",
    maxLevel: 5,
    costAtLevel: stdCost,
    effectAtLevel: (lvl) => 8000 + lvl * 1100,
    iconKey: "shield",
  },
];

export function upgradeById(id: UpgradeId): UpgradeDef | undefined {
  return UPGRADES.find((u) => u.id === id);
}

// ---------- Consumables ----------

export type ConsumableId =
  | "head-start-500"
  | "head-start-1000"
  | "head-start-2000"
  | "coin-boost-2x"
  | "revive"
  | "lucky-start";

export interface ConsumableDef {
  id: ConsumableId;
  label: string;
  description: string;
  cost: number;
  icon: "rocket" | "coins" | "heart" | "sparkles";
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: "head-start-500", label: "Head Start (500m)", description: "Begin the next run 500m in with baseline difficulty.", cost: 100, icon: "rocket" },
  { id: "head-start-1000", label: "Head Start (1km)", description: "Begin the next run 1000m in.", cost: 300, icon: "rocket" },
  { id: "head-start-2000", label: "Long Warp (2km)", description: "Skip the easy early game entirely.", cost: 800, icon: "rocket" },
  { id: "coin-boost-2x", label: "2x Coin Boost", description: "Next run: every coin dropped is doubled.", cost: 200, icon: "coins" },
  { id: "revive", label: "Revive", description: "Auto-resurrect after your first death this run.", cost: 500, icon: "heart" },
  { id: "lucky-start", label: "Lucky Start", description: "Begin with a random power-up already active.", cost: 300, icon: "sparkles" },
];

export function consumableById(id: ConsumableId): ConsumableDef | undefined {
  return CONSUMABLES.find((c) => c.id === id);
}

// ---------- Ships ----------

export type ShipId = "falcon" | "juggernaut" | "phantom" | "scavenger" | "void";

export interface ShipDef {
  id: ShipId;
  label: string;
  description: string;
  unlockCost: number;
  startShieldCharges: number;
  fireRateMul: number;
  damageMul: number;
  moveAgilityMul: number;
  coinMagnetMul: number;
  hullTint: string;
}

export const SHIPS: ShipDef[] = [
  { id: "falcon", label: "Falcon", description: "Balanced default. No tradeoffs, no bonuses.", unlockCost: 0,
    startShieldCharges: 0, fireRateMul: 1, damageMul: 1, moveAgilityMul: 1, coinMagnetMul: 1, hullTint: "#60a5fa" },
  { id: "juggernaut", label: "Juggernaut", description: "+1 starting shield, -20% fire rate, +50% damage.", unlockCost: 5000,
    startShieldCharges: 1, fireRateMul: 0.8, damageMul: 1.5, moveAgilityMul: 1, coinMagnetMul: 1, hullTint: "#dc2626" },
  { id: "phantom", label: "Phantom", description: "+40% agility, -20% damage.", unlockCost: 8000,
    startShieldCharges: 0, fireRateMul: 1, damageMul: 0.8, moveAgilityMul: 1.4, coinMagnetMul: 1, hullTint: "#a78bfa" },
  { id: "scavenger", label: "Scavenger", description: "+100% coin magnet, -20% power-up duration.", unlockCost: 12000,
    startShieldCharges: 0, fireRateMul: 1, damageMul: 1, moveAgilityMul: 1, coinMagnetMul: 2, hullTint: "#22c55e" },
  { id: "void", label: "Void Prototype", description: "Experimental — +20% to every upgrade effect.", unlockCost: 20000,
    startShieldCharges: 0, fireRateMul: 1.1, damageMul: 1.2, moveAgilityMul: 1.2, coinMagnetMul: 1.2, hullTint: "#0f172a" },
];

export function shipById(id: string): ShipDef | undefined {
  return SHIPS.find((s) => s.id === id);
}

// ---------- Cosmetics ----------

export type CosmeticSlot = "hull" | "engine" | "deathFx";

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  label: string;
  cost: number;
  value: string;
  unlockCondition?: "always" | { stat: "totalAsteroidsDestroyed" | "totalDistance" | "totalRunsPlayed"; atLeast: number };
}

export const COSMETICS: CosmeticDef[] = [
  { id: "hull-crimson", slot: "hull", label: "Crimson", cost: 150, value: "#dc2626" },
  { id: "hull-emerald", slot: "hull", label: "Emerald", cost: 150, value: "#10b981" },
  { id: "hull-nebula", slot: "hull", label: "Nebula Purple", cost: 250, value: "#9333ea" },
  { id: "hull-gold", slot: "hull", label: "Gold-trim", cost: 500, value: "#f59e0b", unlockCondition: { stat: "totalAsteroidsDestroyed", atLeast: 500 } },
  { id: "hull-phantom-black", slot: "hull", label: "Void Black", cost: 1000, value: "#0a0a0a", unlockCondition: { stat: "totalDistance", atLeast: 10000 } },
  { id: "engine-cyan", slot: "engine", label: "Cyan Thrust", cost: 50, value: "#06b6d4" },
  { id: "engine-orange", slot: "engine", label: "Orange Burn", cost: 80, value: "#ea580c" },
  { id: "engine-pink", slot: "engine", label: "Pink Plasma", cost: 120, value: "#ec4899" },
  { id: "engine-green", slot: "engine", label: "Green Cell", cost: 150, value: "#22c55e" },
  { id: "engine-white", slot: "engine", label: "White Core", cost: 300, value: "#ffffff", unlockCondition: { stat: "totalRunsPlayed", atLeast: 10 } },
  { id: "death-spiral", slot: "deathFx", label: "Spiral Out", cost: 300, value: "spiral" },
  { id: "death-shatter", slot: "deathFx", label: "Shatter", cost: 400, value: "shatter" },
  { id: "death-disintegrate", slot: "deathFx", label: "Disintegrate", cost: 500, value: "disintegrate" },
];

export function cosmeticById(id: string): CosmeticDef | undefined {
  return COSMETICS.find((c) => c.id === id);
}
