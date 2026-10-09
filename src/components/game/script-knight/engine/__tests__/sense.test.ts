// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Sense.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { describe, expect, test, vi } from "vitest";
import { Ability, type AbilityMeta, Action, Sense } from "../core/ability";

class TestSense extends Sense {
  readonly description = "test sense";
  readonly meta: AbilityMeta = { params: [], returns: "number" };
  perform = vi.fn(() => 42);
}

describe("Sense", () => {
  test("extends Ability", () => {
    const sense = new TestSense({} as never);
    expect(sense).toBeInstanceOf(Ability);
    expect(sense).toBeInstanceOf(Sense);
  });

  test("is not an instance of Action", () => {
    const sense = new TestSense({} as never);
    expect(sense).not.toBeInstanceOf(Action);
  });

  test("has description and meta", () => {
    const sense = new TestSense({} as never);
    expect(sense.description).toBe("test sense");
    expect(sense.meta).toEqual({ params: [], returns: "number" });
  });

  test("perform returns a value", () => {
    const sense = new TestSense({} as never);
    expect(sense.perform()).toBe(42);
  });
});
