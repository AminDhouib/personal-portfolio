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
