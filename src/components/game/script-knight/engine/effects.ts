// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/effects/src/Ticking.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ./LICENSE.
// Modified by Amin Dhouib, 2026: the owning unit is typed, not any.

import { Effect, type EffectBinding, type EffectUnit } from "./core/effect";

interface TickingConfig {
  time: number;
}

export class Ticking extends Effect {
  readonly description = "Kills you and all surrounding units when time reaches zero.";

  time: number;

  constructor(unit: EffectUnit, { time }: TickingConfig) {
    super(unit);
    this.time = time;
  }

  passTurn(): void {
    if (this.time) {
      this.time -= 1;
    }

    this.unit.emit({ type: "tick", description: "is ticking", params: {} });

    if (!this.time) {
      this.trigger();
    }
  }

  trigger(): void {
    this.unit.emit({
      type: "explode",
      description: "explodes, collapsing the ceiling and killing every unit",
      params: {},
    });
    [...this.unit.getOtherUnits(), this.unit].forEach((anotherUnit) =>
      anotherUnit.takeDamage(anotherUnit.health),
    );
  }

  static with(config: TickingConfig): EffectBinding {
    return [Ticking, config];
  }
}
