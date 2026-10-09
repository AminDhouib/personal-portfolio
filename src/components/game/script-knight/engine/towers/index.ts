import type { TowerDefinition } from "../core/level-config";
import { NARROW_PATH } from "./narrow-path";
import { POWDER_KEEP } from "./powder-keep";

export const TOWER_IDS = ["narrow-path", "powder-keep"] as const;

export type TowerId = (typeof TOWER_IDS)[number];

export const TOWERS: Record<TowerId, TowerDefinition> = {
  "narrow-path": NARROW_PATH,
  "powder-keep": POWDER_KEEP,
};

export function isTowerId(value: unknown): value is TowerId {
  return typeof value === "string" && (TOWER_IDS as readonly string[]).includes(value);
}
