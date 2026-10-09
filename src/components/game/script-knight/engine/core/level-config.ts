// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/{getLevelConfig,types}.ts. Copyright (c) 2015-present Matias Olivera. MIT licence:
// see ../LICENSE. Modified by Amin Dhouib, 2026: merged; the ability merge is a typed loop.

import type { AbsoluteDirection } from "../spatial";
import type { AbilityEntry } from "./ability";
import type { EffectEntry } from "./effect";
import type { UnitClass } from "./unit";

export type Size = { width: number; height: number };

export type LocationConfig = { x: number; y: number };

export type PositionConfig = LocationConfig & { facing: AbsoluteDirection };

export interface UnitConfig {
  unit: UnitClass;
  position: PositionConfig;
  effects?: Record<string, EffectEntry>;
}

export interface WarriorConfig {
  name?: string;
  maxHealth: number;
  position: PositionConfig;
  abilities?: Record<string, AbilityEntry>;
}

export interface LevelConfig {
  number: number;
  description: string;
  tip: string;
  clue: string;
  timeBonus: number;
  aceScore: number;
  floor: {
    size: Size;
    stairs: LocationConfig;
    warrior: WarriorConfig & { name: string };
    units?: UnitConfig[];
  };
}

export interface WarriorDefinition {
  maxHealth: number;
}

export interface WarriorOverrides {
  position: PositionConfig;
  abilities?: Record<string, AbilityEntry>;
  maxHealth?: number;
}

export interface LevelDefinition {
  description: string;
  tip: string;
  clue?: string;
  timeBonus: number;
  aceScore: number;
  floor: {
    size: Size;
    stairs: LocationConfig;
    warrior: WarriorOverrides;
    units: UnitConfig[];
  };
}

export interface TowerDefinition {
  name: string;
  description: string;
  warrior: WarriorDefinition;
  levels: LevelDefinition[];
}

/**
 * Deep clones a value, passing through functions and class constructors
 * as-is since they are not structurally cloneable.
 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Object.getPrototypeOf(value) !== Object.prototype) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => deepClone(item)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = typeof val === "function" ? val : deepClone(val);
  }
  return result as T;
}

/**
 * Returns the config for the level with the given number.
 *
 * @param tower The tower.
 * @param levelNumber The number of the level.
 * @param warriorName The name of the warrior.
 * @param epic Whether the level is to be used in epic mode or not.
 *
 * @returns The level config.
 */
export function getLevelConfig(
  tower: TowerDefinition,
  levelNumber: number,
  warriorName: string,
  epic: boolean,
): LevelConfig | null {
  const level = tower.levels[levelNumber - 1];
  if (!level) {
    return null;
  }

  const levels = epic ? tower.levels : tower.levels.slice(0, levelNumber);
  const warriorAbilities: Record<string, AbilityEntry> = {};
  for (const {
    floor: {
      warrior: { abilities },
    },
  } of levels) {
    Object.assign(warriorAbilities, abilities ?? {});
  }

  return {
    number: levelNumber,
    description: level.description,
    tip: level.tip,
    clue: level.clue ?? "",
    timeBonus: level.timeBonus,
    aceScore: level.aceScore,
    floor: {
      size: deepClone(level.floor.size),
      stairs: deepClone(level.floor.stairs),
      warrior: {
        ...deepClone(tower.warrior),
        ...deepClone(level.floor.warrior),
        name: warriorName,
        abilities: warriorAbilities,
      },
      units: level.floor.units ? deepClone(level.floor.units) : undefined,
    },
  };
}
