// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/abilities/src/Health.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { Sense } from "../core/ability";
import { Health } from "../abilities";
import { asUnit, type Rec } from "./helpers";

describe("Health", () => {
  let health: Health;
  let unit: Rec;

  beforeEach(() => {
    unit = { health: 10 };
    health = new Health(asUnit(unit));
  });

  test("is a sense", () => {
    expect(health).toBeInstanceOf(Sense);
  });

  test("has a description", () => {
    expect(health.description).toBe("Returns an integer representing your health.");
  });

  test("has meta for type generation", () => {
    expect(health.meta).toEqual({
      params: [],
      returns: "number",
    });
  });

  describe("performing", () => {
    test("returns the amount of health", () => {
      expect(health.perform()).toBe(10);
    });
  });
});
