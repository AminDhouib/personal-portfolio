// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Action.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { describe, expect, test, vi } from "vitest";
import { Ability, type AbilityMeta, Action, Sense } from "../core/ability";

class TestAction extends Action {
  readonly description = "test action";
  readonly meta: AbilityMeta = { params: [], returns: "void" };
  perform = vi.fn();

  static with(config: { power: number }) {
    return [TestAction, config] as const;
  }
}

describe("Action", () => {
  test("extends Ability", () => {
    const action = new TestAction({} as never);
    expect(action).toBeInstanceOf(Ability);
    expect(action).toBeInstanceOf(Action);
  });

  test("is not an instance of Sense", () => {
    const action = new TestAction({} as never);
    expect(action).not.toBeInstanceOf(Sense);
  });

  test("has description and meta", () => {
    const action = new TestAction({} as never);
    expect(action.description).toBe("test action");
    expect(action.meta).toEqual({ params: [], returns: "void" });
  });

  test("perform can be called", () => {
    const action = new TestAction({} as never);
    action.perform();
    expect(action.perform).toHaveBeenCalled();
  });

  test(".with() returns an AbilityBinding", () => {
    const binding = TestAction.with({ power: 5 });
    expect(binding[0]).toBe(TestAction);
    expect(binding[1]).toEqual({ power: 5 });
  });
});
