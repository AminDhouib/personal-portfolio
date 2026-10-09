import { configForRef, createRun } from "../engine/run";
import type { TurnAction } from "../engine/codec";
import type { TowerId } from "../engine/towers";
import { buildFrames, type Frame } from "../playback";

/** Plays a tower floor with the given actions and returns its playback frames. */
export function towerFrames(
  tower: TowerId,
  level: number,
  actions: TurnAction[],
  epic = false,
): Frame[] {
  const config = configForRef({ kind: "tower", tower, level, epic }, "Knight");
  const run = createRun(config);
  const records = [];
  for (const action of actions) {
    const stepped = run.step(action);
    if (!stepped.ok) throw new Error(stepped.reason.kind);
    records.push(stepped.record);
  }
  return buildFrames(config, run.initial, records);
}
