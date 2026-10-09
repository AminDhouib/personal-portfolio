// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/Effect.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: the owning unit is typed, not any.

import type { GameAction } from "./logger";

/** What an effect may ask of the unit it is attached to. The core `Unit` class satisfies it. */
export interface EffectUnit {
  health: number;
  emit(action: GameAction): void;
  getOtherUnits(): EffectUnit[];
  takeDamage(amount: number): void;
}

/** An effect that needs configuring: it is bound to its config in a unit definition. */
export type ConfiguredEffectClass = new (unit: EffectUnit, config: never) => Effect;

/** An effect with nothing to configure. */
export type EffectClass = new (unit: EffectUnit) => Effect;

export type EffectBinding = [ConfiguredEffectClass, object];

export type EffectEntry = EffectBinding | EffectClass;

export abstract class Effect {
  protected unit: EffectUnit;

  abstract readonly description: string;

  constructor(unit: EffectUnit, _config?: object) {
    this.unit = unit;
  }

  abstract passTurn(): void;
  abstract trigger(): void;
}
