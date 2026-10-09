// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/units/src/Captive.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { beforeEach, describe, expect, test } from "vitest";
import { Unit } from "../core/unit";
import { Captive } from "../units";

describe("Captive", () => {
  let captive: Captive;

  beforeEach(() => {
    captive = new Captive();
  });

  test("extends Unit", () => {
    expect(captive).toBeInstanceOf(Unit);
  });

  test("has 1 max health", () => {
    expect(captive.maxHealth).toBe(1);
  });

  test("has a reward of 20 points", () => {
    expect(captive.reward).toBe(20);
  });

  test("is not an enemy", () => {
    expect(captive.enemy).toBe(false);
  });

  test("is bound", () => {
    expect(captive.bound).toBe(true);
  });
});
