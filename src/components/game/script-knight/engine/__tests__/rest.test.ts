// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Rest.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Action } from "../core/ability";
import { Rest } from "../abilities";
import { asUnit, type Rec } from "./helpers";

describe("Rest", () => {
  let rest: Rest;
  let unit: Rec;

  beforeEach(() => {
    unit = {
      maxHealth: 20,
      health: 10,
      heal: vi.fn(),
      emit: vi.fn(),
    };
    rest = new Rest(asUnit(unit), { healthGain: 0.1 });
  });

  test("is an action", () => {
    expect(rest).toBeInstanceOf(Action);
  });

  test("has a description", () => {
    expect(rest.description).toBe("Gains 10% of max health back, but does nothing more.");
  });

  test("has meta for type generation", () => {
    expect(rest.meta).toEqual({
      params: [],
      returns: "void",
    });
  });

  test(".with() returns an AbilityBinding", () => {
    const binding = Rest.with({ healthGain: 0.1 });
    expect(binding).toEqual([Rest, { healthGain: 0.1 }]);
  });

  describe("performing", () => {
    test("gives health back", () => {
      rest.perform();
      expect(unit.emit).toHaveBeenCalledWith({ type: "rest", description: "rests", params: {} });
      expect(unit.heal).toHaveBeenCalledWith(2);
    });

    test("doesn't add health when at max", () => {
      unit.health = 20;
      rest.perform();
      expect(unit.emit).toHaveBeenCalledWith({
        type: "rest",
        description: "has nothing to heal",
        params: { atFull: true },
      });
      expect(unit.heal).not.toHaveBeenCalled();
    });
  });
});
