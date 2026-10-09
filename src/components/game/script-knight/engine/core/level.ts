// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/{Level,loadLevel,getLevel}.ts. Copyright (c) 2015-present Matias Olivera. MIT
// licence: see ../LICENSE. Modified by Amin Dhouib, 2026: no player code, one Logger per Level.

import type { AbilityEntry, AbilitySpec } from "./ability";
import type { EffectEntry } from "./effect";
import { Floor, type FloorSpace } from "./floor";
import { Logger, type TurnEvent } from "./logger";
import type { Space } from "./space";
import type { LevelConfig, UnitConfig } from "./level-config";
import type { Unit } from "./unit";
import { Warrior } from "./warrior";

export const MAX_TURNS = 200;

export class Level {
  number: number;
  description: string;
  tip: string;
  clue: string;
  floor: Floor;
  logger: Logger;

  constructor(number: number, description: string, tip: string, clue: string, floor: Floor) {
    this.number = number;
    this.description = description;
    this.tip = tip;
    this.clue = clue;
    this.floor = floor;
    this.logger = new Logger(floor);
    floor.logger = this.logger;
  }

  play(turns: number = MAX_TURNS): {
    passed: boolean;
    turns: TurnEvent[][];
    initialState: TurnEvent;
  } {
    for (let n = 0; n < turns; n += 1) {
      if (this.wasPassed() || this.wasFailed()) {
        break;
      }

      this.logger.turn();

      this.floor.getUnits().forEach((unit) => unit.prepareTurn());
      this.floor.getUnits().forEach((unit) => unit.performTurn());
    }

    const passed = this.wasPassed();

    return {
      passed,
      turns: this.logger.turns,
      initialState: this.logger.initialState,
    };
  }

  wasPassed(): boolean {
    const stairsSpace = this.floor.getStairsSpace();
    return stairsSpace.getUnit() === this.floor.warrior;
  }

  wasFailed(): boolean {
    return !this.floor.warrior?.isAlive();
  }

  toJSON(): {
    number: number;
    description: string;
    tip: string;
    clue: string;
    floorMap: Space[][];
    warriorStatus: { health: number; score: number } | undefined;
    warriorAbilities: AbilitySpec[];
  } {
    return {
      number: this.number,
      description: this.description,
      tip: this.tip,
      clue: this.clue,
      floorMap: this.floor.getMap(),
      warriorStatus: this.floor.warrior?.getStatus(),
      warriorAbilities: this.floor.warrior?.getAbilities() ?? [],
    };
  }
}

function loadAbilities(unit: Unit, abilities: Record<string, AbilityEntry> = {}): void {
  for (const [name, entry] of Object.entries(abilities)) {
    if (Array.isArray(entry)) {
      const [AbilityClass, config] = entry;
      unit.addAbility(name, new AbilityClass(unit, config as never));
    } else {
      const AbilityClass = entry;
      unit.addAbility(name, new AbilityClass(unit));
    }
  }
}

function loadEffects(unit: Unit, effects: Record<string, EffectEntry> = {}): void {
  for (const [name, entry] of Object.entries(effects)) {
    if (Array.isArray(entry)) {
      const [EffectClass, config] = entry;
      unit.addEffect(name, new EffectClass(unit, config as never));
    } else {
      const EffectClass = entry;
      unit.addEffect(name, new EffectClass(unit));
    }
  }
}

function loadWarrior(warrior: LevelConfig["floor"]["warrior"], floor: Floor): void {
  const { name, maxHealth, abilities, position } = warrior;
  const unit = new Warrior(name, maxHealth);
  loadAbilities(unit, abilities);
  floor.addWarrior(unit, position);
}

function loadUnit({ unit: UnitClass, effects, position }: UnitConfig, floor: Floor): void {
  const unit = new UnitClass();
  if (UnitClass.declaredAbilities) {
    loadAbilities(unit, UnitClass.declaredAbilities);
  }
  if (effects) {
    loadEffects(unit, effects);
  }
  floor.addUnit(unit, position);
}

/** Builds the floor from a level config: the warrior first, then the units in level order. */
export function loadLevel({
  number,
  description,
  tip,
  clue,
  floor: { size, stairs, warrior, units = [] },
}: LevelConfig): Level {
  const { width, height } = size;
  const floor = new Floor(width, height, [stairs.x, stairs.y]);

  loadWarrior(warrior, floor);
  for (const entry of units) {
    loadUnit(entry, floor);
  }

  return new Level(number, description, tip, clue, floor);
}

/** A plain-data description of a level: its text, starting map, status and granted abilities. */
export function getLevel(levelConfig: LevelConfig): {
  number: number;
  description: string;
  tip: string;
  clue: string;
  floorMap: FloorSpace[][];
  warriorStatus: { health: number; score: number } | undefined;
  warriorAbilities: AbilitySpec[];
} {
  const level = loadLevel(levelConfig);
  return {
    number: level.number,
    description: level.description,
    tip: level.tip,
    clue: level.clue,
    floorMap: level.floor.getSnapshot(),
    warriorStatus: level.floor.warrior?.getStatus(),
    warriorAbilities: level.floor.warrior?.getAbilities() ?? [],
  };
}
