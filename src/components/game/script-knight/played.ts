import { dailyFloor } from "./daily";
import type { TurnAction } from "./engine/codec";
import type { LevelConfig } from "./engine/core/level-config";
import type { LevelRef } from "./engine/level-ref";
import { playWithBot } from "./engine/reference-bot";
import { configForRef, createRun, replayLog, type RunResult } from "./engine/run";
import { buildFrames, type Frame } from "./playback";
import { WARRIOR_NAME } from "./run-floor";

/** A log played on the main thread with the pure engine: what the viewer and the bot show. */
export interface Played {
  ref: LevelRef;
  config: LevelConfig;
  frames: Frame[];
  result: RunResult;
  actions: TurnAction[];
}

/** The floor a ref names, or null when it names none (a level that does not exist). */
export function configForAnyRef(ref: LevelRef): LevelConfig | null {
  try {
    return ref.kind === "daily" ? dailyFloor(ref.day).config : configForRef(ref, WARRIOR_NAME);
  } catch {
    // silent-ok: a ref from a link or a stored value can name a floor that is not there
    return null;
  }
}

/**
 * Replays `actions` on the floor `ref` names. Null when the log does not play there: an action
 * the floor does not grant, an engine error, or actions left over after the run ended.
 */
export function playLog(ref: LevelRef, actions: readonly TurnAction[]): Played | null {
  const config = configForAnyRef(ref);
  if (config === null) return null;
  const replayed = replayLog(config, actions);
  if (!replayed.ok || replayed.consumed !== actions.length) return null;
  return {
    ref,
    config,
    frames: buildFrames(config, createRun(config).initial, replayed.records),
    result: replayed.result,
    actions: [...actions],
  };
}

/** The reference bot's run on a floor: local, never scored or posted. Null for a floor not there. */
export function botPlayed(ref: LevelRef): Played | null {
  const config = configForAnyRef(ref);
  if (config === null) return null;
  return playLog(ref, playWithBot(config).actions);
}
