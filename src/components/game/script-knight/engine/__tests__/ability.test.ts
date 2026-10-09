// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Ability.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { describe, expect, test, vi } from "vitest";
import { Ability, type AbilityMeta, Action, Sense } from "../core/ability";

class ConcreteAction extends Action {
  readonly description = "test action";
  readonly meta: AbilityMeta = { params: [], returns: "void" };
  perform = vi.fn();
}

class ConcreteSense extends Sense {
  readonly description = "test sense";
  readonly meta: AbilityMeta = { params: [], returns: "number" };
  perform = vi.fn(() => 42);
}

describe("Ability", () => {
  test("stores unit reference", () => {
    const unit = {} as never;
    const action = new ConcreteAction(unit);
    expect(action).toBeInstanceOf(Ability);
  });

  test("Action and Sense both extend Ability", () => {
    expect(new ConcreteAction({} as never)).toBeInstanceOf(Ability);
    expect(new ConcreteSense({} as never)).toBeInstanceOf(Ability);
  });
});
