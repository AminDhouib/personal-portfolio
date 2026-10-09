// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/getLevel.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { expect, test } from "vitest";
import { EAST, RELATIVE_DIRECTIONS, WEST } from "../spatial";
import {
  type AbilityBinding,
  type AbilityMeta,
  type AbilityUnit,
  Action,
  Sense,
} from "../core/ability";
import { type FloorSpace } from "../core/floor";
import { getLevel } from "../core/level";
import { type LevelConfig } from "../core/level-config";
import { type Turn, Unit } from "../core/unit";

class TestWalk extends Action {
  readonly description = "Moves one space in the given direction (`'forward'` by default).";
  readonly meta: AbilityMeta = {
    params: [{ name: "direction", type: "Direction", optional: true }],
    returns: "void",
  };
  perform() {}
}

class TestAttack extends Action {
  readonly description: string;
  readonly meta: AbilityMeta = {
    params: [{ name: "direction", type: "Direction", optional: true }],
    returns: "void",
  };
  constructor(unit: AbilityUnit, { power }: { power: number }) {
    super(unit);
    this.description = `Attacks a unit in the given direction (\`'forward'\` by default), dealing ${power} HP of damage.`;
  }
  perform() {}
  static with(config: { power: number }): AbilityBinding {
    return [TestAttack, config];
  }
}

class TestFeel extends Sense {
  readonly description =
    "Returns the adjacent space in the given direction (`'forward'` by default).";
  readonly meta: AbilityMeta = {
    params: [{ name: "direction", type: "Direction", optional: true }],
    returns: "Space",
  };
  perform() {}
}

class TestSludge extends Unit {
  static override declaredAbilities = {
    attack: TestAttack.with({ power: 3 }),
    feel: TestFeel,
  };

  override readonly name = "Sludge";
  override readonly maxHealth = 12;

  override playTurn = (turn: Turn): void => {
    const playerDirection = RELATIVE_DIRECTIONS.find((direction) => {
      const space = turn.feel(direction);
      return space.getUnit()?.isEnemy();
    });
    if (playerDirection) {
      turn.attack(playerDirection);
    }
  };
}

const levelConfig = {
  number: 2,
  description: "It's too dark to see anything, but you smell sludge nearby.",
  tip: "Use `warrior.feel().isEmpty()` to see if there's anything in front of you, and `warrior.attack()` to fight it. Remember, you can only do one action per turn.",
  clue: "Add an if/else condition using `warrior.feel().isEmpty()` to decide whether to attack or walk.",
  floor: {
    size: { width: 8, height: 1 },
    stairs: { x: 7, y: 0 },
    warrior: {
      name: "Aldric",
      maxHealth: 20,
      abilities: {
        walk: TestWalk,
        attack: TestAttack.with({ power: 5 }),
        feel: TestFeel,
      },
      position: { x: 0, y: 0, facing: EAST },
    },
    units: [
      {
        unit: TestSludge,
        position: { x: 4, y: 0, facing: WEST },
      },
    ],
  },
  timeBonus: 15,
  aceScore: 30,
} satisfies LevelConfig;

test("returns level", () => {
  const e: FloorSpace = {};
  const s: FloorSpace = { stairs: true };
  const w: FloorSpace = { wall: true };
  const warrior: FloorSpace = { unit: { id: 0, name: "Aldric", maxHealth: 20, warrior: true } };
  const sludge: FloorSpace = { unit: { id: 1, name: "Sludge", maxHealth: 12 } };

  expect(getLevel(levelConfig)).toEqual({
    number: 2,
    description: "It's too dark to see anything, but you smell sludge nearby.",
    tip: "Use `warrior.feel().isEmpty()` to see if there's anything in front of you, and `warrior.attack()` to fight it. Remember, you can only do one action per turn.",
    clue: "Add an if/else condition using `warrior.feel().isEmpty()` to decide whether to attack or walk.",
    floorMap: [
      [w, w, w, w, w, w, w, w, w, w],
      [w, warrior, e, e, e, sludge, e, e, s, w],
      [w, w, w, w, w, w, w, w, w, w],
    ],
    warriorStatus: { health: 20, score: 0 },
    warriorAbilities: [
      {
        name: "attack",
        description:
          "Attacks a unit in the given direction (`'forward'` by default), dealing 5 HP of damage.",
        meta: {
          params: [{ name: "direction", type: "Direction", optional: true }],
          returns: "void",
        },
        isAction: true,
      },
      {
        name: "feel",
        description: "Returns the adjacent space in the given direction (`'forward'` by default).",
        meta: {
          params: [{ name: "direction", type: "Direction", optional: true }],
          returns: "Space",
        },
        isAction: false,
      },
      {
        name: "walk",
        description: "Moves one space in the given direction (`'forward'` by default).",
        meta: {
          params: [{ name: "direction", type: "Direction", optional: true }],
          returns: "void",
        },
        isAction: true,
      },
    ],
  });
});
