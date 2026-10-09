// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/DirectionOfStairs.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sense } from "../core/ability";
import { BACKWARD, FORWARD, LEFT, RIGHT } from "../spatial";
import { DirectionOfStairs } from "../abilities";
import { asUnit, mocked, type Rec } from "./helpers";

describe("DirectionOfStairs", () => {
  let directionOfStairs: DirectionOfStairs;
  let unit: Rec;

  beforeEach(() => {
    unit = { getDirectionOfStairs: vi.fn() };
    directionOfStairs = new DirectionOfStairs(asUnit(unit));
  });

  test("is a sense", () => {
    expect(directionOfStairs).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(directionOfStairs.description).toBe(
      `Returns the direction (${FORWARD}, ${RIGHT}, ${BACKWARD} or ${LEFT}) the stairs are from your location.`,
    );
  });

  test("has meta for type generation", () => {
    expect(directionOfStairs.meta).toEqual({
      params: [],
      returns: "Direction",
    });
  });

  describe("performing", () => {
    test("returns direction of stairs", () => {
      mocked(unit.getDirectionOfStairs).mockReturnValue(RIGHT);
      expect(directionOfStairs.perform()).toBe(RIGHT);
    });
  });
});
