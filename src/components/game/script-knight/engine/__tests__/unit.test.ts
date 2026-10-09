// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Unit.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { BACKWARD, FORWARD, LEFT, NORTH, RIGHT, SOUTH } from "../spatial";
import { Action, Sense } from "../core/ability";
import { Floor } from "../core/floor";
import { type SensedUnit } from "../core/space";
import { type Turn, type TurnState, Unit } from "../core/unit";

class TestUnit extends Unit {
  override readonly name: string;
  override readonly maxHealth: number;

  constructor(name: string, maxHealth: number) {
    super();
    this.name = name;
    this.maxHealth = maxHealth;
  }
}

class MockAction extends Action {
  readonly description = "mock action";
  readonly meta = { params: [], returns: "void" as const };
  perform = vi.fn();
}

class MockSense extends Sense {
  readonly description = "mock sense";
  readonly meta = { params: [], returns: "void" as const };
  perform = vi.fn();
}

describe("Unit", () => {
  let unit: Unit;
  let floor: Floor;

  beforeEach(() => {
    unit = new TestUnit("Aldric", 20);
    unit.emit = vi.fn();
    floor = new Floor(5, 6, [0, 0]);
    floor.addUnit(unit, { x: 1, y: 2, facing: NORTH });
  });

  test("has a name", () => {
    expect(unit.name).toBe("Aldric");
  });

  test("has a max health", () => {
    expect(unit.maxHealth).toBe(20);
  });

  test("has a reward which defaults to max health", () => {
    expect(unit.reward).toBe(20);
  });

  test("allows subclasses to override reward", () => {
    class CustomRewardUnit extends Unit {
      override readonly name = "Foo";
      override readonly maxHealth = 20;
      override get reward() {
        return 30;
      }
    }
    expect(new CustomRewardUnit().reward).toBe(30);
  });

  test("has an enemy status which defaults to true", () => {
    expect(unit.enemy).toBe(true);
  });

  test("allows subclasses to override enemy status", () => {
    class FriendlyUnit extends Unit {
      override readonly name = "Foo";
      override readonly maxHealth = 20;
      override readonly enemy = false;
    }
    expect(new FriendlyUnit().enemy).toBe(false);
  });

  test("has a bound status which defaults to false", () => {
    expect(unit.bound).toBe(false);
  });

  test("has a position which is null before adding the unit to the floor", () => {
    expect(new TestUnit("Foo", 20).position).toBeNull();
  });

  test("allows subclasses to override bound status", () => {
    class BoundUnit extends Unit {
      override readonly name = "Foo";
      override readonly maxHealth = 20;
      override bound = true;
    }
    expect(new BoundUnit().bound).toBe(true);
  });

  test("has a health which defaults to max health", () => {
    expect(unit.health).toBe(20);
  });

  test("starts with a score of zero", () => {
    expect(unit.score).toBe(0);
  });

  test("has a collection of abilities which starts empty", () => {
    expect(unit.abilities).toBeInstanceOf(Map);
    expect(unit.abilities.size).toBe(0);
  });

  test("has a collection of effects which starts empty", () => {
    expect(unit.effects).toBeInstanceOf(Map);
    expect(unit.effects.size).toBe(0);
  });

  test("has a turn which starts as null", () => {
    expect(unit.turn).toBeNull();
  });

  describe("next turn", () => {
    let turn: TurnState & Turn & { walk(...args: unknown[]): void };
    let feel: MockSense;
    let walk: MockAction;

    beforeEach(() => {
      feel = new MockSense(unit);
      walk = new MockAction(unit);
      unit.addAbility("feel", feel);
      unit.addAbility("walk", walk);
      turn = unit.getNextTurn() as typeof turn;
    });

    test("defines a function for each ability of the unit", () => {
      expect(turn.feel).toBeInstanceOf(Function);
      expect(turn.walk).toBeInstanceOf(Function);
    });

    describe("with actions", () => {
      test("has no action performed at first", () => {
        expect(turn.action).toBeNull();
      });

      test("can call action and recall it", () => {
        turn.walk();
        expect(turn.action).toEqual(["walk", []]);
      });

      test("includes arguments passed to action", () => {
        turn.walk("forward");
        expect(turn.action).toEqual(["walk", ["forward"]]);
      });

      test("can't call multiple actions per turn", () => {
        turn.walk();
        expect(() => {
          turn.walk();
        }).toThrow("Only one action can be performed per turn.");
      });

      test("defers execution when calling action", () => {
        turn.walk();
        expect(walk.perform).not.toHaveBeenCalled();
      });
    });

    describe("with senses", () => {
      test("can call multiple senses per turn", () => {
        turn.feel();
        turn.feel();
      });

      test("executes immediately when calling sense", () => {
        turn.feel();
        expect(feel.perform).toHaveBeenCalled();
      });
    });
  });

  test("prepares turn by calling playTurn with next turn object", () => {
    unit.getNextTurn = () => "nextTurn" as never;
    unit.playTurn = vi.fn();
    unit.prepareTurn();
    expect(unit.playTurn).toHaveBeenCalledWith("nextTurn");
  });

  test("calls passTurn once on effects when calling perform on turn", () => {
    const ticking = { passTurn: vi.fn(), trigger: vi.fn() };
    unit.addEffect("ticking", ticking as never);
    unit.turn = { action: null };
    unit.performTurn();
    expect(ticking.passTurn).toHaveBeenCalledTimes(1);
  });

  test("performs action when calling perform on turn", () => {
    const walk = { perform: vi.fn() };
    unit.addAbility("walk", walk as never);
    unit.turn = { action: ["walk", ["backward"]] };
    unit.performTurn();
    expect(walk.perform).toHaveBeenCalledWith("backward");
  });

  test("doesn't throw when calling performTurn when there is no action", () => {
    unit.turn = { action: null };
    unit.performTurn();
  });

  describe("when healing", () => {
    test("adds health", () => {
      unit.health = 5;
      unit.heal(3);
      expect(unit.health).toBe(8);
      expect(unit.emit).toHaveBeenCalledWith({
        type: "heal",
        description: "recovers {amount} HP, up to {remainingHp} HP",
        params: { amount: 3, remainingHp: 8 },
      });
    });

    test("doesn't go over max health", () => {
      unit.health = 19;
      unit.heal(2);
      expect(unit.health).toBe(20);
      expect(unit.emit).toHaveBeenCalledWith({
        type: "heal",
        description: "recovers {amount} HP, up to {remainingHp} HP",
        params: { amount: 2, remainingHp: 20 },
      });
    });

    test("doesn't add health when at max", () => {
      unit.heal(1);
      expect(unit.health).toBe(20);
      expect(unit.emit).toHaveBeenCalledWith({
        type: "heal",
        description: "recovers {amount} HP, up to {remainingHp} HP",
        params: { amount: 1, remainingHp: 20 },
      });
    });
  });

  describe("when taking damage", () => {
    test("subtracts health", () => {
      unit.takeDamage(3);
      expect(unit.health).toBe(17);
      expect(unit.emit).toHaveBeenCalledWith({
        type: "takeDamage",
        description: "takes {amount} damage, {remainingHp} HP left",
        params: { amount: 3, remainingHp: 17 },
      });
    });

    test("doesn't go under zero health", () => {
      unit.takeDamage(21);
      expect(unit.health).toBe(0);
      expect(unit.emit).toHaveBeenCalledWith({
        type: "takeDamage",
        description: "takes {amount} damage, {remainingHp} HP left",
        params: { amount: 21, remainingHp: 0 },
      });
    });

    test("dies when running out of health", () => {
      unit.takeDamage(20);
      expect(unit.isAlive()).toBe(false);
      expect(unit.emit).toHaveBeenCalledWith({
        type: "takeDamage",
        description: "takes {amount} damage, {remainingHp} HP left",
        params: { amount: 20, remainingHp: 0 },
      });
      expect(unit.emit).toHaveBeenCalledWith({
        type: "die",
        description: "dies",
        params: {},
      });
    });
  });

  describe("when dead", () => {
    beforeEach(() => {
      unit.position = null;
    });

    test("doesn't perform any action", () => {
      const walk = { perform: vi.fn() };
      unit.addAbility("walk", walk as never);
      unit.turn = { action: ["walk", []] };
      unit.performTurn();
      expect(walk.perform).not.toHaveBeenCalled();
    });
  });

  test("can damage another unit", () => {
    const receiver = new TestUnit("Test", 10);
    receiver.health = 10;
    receiver.position = {} as never;
    receiver.emit = vi.fn();
    unit.damage(receiver, 3);
    expect(receiver.health).toBe(7);
  });

  describe("when dealing damage", () => {
    let receiver: Unit;

    beforeEach(() => {
      class TestReceiver extends Unit {
        override readonly name = "Test";
        override readonly maxHealth = 5;
        override get reward() {
          return 10;
        }
      }
      receiver = new TestReceiver();
      receiver.health = 5;
      receiver.position = {} as never;
      receiver.as = () => ({
        isEnemy: () => true,
        isBound: () => false,
        isUnderEffect: () => false,
      });
      receiver.emit = vi.fn();
    });

    test("earns points equal to reward when killing unit", () => {
      unit.earnPoints = vi.fn();
      unit.damage(receiver, 5);
      expect(unit.earnPoints).toHaveBeenCalledWith(10);
    });

    test("doesn't earn points when not killing unit", () => {
      unit.earnPoints = vi.fn();
      unit.damage(receiver, 3);
      expect(unit.earnPoints).not.toHaveBeenCalled();
    });

    test("lose points equal to reward when killing a friend", () => {
      receiver.as = () => ({
        isEnemy: () => false,
        isBound: () => false,
        isUnderEffect: () => false,
      });
      unit.losePoints = vi.fn();
      unit.damage(receiver, 5);
      expect(unit.losePoints).toHaveBeenCalledWith(10);
    });
  });

  test("considers itself alive with position", () => {
    expect(unit.isAlive()).toBe(true);
  });

  test("considers itself dead when no position", () => {
    unit.position = null;
    expect(unit.isAlive()).toBe(false);
  });

  describe("when releasing", () => {
    let receiver: Unit;

    beforeEach(() => {
      receiver = new TestUnit("Test", 10);
      receiver.bound = true;
      receiver.position = {} as never;
      receiver.as = () => ({
        isEnemy: () => true,
        isBound: () => false,
        isUnderEffect: () => false,
      });
      receiver.emit = vi.fn();
    });

    test("unbinds the unit", () => {
      receiver.unbind = vi.fn();
      unit.release(receiver);
      expect(receiver.unbind).toHaveBeenCalled();
    });

    test("doesn't earn points", () => {
      unit.earnPoints = vi.fn();
      unit.release(receiver);
      expect(unit.earnPoints).not.toHaveBeenCalled();
    });

    describe("friendly unit", () => {
      beforeEach(() => {
        receiver.as = () => ({
          isEnemy: () => false,
          isBound: () => false,
          isUnderEffect: () => false,
        });
      });

      test("vanishes the unit", () => {
        receiver.vanish = vi.fn();
        unit.release(receiver);
        expect(receiver.vanish).toHaveBeenCalled();
      });

      test("earns points equal to reward", () => {
        unit.earnPoints = vi.fn();
        unit.release(receiver);
        expect(unit.earnPoints).toHaveBeenCalledWith(10);
      });
    });
  });

  test("is bound after calling bind", () => {
    unit.bind();
    expect(unit.isBound()).toBe(true);
  });

  describe("when bound", () => {
    beforeEach(() => {
      unit.bind();
    });

    test("doesn't perform any action", () => {
      const walk = { perform: vi.fn() };
      unit.addAbility("walk", walk as never);
      unit.turn = { action: ["walk", []] };
      unit.performTurn();
      expect(walk.perform).not.toHaveBeenCalled();
    });

    test("is released from bonds when calling unbind", () => {
      unit.unbind();
      expect(unit.isBound()).toBe(false);
    });

    test("is released from bonds when taking damage", () => {
      unit.takeDamage(2);
      expect(unit.isBound()).toBe(false);
    });
  });

  test("can earn points", () => {
    unit.earnPoints(5);
    expect(unit.score).toBe(5);
  });

  test("can lose points", () => {
    unit.score = 10;
    unit.losePoints(5);
    expect(unit.score).toBe(5);
  });

  test("can lose points under zero", () => {
    unit.score = 3;
    unit.losePoints(5);
    expect(unit.score).toBe(-2);
  });

  test("allows to add abilities", () => {
    expect(unit.abilities.has("walk")).toBe(false);
    unit.addAbility("walk", {} as never);
    expect(unit.abilities.has("walk")).toBe(true);
  });

  test("allows to add effects", () => {
    expect(unit.effects.has("ticking")).toBe(false);
    unit.addEffect("ticking", {} as never);
    expect(unit.effects.has("ticking")).toBe(true);
  });

  test("can trigger a given effect when it has such effect", () => {
    const ticking = { trigger: vi.fn(), passTurn: vi.fn() };
    unit.addEffect("ticking", ticking as never);
    const itching = { trigger: vi.fn(), passTurn: vi.fn() };
    unit.triggerEffect("ticking");
    unit.triggerEffect("itching");
    expect(ticking.trigger).toHaveBeenCalled();
    expect(itching.trigger).not.toHaveBeenCalled();
  });

  test("considers itself under an effect when it has such effect", () => {
    unit.addEffect("ticking", {} as never);
    expect(unit.isUnderEffect("ticking")).toBe(true);
  });

  test("doesn't fetch itself when fetching other units", () => {
    const anotherUnit = new TestUnit("Test", 10);
    floor.addUnit(anotherUnit, { x: 3, y: 4, facing: NORTH });
    expect(unit.getOtherUnits()).not.toContain(unit);
    expect(unit.getOtherUnits()).toContain(anotherUnit);
  });

  test("returns the space where it's located", () => {
    const space = unit.getSpace();
    expect(space.location).toEqual(unit.position?.location);
  });

  test("returns sensed space at a given direction and number of spaces", () => {
    const space = { as: vi.fn() };
    unit.getSpaceAt = vi.fn(() => space as never);
    unit.getSensedSpaceAt(RIGHT, 2, 1);
    expect(unit.getSpaceAt).toHaveBeenCalledWith(RIGHT, 2, 1);
    expect(space.as).toHaveBeenCalledWith(unit);
  });

  test("returns space at a given direction and number of spaces", () => {
    const position = { getRelativeSpace: vi.fn() };
    unit.position = position as never;
    unit.getSpaceAt(RIGHT, 2, 1);
    expect(position.getRelativeSpace).toHaveBeenCalledWith(RIGHT, [2, 1]);
  });

  test("returns immediate space at a given direction if number of spaces is omitted", () => {
    const position = { getRelativeSpace: vi.fn() };
    unit.position = position as never;
    unit.getSpaceAt(LEFT);
    expect(position.getRelativeSpace).toHaveBeenCalledWith(LEFT, [1, 0]);
  });

  test("returns the direction of the stairs", () => {
    expect(unit.getDirectionOfStairs()).toEqual(FORWARD);
  });

  test("returns the direction of a given space", () => {
    expect(unit.getDirectionOf(unit.getSensedSpaceAt(FORWARD, 1))).toEqual(FORWARD);
    expect(unit.getDirectionOf(unit.getSensedSpaceAt(RIGHT, 1))).toEqual(RIGHT);
    expect(unit.getDirectionOf(unit.getSensedSpaceAt(BACKWARD, 1))).toEqual(BACKWARD);
    expect(unit.getDirectionOf(unit.getSensedSpaceAt(LEFT, 1))).toEqual(LEFT);
  });

  test("returns the distance of a given space", () => {
    expect(unit.getDistanceOf(unit.getSensedSpaceAt(FORWARD, 2, -1))).toBe(3);
  });

  describe("when moving", () => {
    beforeEach(() => {
      unit.position = { move: vi.fn() } as never;
    });

    test("moves in the given direction by a given number of spaces", () => {
      unit.move(RIGHT, 2, 1);
      expect(unit.position?.move).toHaveBeenCalledWith(RIGHT, [2, 1]);
    });

    test("moves one space in the given direction if number of spaces is omitted", () => {
      unit.move(LEFT);
      expect(unit.position?.move).toHaveBeenCalledWith(LEFT, [1, 0]);
    });
  });

  describe("when rotating", () => {
    beforeEach(() => {
      unit.position = { rotate: vi.fn() } as never;
    });

    test("rotates in the given direction", () => {
      unit.rotate(RIGHT);
      expect(unit.position?.rotate).toHaveBeenCalledWith(RIGHT);
    });
  });

  describe("when vanishing", () => {
    test("disappears from the floor", () => {
      expect(unit.position).not.toBeNull();
      unit.vanish();
      expect(unit.position).toBeNull();
    });
  });

  describe("sensed unit", () => {
    let sensingUnit: Unit;
    let sensedUnit: SensedUnit;

    beforeEach(() => {
      class FriendlyUnit extends Unit {
        override readonly name = "Test";
        override readonly maxHealth = 10;
        override readonly enemy = false;
      }
      sensingUnit = new FriendlyUnit();
      floor.addUnit(sensingUnit, { x: 0, y: 1, facing: SOUTH });
      sensedUnit = unit.as(sensingUnit);
    });

    test("allows calling sensed unit methods", () => {
      const allowedApi = ["isBound", "isEnemy", "isUnderEffect"];
      allowedApi.forEach((propertyName) => {
        Reflect.get(sensedUnit, propertyName)();
      });
    });

    test("is considered enemy if it doesn't fight for the same side", () => {
      expect(sensedUnit.isEnemy()).toBe(true);
    });

    test("doesn't allow calling other unit methods", () => {
      const forbiddenApi = [
        "addAbility",
        "addEffect",
        "as",
        "bind",
        "damage",
        "earnPoints",
        "getDirectionOf",
        "getDirectionOfStairs",
        "getDistanceOf",
        "getNextTurn",
        "getOtherUnits",
        "getSpace",
        "getSpaceAt",
        "heal",
        "isAlive",
        "emit",
        "losePoints",
        "move",
        "performTurn",
        "prepareTurn",
        "rotate",
        "takeDamage",
        "triggerEffect",
        "unbind",
        "vanish",
      ];
      forbiddenApi.forEach((propertyName) => {
        expect(sensedUnit).not.toHaveProperty(propertyName);
      });
    });
  });

  test("has a nice string representation", () => {
    expect(unit.toString()).toBe(unit.name);
  });

  test("has a minimal JSON representation", () => {
    expect(unit.toJSON()).toEqual({
      name: "Aldric",
    });
  });
});
