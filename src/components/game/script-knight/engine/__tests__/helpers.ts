import type { Mock } from "vitest";

import type { AbilityUnit } from "../core/ability";
import type { EffectUnit } from "../core/effect";
import type { TurnAction } from "../codec";
import type { Turn } from "../core/unit";
import type { LevelConfig } from "../core/level-config";
import { replayLog, type Run, type StepResult, type TurnRecord } from "../run";

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

/** Replays a log that is expected to play through; a typed failure throws, so the test fails. */
export function replayOk(config: LevelConfig, actions: readonly TurnAction[]) {
  const replay = replayLog(config, actions);
  if (!replay.ok) {
    throw new Error(`replay failed at ${replay.at}: ${replay.reason.kind}`);
  }
  return replay;
}
