import { decodeLog } from "./engine/codec";
import type { LevelConfig } from "./engine/core/level-config";
import { buildFrames, type Frame, lastFrameOfTurn } from "./playback";
import { createRun, replayLog } from "./engine/run";
import type { FrameUnit } from "./view-model";

// The ghost is your best log for the same day, replayed beside a new run as a translucent knight.
// It is only ever drawn: it reads the stored log, never writes, and no run, score or proof sees it.

/** The frames of the ghost's run on `config`, or null when its log does not play there. */
export function ghostFrames(config: LevelConfig, log: string): Frame[] | null {
  const actions = decodeLog(log);
  if (actions === null || actions.length === 0) return null;
  const replayed = replayLog(config, actions);
  if (!replayed.ok || replayed.consumed !== actions.length) return null;
  return buildFrames(config, createRun(config).initial, replayed.records);
}

/**
 * Where the ghost knight stands when the player's run is on `turn`. After the ghost's own run
 * has ended it stays where it finished; null when the ghost has no knight on the floor.
 */
export function ghostKnightAt(frames: readonly Frame[], turn: number): FrameUnit | null {
  const frame = frames[lastFrameOfTurn(frames, turn)];
  return frame?.floor.units.find((unit) => unit.warrior) ?? null;
}
