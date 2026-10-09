// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Space.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { NORTH } from "../spatial";
import { Floor } from "../core/floor";
import { type SensedSpace, Space } from "../core/space";
import { Unit } from "../core/unit";
import { Warrior } from "../core/warrior";

class TestUnit extends Unit {
  override readonly name = "Sludge";
  override readonly maxHealth = 10;
}

describe("Space", () => {
  let floor: Floor;
  let space: Space;

  beforeEach(() => {
    floor = new Floor(2, 3, [0, 2]);
    space = floor.getSpaceAt([0, 0]);
  });

  describe("out of bounds", () => {
    beforeEach(() => {
      space = floor.getSpaceAt([-1, 1]);
    });

    test("is not empty", () => {
      expect(space.isEmpty()).toBe(false);
    });

    test("is not stairs", () => {
      expect(space.isStairs()).toBe(false);
    });

    test("is wall", () => {
      expect(space.isWall()).toBe(true);
    });

    test('has name "wall"', () => {
      expect(space.toString()).toEqual("wall");
    });
  });

  describe("with nothing on it", () => {
    beforeEach(() => {
      space = floor.getSpaceAt([0, 0]);
    });

    test("is empty", () => {
      expect(space.isEmpty()).toBe(true);
    });

    test("is not stairs", () => {
      expect(space.isStairs()).toBe(false);
    });

    test("is not wall", () => {
      expect(space.isWall()).toBe(false);
    });

    test("is not unit", () => {
      expect(space.isUnit()).toBe(false);
    });

    test("doesn't fetch a unit", () => {
      expect(space.getUnit()).toBeUndefined();
    });

    test('has name "nothing"', () => {
      expect(space.toString()).toEqual("nothing");
    });
  });

  describe("with stairs", () => {
    beforeEach(() => {
      space = floor.getSpaceAt([0, 2]);
    });

    test("is empty", () => {
      expect(space.isEmpty()).toBe(true);
    });

    test("is stairs", () => {
      expect(space.isStairs()).toBe(true);
    });

    test("is not wall", () => {
      expect(space.isWall()).toBe(false);
    });

    test("is not unit", () => {
      expect(space.isUnit()).toBe(false);
    });

    test("doesn't fetch a unit", () => {
      expect(space.getUnit()).toBeUndefined();
    });

    test('has name "nothing"', () => {
      expect(space.toString()).toEqual("nothing");
    });

    describe("with unit", () => {
      beforeEach(() => {
        const unit = new TestUnit();
        floor.addUnit(unit, { x: 0, y: 2, facing: NORTH });
      });

      test("is still stairs", () => {
        expect(space.isStairs()).toBe(true);
      });

      test("is also unit", () => {
        expect(space.isUnit()).toBe(true);
      });

      test("has name of unit", () => {
        expect(space.toString()).toEqual("Sludge");
      });
    });
  });

  describe("with unit", () => {
    let unit: TestUnit;

    beforeEach(() => {
      unit = new TestUnit();
      floor.addUnit(unit, { x: 0, y: 0, facing: NORTH });
    });

    test("is not empty", () => {
      expect(space.isEmpty()).toBe(false);
    });

    test("is not stairs", () => {
      expect(space.isStairs()).toBe(false);
    });

    test("is not wall", () => {
      expect(space.isWall()).toBe(false);
    });

    test("is unit", () => {
      expect(space.isUnit()).toBe(true);
    });

    test("fetches the unit", () => {
      expect(space.getUnit()).toBe(unit);
    });

    test("has name of unit", () => {
      expect(space.toString()).toEqual("Sludge");
    });
  });

  describe("sensed space", () => {
    let sensingUnit: TestUnit;
    let sensedSpace: SensedSpace;

    beforeEach(() => {
      sensingUnit = new TestUnit();
      floor.addUnit(sensingUnit, { x: 1, y: 1, facing: NORTH });
      sensedSpace = space.as(sensingUnit);
    });

    test("allows calling sensed space methods", () => {
      const allowedApi = ["getLocation", "getUnit", "isEmpty", "isStairs", "isUnit", "isWall"];
      allowedApi.forEach((propertyName) => {
        Reflect.get(sensedSpace, propertyName)();
      });
    });

    test("doesn't allow calling other space methods", () => {
      const forbiddenApi = ["as"];
      forbiddenApi.forEach((propertyName: string) => {
        expect(sensedSpace).not.toHaveProperty(propertyName);
      });
    });

    test("has a location relative to the sensing unit", () => {
      expect(sensedSpace.getLocation()).toEqual([1, -1]);
    });

    test("can get full space back", () => {
      const fullSpace = Space.from(sensedSpace, sensingUnit);
      expect(fullSpace).toBeInstanceOf(Space);
      expect(fullSpace.floor).toBe(space.floor);
      expect(fullSpace.location).toEqual(space.location);
    });
  });

  describe("toJSON", () => {
    test("empty space", () => {
      expect(space.toJSON()).toEqual({});
    });

    test("wall space", () => {
      expect(floor.getSpaceAt([-1, 0]).toJSON()).toEqual({
        wall: true,
      });
    });

    test("stairs space", () => {
      expect(floor.getSpaceAt([0, 2]).toJSON()).toEqual({
        stairs: true,
      });
    });

    test("space with unit", () => {
      const unit = new TestUnit();
      floor.addUnit(unit, { x: 0, y: 0, facing: NORTH });
      expect(space.toJSON()).toEqual({ unit: { id: 0, name: "Sludge", maxHealth: 10 } });
    });

    test("space with warrior", () => {
      const warrior = new Warrior("Aldric", 20);
      floor.addWarrior(warrior, { x: 0, y: 0, facing: NORTH });
      expect(space.toJSON()).toEqual({
        unit: { id: 0, name: "Aldric", maxHealth: 20, warrior: true },
      });
    });
  });
});
