import type { Mock } from "vitest";

import type { AbilityUnit } from "../core/ability";
import type { EffectUnit } from "../core/effect";
import type { Turn } from "../core/unit";

/** A hand-made stand-in for a unit, space or turn: whatever the code under test reads. */
export type Rec = Record<string, unknown>;

/** Hands a hand-made stand-in to code that wants a real unit. The tests supply what is read. */
export function asUnit(stub: object): AbilityUnit {
  return stub as unknown as AbilityUnit;
}

export function asEffectUnit(stub: object): EffectUnit {
  return stub as unknown as EffectUnit;
}

export function asTurn(stub: object): Turn {
  return stub as unknown as Turn;
}

/** Reads a member of a stand-in as the mock it was set up to be. */
export function mocked(member: unknown): Mock {
  return member as Mock;
}
