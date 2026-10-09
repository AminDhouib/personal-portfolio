// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Level.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { EAST, FORWARD } from "../spatial";
import { Floor } from "../core/floor";
import { Level } from "../core/level";
import { Warrior } from "../core/warrior";

describe("Level", () => {
  let floor: Floor;
  let level: Level;
  let warrior: Warrior;

  beforeEach(() => {
    warrior = new Warrior("Aldric", 20);
    warrior.emit = vi.fn();
    floor = new Floor(2, 1, [1, 0]);
    floor.addUnit(warrior, { x: 0, y: 0, facing: EAST });
    floor.warrior = warrior;
    level = new Level(
      1,
      "You see a faint light at the end of the hallway.",
      "Use `warrior.walk()` to move toward the stairs.",
      "Walk forward each turn until you reach the stairs.",
      floor,
    );
  });

  describe("playing", () => {
    beforeEach(() => {
      warrior.prepareTurn = vi.fn();
      warrior.performTurn = vi.fn();
    });

    test("calls prepareTurn and playTurn on each unit once per turn", () => {
      level.play(2);
      expect(warrior.prepareTurn).toHaveBeenCalledTimes(2);
      expect(warrior.performTurn).toHaveBeenCalledTimes(2);
    });

    test("plays for a max number of turns which defaults to 200", () => {
      level.play();
      expect(warrior.prepareTurn).toHaveBeenCalledTimes(200);
      expect(warrior.performTurn).toHaveBeenCalledTimes(200);
    });

    test("returns immediately when passed", () => {
      level.wasPassed = () => true;
      level.play(2);
      expect(warrior.performTurn).not.toHaveBeenCalled();
    });

    test("returns immediately when failed", () => {
      level.wasFailed = () => true;
      level.play(2);
      expect(warrior.performTurn).not.toHaveBeenCalled();
    });
  });

  test("considers passed when warrior is on stairs", () => {
    warrior.move(FORWARD);
    expect(level.wasPassed()).toBe(true);
  });

  test("considers failed when warrior is dead", () => {
    warrior.isAlive = () => false;
    expect(level.wasFailed()).toBe(true);
  });

  test("has a minimal JSON representation", () => {
    expect(level.toJSON()).toEqual({
      number: 1,
      description: "You see a faint light at the end of the hallway.",
      tip: "Use `warrior.walk()` to move toward the stairs.",
      clue: "Walk forward each turn until you reach the stairs.",
      floorMap: level.floor.getMap(),
      warriorStatus: level.floor.warrior?.getStatus(),
      warriorAbilities: [],
    });
  });
});
