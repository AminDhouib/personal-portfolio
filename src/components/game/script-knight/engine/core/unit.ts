// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/core/src/Unit.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: local invariant, typed turns, events go to the floor's logger.

import type { RelativeDirection } from "../spatial";
import { type Ability, type AbilityEntry, Action } from "./ability";
import type { Effect } from "./effect";
import type { Floor } from "./floor";
import type { GameAction } from "./logger";
import type { Position } from "./position";
import { Space, type SensedSpace, type SensedUnit } from "./space";

/** Replaces `tiny-invariant`: throws `message` unless `condition` holds. */
export function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/** What a unit's own `playTurn` may call. A unit only has the abilities it was given. */
export interface Turn {
  feel(direction?: RelativeDirection): SensedSpace;
  look(direction?: RelativeDirection): SensedSpace[];
  attack(direction?: RelativeDirection): void;
  shoot(direction?: RelativeDirection): void;
}

export interface TurnState {
  action: [string, unknown[]] | null;
}

export interface UnitClass {
  new (): Unit;
  declaredAbilities?: Record<string, AbilityEntry>;
}

export class Unit {
  static declaredAbilities?: Record<string, AbilityEntry>;

  readonly name: string = "";
  readonly maxHealth: number = 0;
  readonly enemy: boolean = true;
  bound: boolean = false;

  #health?: number;
  get health(): number {
    return this.#health ?? this.maxHealth;
  }
  set health(value: number) {
    this.#health = value;
  }

  get reward(): number {
    return this.maxHealth;
  }

  position: Position | null = null;
  floor: Floor | null = null;
  score: number = 0;
  abilities: Map<string, Ability> = new Map();
  effects: Map<string, Effect> = new Map();
  turn: TurnState | null = null;

  requirePosition(): Position {
    invariant(this.position, `${this.name} has no position (unit is not on the floor).`);
    return this.position;
  }

  getNextTurn(): TurnState & Turn {
    const turn: TurnState = { action: null };
    this.abilities.forEach((ability, name) => {
      if (ability instanceof Action) {
        Object.defineProperty(turn, name, {
          value: (...args: unknown[]) => {
            if (turn.action) {
              throw new Error("Only one action can be performed per turn.");
            }

            turn.action = [name, args];
          },
        });
      } else {
        Object.defineProperty(turn, name, {
          value: (...args: unknown[]) => ability.perform(...args),
        });
      }
    });
    return turn as TurnState & Turn;
  }

  playTurn(_turn: Turn): void {}

  prepareTurn(): void {
    const turn = this.getNextTurn();
    this.turn = turn;
    this.playTurn(turn);
  }

  performTurn(): void {
    if (this.isAlive()) {
      this.effects.forEach((effect) => effect.passTurn());
      if (this.turn?.action && !this.isBound()) {
        const [name, args] = this.turn.action;
        this.abilities.get(name)?.perform(...args);
      }
    }
  }

  heal(amount: number): void {
    const revisedAmount =
      this.health + amount > this.maxHealth ? this.maxHealth - this.health : amount;
    this.health += revisedAmount;
    this.emit({
      type: "heal",
      description: "recovers {amount} HP, up to {remainingHp} HP",
      params: { amount, remainingHp: this.health },
    });
  }

  takeDamage(amount: number): void {
    if (this.isBound()) {
      this.unbind();
    }

    const revisedAmount = this.health - amount < 0 ? this.health : amount;
    this.health -= revisedAmount;
    this.emit({
      type: "takeDamage",
      description: "takes {amount} damage, {remainingHp} HP left",
      params: { amount, remainingHp: this.health },
    });

    if (this.health === 0) {
      this.vanish();
      this.emit({ type: "die", description: "dies", params: {} });
    }
  }

  damage(receiver: Unit, amount: number): void {
    receiver.takeDamage(amount);
    if (!receiver.isAlive()) {
      if (receiver.as(this).isEnemy()) {
        this.earnPoints(receiver.reward);
      } else {
        this.losePoints(receiver.reward);
      }
    }
  }

  isAlive(): boolean {
    return this.position !== null;
  }

  release(receiver: Unit): void {
    if (!receiver.as(this).isEnemy()) {
      receiver.vanish();
    }

    receiver.unbind();
    if (!receiver.isAlive()) {
      this.earnPoints(receiver.reward);
    }
  }

  unbind(): void {
    this.bound = false;
    this.emit({ type: "release", description: "released from bonds", params: {} });
  }

  bind(): void {
    this.bound = true;
  }

  isBound(): boolean {
    return this.bound;
  }

  earnPoints(points: number): void {
    this.score += points;
  }

  losePoints(points: number): void {
    this.score -= points;
  }

  addAbility(name: string, ability: Ability): void {
    this.abilities.set(name, ability);
  }

  addEffect(name: string, effect: Effect): void {
    this.effects.set(name, effect);
  }

  triggerEffect(name: string): void {
    const effect = this.effects.get(name);
    if (effect) {
      effect.trigger();
    }
  }

  isUnderEffect(name: string): boolean {
    return this.effects.has(name);
  }

  isWarrior(): boolean {
    return false;
  }

  getOtherUnits(): Unit[] {
    // A unit just removed by a bomb (a ticking captive) still belongs to its floor for the
    // explosion it triggers: see the DESIGN.md register.
    const floor = this.position?.floor ?? this.floor;
    invariant(floor, `${this.name} has no position (unit is not on the floor).`);
    return floor.getUnits().filter((unit) => unit !== this);
  }

  getSpace(): Space {
    const position = this.requirePosition();
    return position.getSpace();
  }

  getSensedSpaceAt(
    direction: RelativeDirection,
    forward: number = 1,
    right: number = 0,
  ): SensedSpace {
    return this.getSpaceAt(direction, forward, right).as(this);
  }

  getSpaceAt(direction: RelativeDirection, forward: number = 1, right: number = 0): Space {
    const position = this.requirePosition();
    return position.getRelativeSpace(direction, [forward, right]);
  }

  getDirectionOfStairs(): RelativeDirection {
    const position = this.requirePosition();
    return position.getRelativeDirectionOf(position.floor.getStairsSpace());
  }

  getDirectionOf(sensedSpace: SensedSpace): RelativeDirection {
    const position = this.requirePosition();
    const space = Space.from(sensedSpace, this);
    return position.getRelativeDirectionOf(space);
  }

  getDistanceOf(sensedSpace: SensedSpace): number {
    const position = this.requirePosition();
    const space = Space.from(sensedSpace, this);
    return position.getDistanceOf(space);
  }

  move(direction: RelativeDirection, forward: number = 1, right: number = 0): void {
    const position = this.requirePosition();
    position.move(direction, [forward, right]);
  }

  rotate(direction: RelativeDirection): void {
    this.position?.rotate(direction);
  }

  vanish(): void {
    this.position = null;
  }

  emit(action: GameAction): void {
    this.floor?.logger?.unit(this, action);
  }

  as(unit: Unit): SensedUnit {
    return {
      isBound: this.isBound.bind(this),
      isEnemy: () => this.enemy !== unit.enemy,
      isUnderEffect: this.isUnderEffect.bind(this),
    };
  }

  toString(): string {
    return this.name;
  }

  toJSON(): { name: string } {
    return {
      name: this.name,
    };
  }
}
