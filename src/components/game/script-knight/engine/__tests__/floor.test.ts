// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Floor.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { NORTH } from "../spatial";
import { Floor } from "../core/floor";
import { Space } from "../core/space";
import { Unit } from "../core/unit";
import { Warrior } from "../core/warrior";

class TestUnit extends Unit {
  override readonly name = "Sludge";
  override readonly maxHealth = 10;
}

describe("Floor", () => {
  let floor: Floor;

  beforeEach(() => {
    floor = new Floor(2, 3, [1, 2]);
  });

  test("returns its map", () => {
    const unit = new TestUnit();
    floor.addUnit(unit, { x: 0, y: 1, facing: NORTH });
    const map = floor.getMap();
    expect(map[1]?.[1]?.isEmpty()).toBe(true);
    expect(map[3]?.[2]?.isStairs()).toBe(true);
    expect(map[0]?.[0]?.isWall()).toBe(true);
    expect(map[2]?.[1]?.isUnit()).toBe(true);
  });

  test("doesn't consider corners out of bounds", () => {
    expect(floor.isOutOfBounds([0, 0])).toBe(false);
    expect(floor.isOutOfBounds([1, 0])).toBe(false);
    expect(floor.isOutOfBounds([1, 2])).toBe(false);
    expect(floor.isOutOfBounds([0, 2])).toBe(false);
  });

  test("considers out of bounds when going beyond sides", () => {
    expect(floor.isOutOfBounds([-1, 0])).toBe(true);
    expect(floor.isOutOfBounds([0, -1])).toBe(true);
    expect(floor.isOutOfBounds([0, 3])).toBe(true);
    expect(floor.isOutOfBounds([2, 0])).toBe(true);
  });

  test("knows where the stairs are located", () => {
    expect(floor.isStairs([0, 0])).toBe(false);
    expect(floor.isStairs([1, 2])).toBe(true);
  });

  test("returns the space at the stairs location", () => {
    const stairsSpace = floor.getStairsSpace();
    expect(stairsSpace.location).toEqual(floor.stairsLocation);
  });

  test("returns the space at the specified location", () => {
    const space = floor.getSpaceAt([0, 0]);
    expect(space).toBeInstanceOf(Space);
    expect(space.location).toEqual([0, 0]);
  });

  test("adds a unit and fetches it at that position", () => {
    const unit = new TestUnit();
    floor.addUnit(unit, { x: 0, y: 1, facing: NORTH });
    expect(floor.getUnitAt([0, 1])).toBe(unit);
  });

  test("adds the warrior and fetches it at that position", () => {
    const warrior = new Warrior("Aldric", 20);
    floor.addWarrior(warrior, { x: 0, y: 1, facing: NORTH });
    expect(floor.getUnitAt([0, 1])).toBe(warrior);
  });

  test("knows which unit is the warrior after adding it", () => {
    expect(floor.warrior).toBeNull();
    const warrior = new Warrior("Aldric", 20);
    floor.addWarrior(warrior, { x: 0, y: 1, facing: NORTH });
    expect(floor.warrior).toBe(warrior);
  });

  test("doesn't consider a unit to be on the floor if it's not alive", () => {
    const unit = new TestUnit();
    floor.addUnit(unit, { x: 0, y: 1, facing: NORTH });
    unit.isAlive = () => false;
    expect(floor.getUnits()).not.toContain(unit);
  });
});
