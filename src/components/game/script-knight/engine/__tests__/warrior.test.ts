// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Warrior.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { type AbilityUnit, Action, Sense } from "../core/ability";
import { Warrior } from "../core/warrior";

class MockAction extends Action {
  readonly description: string;
  readonly meta = { params: [], returns: "void" as const };
  constructor(unit: AbilityUnit, description: string) {
    super(unit);
    this.description = description;
  }
  perform = vi.fn();
}

class MockSense extends Sense {
  readonly description: string;
  readonly meta = { params: [], returns: "void" as const };
  constructor(unit: AbilityUnit, description: string) {
    super(unit);
    this.description = description;
  }
  perform = vi.fn();
}

describe("Warrior", () => {
  let warrior: Warrior;

  beforeEach(() => {
    warrior = new Warrior("Aldric", 20);
    warrior.addAbility("feel", new MockSense(warrior, "a description"));
    warrior.addAbility("walk", new MockAction(warrior, "a description"));
    warrior.emit = vi.fn();
  });

  test("is upset for not doing anything when no action", () => {
    warrior.turn = { action: null };
    warrior.performTurn();
    expect(warrior.emit).toHaveBeenCalledWith({
      type: "idle",
      description: "does nothing",
      params: {},
    });
  });

  test("is upset for not doing anything when bound", () => {
    warrior.bind();
    warrior.turn = { action: ["walk", []] };
    warrior.performTurn();
    expect(warrior.emit).toHaveBeenCalledWith({
      type: "idle",
      description: "does nothing",
      params: {},
    });
  });

  test("is proud of earning points", () => {
    warrior.earnPoints(5);
    expect(warrior.emit).toHaveBeenCalledWith({
      type: "earnPoints",
      description: "earns {points} points",
      params: { points: 5 },
    });
  });

  test("is upset for losing points", () => {
    warrior.losePoints(5);
    expect(warrior.emit).toHaveBeenCalledWith({
      type: "losePoints",
      description: "loses {points} points",
      params: { points: 5 },
    });
  });

  test("returns abilities as a sorted flat list", () => {
    expect(warrior.getAbilities()).toEqual([
      {
        name: "feel",
        description: "a description",
        meta: { params: [], returns: "void" },
        isAction: false,
      },
      {
        name: "walk",
        description: "a description",
        meta: { params: [], returns: "void" },
        isAction: true,
      },
    ]);
  });

  test("has a status", () => {
    expect(warrior.getStatus()).toEqual({
      health: 20,
      score: 0,
    });
  });
});
