// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/units/src/*.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ./LICENSE.
// Modified by Amin Dhouib, 2026: merged; the enemy scans are typed, not any.

import { Attack, Feel, Look, Shoot } from "./abilities";
import { type Turn, Unit } from "./core/unit";
import { RELATIVE_DIRECTIONS } from "./spatial";

export abstract class MeleeUnit extends Unit {
  override playTurn(turn: Turn): void {
    const threatDirection = RELATIVE_DIRECTIONS.find((direction) => {
      const unit = turn.feel(direction).getUnit();
      return unit?.isEnemy() && !unit.isBound();
    });
    if (threatDirection) {
      turn.attack(threatDirection);
    }
  }
}

export abstract class RangedUnit extends Unit {
  override playTurn(turn: Turn): void {
    const threatDirection = RELATIVE_DIRECTIONS.find((direction) => {
      const spaceWithUnit = turn.look(direction).find((space) => space.isUnit());
      const unit = spaceWithUnit?.getUnit();
      return unit?.isEnemy() && !unit.isBound();
    });
    if (threatDirection) {
      turn.shoot(threatDirection);
    }
  }
}

export class Archer extends RangedUnit {
  static override declaredAbilities = {
    look: Look.with({ range: 3 }),
    shoot: Shoot.with({ range: 3, power: 3 }),
  };

  override readonly name = "Archer";
  override readonly maxHealth = 7;
}

export class Captive extends Unit {
  override readonly name = "Captive";
  override readonly maxHealth = 1;
  override readonly enemy = false;
  override bound = true;

  override get reward(): number {
    return 20;
  }
}

export class Sludge extends MeleeUnit {
  static override declaredAbilities = {
    attack: Attack.with({ power: 3 }),
    feel: Feel,
  };

  override readonly name = "Sludge";
  override readonly maxHealth = 12;
}

export class ThickSludge extends MeleeUnit {
  static override declaredAbilities = {
    attack: Attack.with({ power: 3 }),
    feel: Feel,
  };

  override readonly name = "Thick Sludge";
  override readonly maxHealth = 24;
}

export class Wizard extends RangedUnit {
  static override declaredAbilities = {
    look: Look.with({ range: 3 }),
    shoot: Shoot.with({ range: 3, power: 11 }),
  };

  override readonly name = "Wizard";
  override readonly maxHealth = 3;
}
