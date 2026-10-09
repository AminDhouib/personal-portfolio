import type { TowerId } from "./towers";

/**
 * A serializable pointer to a level. Level configs hold classes, so they are never posted or
 * stored: whoever needs one rebuilds it from the ref.
 */
export type LevelRef =
  { kind: "tower"; tower: TowerId; level: number; epic: boolean } | { kind: "daily"; day: string }; // resolved by daily.ts (T7-5); the engine throws for it

export type TowerLevelRef = Extract<LevelRef, { kind: "tower" }>;
