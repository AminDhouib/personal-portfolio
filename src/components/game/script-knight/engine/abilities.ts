// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87),
// libs/abilities/src/*.ts. Copyright (c) 2015-present Matias Olivera. MIT licence: see ./LICENSE.
// Modified by Amin Dhouib, 2026: merged; directions are verified; think drops node:util.

import {
  type AbilityBinding,
  type AbilityMeta,
  type AbilitySpace,
  type AbilityUnit,
  Action,
  Sense,
} from "./core/ability";
import type { SensedSpace } from "./core/space";
import {
  BACKWARD,
  FORWARD,
  getRelativeOffset,
  LEFT,
  type RelativeDirection,
  type RelativeOffset,
  RIGHT,
  verifyRelativeDirection,
} from "./spatial";

const DIRECTION_PARAM: AbilityMeta["params"] = [
  { name: "direction", type: "Direction", optional: true },
];

/** Longest thought, in characters. The turn facade caps how many lines a turn may keep. */
export const THOUGHT_MAX_CHARS = 200;

interface AttackConfig {
  power: number;
}

export class Attack extends Action {
  readonly description: string;
  readonly meta: AbilityMeta = {
    params: DIRECTION_PARAM,
    returns: "void",
  };

  private power: number;

  constructor(unit: AbilityUnit, { power }: AttackConfig) {
    super(unit);
    this.description = `Attacks a unit in the given direction (\`'${FORWARD}'\` by default), dealing ${power} HP of damage.`;
    this.power = power;
  }

  perform(direction: RelativeDirection = FORWARD): void {
    verifyRelativeDirection(direction);
    const receiver = this.unit.getSpaceAt(direction).getUnit();
    if (receiver) {
      this.unit.emit({
        type: "attack",
        description: "attacks {direction} and hits {target}",
        params: {
          direction,
          target: { type: "unit", name: receiver.name, warrior: receiver.isWarrior() },
          hit: true,
        },
      });
      const attackingBackward = direction === BACKWARD;
      const amount = attackingBackward ? Math.ceil(this.power / 2.0) : this.power;
      this.unit.damage(receiver, amount);
    } else {
      this.unit.emit({
        type: "attack",
        description: "attacks {direction} and hits nothing",
        params: { direction, hit: false },
      });
    }
  }

  static with(config: AttackConfig): AbilityBinding {
    return [Attack, config];
  }
}

export class Bind extends Action {
  readonly description = `Binds a unit in the given direction (\`'${FORWARD}'\` by default) to keep them from moving.`;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "void" };

  perform(direction: RelativeDirection = FORWARD): void {
    verifyRelativeDirection(direction);
    const receiver = this.unit.getSpaceAt(direction).getUnit();
    if (receiver) {
      this.unit.emit({
        type: "bind",
        description: "binds {direction} and restricts {target}",
        params: {
          direction,
          target: { type: "unit", name: receiver.name, warrior: receiver.isWarrior() },
        },
      });
      receiver.bind();
    } else {
      this.unit.emit({
        type: "bind",
        description: "binds {direction} and restricts nothing",
        params: { direction },
      });
    }
  }
}

const SURROUNDING_OFFSETS: RelativeOffset[] = [
  [1, 1],
  [1, -1],
  [2, 0],
  [0, 0],
];

interface DetonateConfig {
  targetPower: number;
  surroundingPower: number;
}

export class Detonate extends Action {
  readonly description: string;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "void" };

  private targetPower: number;
  private surroundingPower: number;

  constructor(unit: AbilityUnit, { targetPower, surroundingPower }: DetonateConfig) {
    super(unit);
    this.description = `Detonates a bomb in a given direction (\`'${FORWARD}'\` by default), dealing ${targetPower} HP of damage to that space and ${surroundingPower} HP of damage to surrounding 4 spaces (including yourself).`;
    this.targetPower = targetPower;
    this.surroundingPower = surroundingPower;
  }

  perform(direction: RelativeDirection = FORWARD): void {
    verifyRelativeDirection(direction);
    this.unit.emit({
      type: "detonate",
      description: "detonates a bomb {direction} launching a deadly explosion",
      params: { direction },
    });
    // Every space is read before the first bomb falls: a chained explosion can remove the
    // detonating unit itself, and a removed unit has no position to read spaces from.
    const targetSpace = this.unit.getSpaceAt(direction);
    const surroundingSpaces = SURROUNDING_OFFSETS.map(([forward, right]) =>
      this.unit.getSpaceAt(direction, forward, right),
    );
    this.bomb(targetSpace, this.targetPower);
    surroundingSpaces.forEach((surroundingSpace) => {
      this.bomb(surroundingSpace, this.surroundingPower);
    });
  }

  private bomb(space: AbilitySpace, power: number): void {
    const receiver = space.getUnit();
    if (receiver) {
      this.unit.damage(receiver, power);
      if (receiver.isUnderEffect("ticking")) {
        receiver.emit({
          type: "chainDetonate",
          description: "caught in the blast, detonating the ticking explosive",
          params: {},
        });
        receiver.triggerEffect("ticking");
      }
    }
  }

  static with(config: DetonateConfig): AbilityBinding {
    return [Detonate, config];
  }
}

export class DirectionOf extends Sense {
  readonly description = `Returns the direction (${FORWARD}, ${RIGHT}, ${BACKWARD} or ${LEFT}) to the given space.`;
  readonly meta: AbilityMeta = {
    params: [{ name: "space", type: "Space" }],
    returns: "Direction",
  };

  perform(space: SensedSpace): RelativeDirection {
    return this.unit.getDirectionOf(space);
  }
}

export class DirectionOfStairs extends Sense {
  readonly description = `Returns the direction (${FORWARD}, ${RIGHT}, ${BACKWARD} or ${LEFT}) the stairs are from your location.`;
  readonly meta: AbilityMeta = { params: [], returns: "Direction" };

  perform(): RelativeDirection {
    return this.unit.getDirectionOfStairs();
  }
}

export class DistanceOf extends Sense {
  readonly description = "Returns an integer representing the distance to the given space.";
  readonly meta: AbilityMeta = {
    params: [{ name: "space", type: "Space" }],
    returns: "number",
  };

  perform(space: SensedSpace): number {
    return this.unit.getDistanceOf(space);
  }
}

export class Feel extends Sense {
  readonly description = `Returns the adjacent space in the given direction (\`'${FORWARD}'\` by default).`;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "Space" };

  perform(direction: RelativeDirection = FORWARD): SensedSpace {
    verifyRelativeDirection(direction);
    return this.unit.getSensedSpaceAt(direction);
  }
}

export class Health extends Sense {
  readonly description = "Returns an integer representing your health.";
  readonly meta: AbilityMeta = { params: [], returns: "number" };

  perform(): number {
    return this.unit.health;
  }
}

export class Listen extends Sense {
  readonly description =
    "Returns an array of all spaces which have units in them (excluding yourself).";
  readonly meta: AbilityMeta = { params: [], returns: "Space[]" };

  perform(): SensedSpace[] {
    const position = this.unit.position;
    if (!position) {
      return [];
    }
    return this.unit
      .getOtherUnits()
      .map((anotherUnit) =>
        getRelativeOffset(anotherUnit.getSpace().location, position.location, position.orientation),
      )
      .map(([forward, right]) => this.unit.getSensedSpaceAt(FORWARD, forward, right));
  }
}

interface LookConfig {
  range: number;
}

export class Look extends Sense {
  readonly description: string;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "Space[]" };

  private range: number;

  constructor(unit: AbilityUnit, { range }: LookConfig) {
    super(unit);
    this.description = `Returns an array of up to ${range} spaces in the given direction (\`'${FORWARD}'\` by default).`;
    this.range = range;
  }

  perform(direction: RelativeDirection = FORWARD): SensedSpace[] {
    verifyRelativeDirection(direction);
    const offsets = Array.from({ length: this.range }, (_, index) => index + 1);
    const spaces = offsets.map((offset) => this.unit.getSensedSpaceAt(direction, offset));
    const firstWallIndex = spaces.findIndex((space) => space?.isWall());
    return firstWallIndex === -1 ? spaces : spaces.slice(0, firstWallIndex + 1);
  }

  static with(config: LookConfig): AbilityBinding {
    return [Look, config];
  }
}

export class MaxHealth extends Sense {
  readonly description = "Returns an integer representing your maximum health.";
  readonly meta: AbilityMeta = { params: [], returns: "number" };

  perform(): number {
    return this.unit.maxHealth;
  }
}

export class Pivot extends Action {
  readonly description = `Rotates in the given direction (\`'${BACKWARD}'\` by default).`;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "void" };

  perform(direction: RelativeDirection = BACKWARD): void {
    verifyRelativeDirection(direction);
    this.unit.rotate(direction);
    this.unit.emit({ type: "pivot", description: "pivots {direction}", params: { direction } });
  }
}

export class Rescue extends Action {
  readonly description = `Releases a unit from their chains in the given direction (\`'${FORWARD}'\` by default).`;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "void" };

  perform(direction: RelativeDirection = FORWARD): void {
    verifyRelativeDirection(direction);
    const receiver = this.unit.getSpaceAt(direction).getUnit();
    if (receiver?.isBound()) {
      this.unit.emit({
        type: "rescue",
        description: "unbinds {direction} and rescues {target}",
        params: {
          direction,
          target: { type: "unit", name: receiver.name, warrior: receiver.isWarrior() },
        },
      });
      this.unit.release(receiver);
    } else {
      this.unit.emit({
        type: "rescue",
        description: "unbinds {direction} and rescues nothing",
        params: { direction },
      });
    }
  }
}

interface RestConfig {
  healthGain: number;
}

export class Rest extends Action {
  readonly description: string;
  readonly meta: AbilityMeta = { params: [], returns: "void" };

  private healthGain: number;

  constructor(unit: AbilityUnit, { healthGain }: RestConfig) {
    super(unit);
    this.description = `Gains ${healthGain * 100}% of max health back, but does nothing more.`;
    this.healthGain = healthGain;
  }

  perform(): void {
    if (this.unit.health < this.unit.maxHealth) {
      this.unit.emit({ type: "rest", description: "rests", params: {} });
      const amount = Math.round(this.unit.maxHealth * this.healthGain);
      this.unit.heal(amount);
    } else {
      this.unit.emit({
        type: "rest",
        description: "has nothing to heal",
        params: { atFull: true },
      });
    }
  }

  static with(config: RestConfig): AbilityBinding {
    return [Rest, config];
  }
}

interface ShootConfig {
  power: number;
  range: number;
}

export class Shoot extends Action {
  readonly description: string;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "void" };

  private power: number;
  private range: number;

  constructor(unit: AbilityUnit, { power, range }: ShootConfig) {
    super(unit);
    this.description = `Shoots the bow & arrow in the given direction (\`'${FORWARD}'\` by default), dealing ${power} HP of damage to the first unit in a range of ${range} spaces.`;
    this.power = power;
    this.range = range;
  }

  perform(direction: RelativeDirection = FORWARD): void {
    verifyRelativeDirection(direction);
    const offsets = Array.from({ length: this.range }, (_, index) => index + 1);
    const receiver = offsets
      .map((offset) => this.unit.getSpaceAt(direction, offset).getUnit())
      .find((unitInRange) => unitInRange);
    if (receiver) {
      this.unit.emit({
        type: "shoot",
        description: "shoots {direction} and hits {target}",
        params: {
          direction,
          target: { type: "unit", name: receiver.name, warrior: receiver.isWarrior() },
          hit: true,
        },
      });
      this.unit.damage(receiver, this.power);
    } else {
      this.unit.emit({
        type: "shoot",
        description: "shoots {direction} and hits nothing",
        params: { direction, hit: false },
      });
    }
  }

  static with(config: ShootConfig): AbilityBinding {
    return [Shoot, config];
  }
}

function formatValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value !== "object" && typeof value !== "function") {
    return String(value);
  }
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" ? json : "[object]";
  } catch {
    // silent-ok: a thought about a cyclic or throwing value is shown as a placeholder, never an error
    return "[object]";
  }
}

/** Replaces `util.format`: strings as they are, primitives by `String`, the rest as guarded JSON. */
export function formatThought(args: readonly unknown[]): string {
  return args.map(formatValue).join(" ").slice(0, THOUGHT_MAX_CHARS);
}

export class Think extends Sense {
  readonly description = "Thinks out loud (`console.log` replacement).";
  readonly meta: AbilityMeta = {
    params: [{ name: "args", type: "any", rest: true }],
    returns: "void",
  };

  perform(...args: unknown[]): void {
    const thought = args.length > 0 ? formatThought(args) : "nothing";
    this.unit.emit({ type: "think", description: "thinks {thought}", params: { thought } });
  }
}

export class Walk extends Action {
  readonly description = `Moves one space in the given direction (\`'${FORWARD}'\` by default).`;
  readonly meta: AbilityMeta = { params: DIRECTION_PARAM, returns: "void" };

  perform(direction: RelativeDirection = FORWARD): void {
    verifyRelativeDirection(direction);
    const space = this.unit.getSpaceAt(direction);
    if (space.isEmpty()) {
      this.unit.move(direction);
      this.unit.emit({
        type: "walk",
        description: "walks {direction}",
        params: { direction, blocked: false },
      });
    } else {
      const unit = space.getUnit();
      this.unit.emit({
        type: "walk",
        description: "walks {direction} and bumps into {obstacle}",
        params: {
          direction,
          obstacle: unit
            ? { type: "unit", name: unit.name, warrior: unit.isWarrior() }
            : String(space),
          blocked: true,
        },
      });
    }
  }
}
