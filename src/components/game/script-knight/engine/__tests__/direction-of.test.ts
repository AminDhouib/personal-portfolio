// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/DirectionOf.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sense } from "../core/ability";
import { BACKWARD, FORWARD, LEFT, RIGHT } from "../spatial";
import { DirectionOf } from "../abilities";
import { asUnit, mocked, type Rec } from "./helpers";

describe("DirectionOf", () => {
  let directionOf: DirectionOf;
  let unit: Rec;

  beforeEach(() => {
    unit = { getDirectionOf: vi.fn() };
    directionOf = new DirectionOf(asUnit(unit));
  });

  test("is a sense", () => {
    expect(directionOf).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(directionOf.description).toBe(
      `Returns the direction (${FORWARD}, ${RIGHT}, ${BACKWARD} or ${LEFT}) to the given space.`,
    );
  });

  test("has meta for type generation", () => {
    expect(directionOf.meta).toEqual({
      params: [{ name: "space", type: "Space" }],
      returns: "Direction",
    });
  });

  describe("performing", () => {
    test("returns direction of specified space", () => {
      mocked(unit.getDirectionOf).mockReturnValue(RIGHT);
      expect(directionOf.perform({} as never)).toBe(RIGHT);
    });
  });
});
