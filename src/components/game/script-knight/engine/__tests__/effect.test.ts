// @vitest-environment node
// Ported from WarriorJS (https://github.com/olistic/warriorjs, bc68e87), libs/core/src/Effect.test.ts.
// Copyright (c) 2015-present Matias Olivera. MIT licence: see ../LICENSE.
// Modified by Amin Dhouib, 2026: imports and types for the local engine.

import { describe, expect, test, vi } from "vitest";
import { Effect } from "../core/effect";
import { asEffectUnit } from "./helpers";

class TestEffect extends Effect {
  readonly description = "test effect";
  passTurn = vi.fn();
  trigger = vi.fn();

  static with(config: { time: number }) {
    return [TestEffect, config] as const;
  }
}

describe("Effect", () => {
  test("stores unit reference", () => {
    const unit = { log: vi.fn() };
    const effect = new TestEffect(asEffectUnit(unit));
    expect(effect).toBeInstanceOf(Effect);
  });

  test("has description", () => {
    const effect = new TestEffect(asEffectUnit({}));
    expect(effect.description).toBe("test effect");
  });

  test("passTurn can be called", () => {
    const effect = new TestEffect(asEffectUnit({}));
    effect.passTurn();
    expect(effect.passTurn).toHaveBeenCalled();
  });

  test("trigger can be called", () => {
    const effect = new TestEffect(asEffectUnit({}));
    effect.trigger();
    expect(effect.trigger).toHaveBeenCalled();
  });

  test(".with() returns an EffectBinding", () => {
    const binding = TestEffect.with({ time: 5 });
    expect(binding[0]).toBe(TestEffect);
    expect(binding[1]).toEqual({ time: 5 });
  });
});
