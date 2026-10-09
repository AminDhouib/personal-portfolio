// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/MaxHealth.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { Sense } from "../core/ability";
import { MaxHealth } from "../abilities";
import { asUnit, type Rec } from "./helpers";

describe("MaxHealth", () => {
  let maxHealth: MaxHealth;
  let unit: Rec;

  beforeEach(() => {
    unit = { maxHealth: 10 };
    maxHealth = new MaxHealth(asUnit(unit));
  });

  test("is a sense", () => {
    expect(maxHealth).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(maxHealth.description).toBe("Returns an integer representing your maximum health.");
  });

  test("has meta for type generation", () => {
    expect(maxHealth.meta).toEqual({
      params: [],
      returns: "number",
    });
  });

  describe("performing", () => {
    test("returns the maximum health", () => {
      expect(maxHealth.perform()).toBe(10);
    });
  });
});
