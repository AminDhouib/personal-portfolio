// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/Warrior.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and quoting only.

import { Action, type AbilitySpec } from "./ability";
import { Unit } from "./unit";

export class Warrior extends Unit {
  override readonly name: string;
  override readonly maxHealth: number;
  override readonly enemy = false;

  constructor(name: string, maxHealth: number) {
    super();
    this.name = name;
    this.maxHealth = maxHealth;
  }

  override isWarrior(): boolean {
    return true;
  }

  override performTurn(): void {
    super.performTurn();
    if (!this.turn?.action || this.isBound()) {
      this.emit({ type: "idle", description: "does nothing", params: {} });
    }
  }

  override earnPoints(points: number): void {
    super.earnPoints(points);
    this.emit({
      type: "earnPoints",
      description: "earns {points} points",
      params: { points },
    });
  }

  override losePoints(points: number): void {
    super.losePoints(points);
    this.emit({
      type: "losePoints",
      description: "loses {points} points",
      params: { points },
    });
  }

  getAbilities(): AbilitySpec[] {
    return [...this.abilities]
      .map(([name, ability]) => ({
        name,
        description: ability.description,
        meta: ability.meta,
        isAction: ability instanceof Action,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  getStatus(): { health: number; score: number } {
    return {
      health: this.health,
      score: this.score,
    };
  }
}
