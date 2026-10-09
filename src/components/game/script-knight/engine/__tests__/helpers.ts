import type { Mock } from "vitest";

import type { AbilityUnit } from "../core/ability";
import type { EffectUnit } from "../core/effect";
import type { TurnAction } from "../codec";
import type { Turn } from "../core/unit";
import type { Run, StepResult, TurnRecord } from "../run";

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

function expectRecord(result: StepResult): TurnRecord {
  if (!result.ok) {
    throw new Error(`step failed: ${result.reason.kind}`);
  }
  return result.record;
}

/** Steps a run and returns the turn record; a failed step throws, so a test that expects one fails. */
export function stepOk(run: Run, action: TurnAction): TurnRecord {
  return expectRecord(run.step(action));
}

/** Ends the turn in progress and returns its record; a failed turn throws. */
export function endOk(run: Run): TurnRecord {
  return expectRecord(run.endTurn());
}
