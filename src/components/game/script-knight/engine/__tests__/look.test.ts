// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Look.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sense } from "../core/ability";
import { FORWARD, LEFT } from "../spatial";
import { Look } from "../abilities";
import { asUnit, mocked, type Rec } from "./helpers";

describe("Look", () => {
  let look: Look;
  let unit: Rec;

  beforeEach(() => {
    unit = { getSensedSpaceAt: vi.fn() };
    look = new Look(asUnit(unit), { range: 3 });
  });

  test("is a sense", () => {
    expect(look).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(look.description).toBe(
      `Returns an array of up to 3 spaces in the given direction (\`'${FORWARD}'\` by default).`,
    );
  });

  test("has meta for type generation", () => {
    expect(look.meta).toEqual({
      params: [{ name: "direction", type: "Direction", optional: true }],
      returns: "Space[]",
    });
  });

  test(".with() returns an AbilityBinding", () => {
    const binding = Look.with({ range: 3 });
    expect(binding).toEqual([Look, { range: 3 }]);
  });

  describe("performing", () => {
    test("looks forward by default", () => {
      look.perform();
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(FORWARD, 1);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(FORWARD, 2);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(FORWARD, 3);
    });

    test("allows to specify direction", () => {
      look.perform(LEFT);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(LEFT, 1);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(LEFT, 2);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(LEFT, 3);
    });

    test("returns spaces in range in specified direction", () => {
      const space1 = { isWall: () => false };
      const space2 = { isWall: () => false };
      const space3 = { isWall: () => false };
      const space4 = { isWall: () => false };

      mocked(unit.getSensedSpaceAt)
        .mockReturnValueOnce(space1)
        .mockReturnValueOnce(space2)
        .mockReturnValueOnce(space3)
        .mockReturnValueOnce(space4);
      expect(look.perform()).toEqual([space1, space2, space3]);
    });

    test("can't see through walls", () => {
      const space1 = { isWall: () => false };
      const space2 = { isWall: () => true };
      const space3 = { isWall: () => false };

      mocked(unit.getSensedSpaceAt)
        .mockReturnValueOnce(space1)
        .mockReturnValueOnce(space2)
        .mockReturnValueOnce(space3);

      expect(look.perform()).toEqual([space1, space2]);
    });
  });
});
