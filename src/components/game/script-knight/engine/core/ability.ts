// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/{Ability,Action,Sense}.ts. Copyright (c) 2015-present Matias Olivera. MIT licence:
// see ../LICENSE. Modified by Amin Dhouib, 2026: three modules merged; units are typed, not any.

import type { AbsoluteDirection, Location, RelativeDirection } from "../spatial";
import type { GameAction } from "./logger";
import type { SensedSpace } from "./space";

export interface AbilityParam {
  name: string;
  type: "Direction" | "Space" | "number" | "any";
  optional?: boolean;
  rest?: boolean;
}

export interface AbilityMeta {
  params: AbilityParam[];
  returns: "void" | "number" | "string" | "Direction" | "Space" | "Space[]";
}

export interface AbilitySpec {
  name: string;
  description: string;
  meta: AbilityMeta;
  isAction: boolean;
}

/** What an ability may ask of the unit that owns it. The core `Unit` class satisfies it. */
export interface AbilityUnit {
  name: string;
  health: number;
  maxHealth: number;
  position: { location: Location; orientation: AbsoluteDirection } | null;
  getSpaceAt(direction: RelativeDirection, forward?: number, right?: number): AbilitySpace;
  getSensedSpaceAt(direction: RelativeDirection, forward?: number, right?: number): SensedSpace;
  getDirectionOf(space: SensedSpace): RelativeDirection;
  getDirectionOfStairs(): RelativeDirection;
  getDistanceOf(space: SensedSpace): number;
  getOtherUnits(): Array<{ getSpace(): { location: Location } }>;
  getSpace(): { location: Location };
  move(direction: RelativeDirection): void;
  rotate(direction: RelativeDirection): void;
  damage(receiver: AbilityUnit, amount: number): void;
  heal(amount: number): void;
  release(receiver: AbilityUnit): void;
  bind(): void;
  isBound(): boolean;
  isUnderEffect(effect: string): boolean;
  triggerEffect(effect: string): void;
  emit(action: GameAction): void;
  isWarrior(): boolean;
}

export interface AbilitySpace {
  location: Location;
  getUnit(): AbilityUnit | undefined;
  isEmpty(): boolean;
  isStairs(): boolean;
  isUnit(): boolean;
  isWall(): boolean;
}

/** An ability that needs configuring: it is bound to its config in a level or unit definition. */
export type ConfiguredAbilityClass = new (unit: AbilityUnit, config: never) => Ability;

/** An ability with nothing to configure. */
export type AbilityClass = new (unit: AbilityUnit) => Ability;

export type AbilityBinding = [ConfiguredAbilityClass, object];

export type AbilityEntry = AbilityBinding | AbilityClass;

export abstract class Ability {
  protected unit: AbilityUnit;

  abstract readonly description: string;
  abstract readonly meta: AbilityMeta;

  constructor(unit: AbilityUnit, _config?: object) {
    this.unit = unit;
  }

  abstract perform(...args: unknown[]): unknown;
}

export abstract class Action extends Ability {
  abstract override perform(...args: unknown[]): void;
}

export abstract class Sense extends Ability {
  abstract override perform(...args: unknown[]): unknown;
}
