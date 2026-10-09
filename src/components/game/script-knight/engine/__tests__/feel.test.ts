// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Feel.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sense } from "../core/ability";
import { FORWARD, LEFT } from "../spatial";
import { Feel } from "../abilities";
import { asUnit, mocked, type Rec } from "./helpers";

describe("Feel", () => {
  let feel: Feel;
  let unit: Rec;

  beforeEach(() => {
    unit = { getSensedSpaceAt: vi.fn() };
    feel = new Feel(asUnit(unit));
  });

  test("is a sense", () => {
    expect(feel).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(feel.description).toBe(
      `Returns the adjacent space in the given direction (\`'${FORWARD}'\` by default).`,
    );
  });

  test("has meta for type generation", () => {
    expect(feel.meta).toEqual({
      params: [{ name: "direction", type: "Direction", optional: true }],
      returns: "Space",
    });
  });

  describe("performing", () => {
    test("feels forward by default", () => {
      feel.perform();
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(FORWARD);
    });

    test("allows to specify direction", () => {
      feel.perform(LEFT);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(LEFT);
    });

    test("returns adjacent space in specified direction", () => {
      mocked(unit.getSensedSpaceAt).mockReturnValue("space");
      expect(feel.perform()).toBe("space");
    });
  });
});
