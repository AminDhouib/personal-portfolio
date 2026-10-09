// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Listen.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test, vi } from "vitest";
import { Sense } from "../core/ability";
import { FORWARD, NORTH } from "../spatial";
import { Listen } from "../abilities";
import { asUnit, mocked, type Rec } from "./helpers";

describe("Listen", () => {
  let listen: Listen;
  let unit: Rec;

  beforeEach(() => {
    unit = {
      position: {
        location: [1, 1],
        orientation: NORTH,
      },
      getOtherUnits: () => [
        { getSpace: () => ({ location: [0, 0] }) },
        { getSpace: () => ({ location: [2, 3] }) },
      ],
      getSensedSpaceAt: vi.fn(),
    };
    listen = new Listen(asUnit(unit));
  });

  test("is a sense", () => {
    expect(listen).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(listen.description).toBe(
      "Returns an array of all spaces which have units in them (excluding yourself).",
    );
  });

  test("has meta for type generation", () => {
    expect(listen.meta).toEqual({
      params: [],
      returns: "Space[]",
    });
  });

  describe("performing", () => {
    test("returns all spaces which have units in them", () => {
      mocked(unit.getSensedSpaceAt).mockReturnValueOnce("space1").mockReturnValueOnce("space2");
      expect(listen.perform()).toEqual(["space1", "space2"]);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(FORWARD, 1, -1);
      expect(unit.getSensedSpaceAt).toHaveBeenCalledWith(FORWARD, -2, 1);
    });
  });
});
