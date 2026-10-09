"use client";

import { useCallback, useMemo, useState } from "react";
import { dailyFloor } from "./daily";
import { encodeLog, invalidActionReason, type TurnAction } from "./engine/codec";
import type { LevelConfig } from "./engine/core/level-config";
import type { LevelRef } from "./engine/level-ref";
import {
  configForRef,
  createRun,
  type RunFailure,
  type RunResult,
  type RunStatus,
  type TurnRecord,
} from "./engine/run";
import { describeEnd } from "./messages";
import { buildFrames, type Frame } from "./playback";
import type { FloorRun } from "./run-floor";
import { WARRIOR_NAME } from "./run-floor";

/** A floor played by hand, as far as it got. */
export interface HandReplay {
  frames: Frame[];
  records: TurnRecord[];
  status: RunStatus;
  failure: RunFailure | null;
  result: RunResult;
  /** The action log of the turns played: the same string a code run of those moves produces. */
  log: string;
}

/**
 * Plays `actions` from the start on a fresh run (the engine is deterministic, so this is also how
 * undo works). An action the engine refuses ends the replay there: the pad only offers granted
 * actions, so that can only be a double tap after the run ended.
 */
export function replayHand(config: LevelConfig, actions: readonly TurnAction[]): HandReplay {
  const run = createRun(config);
  const records: TurnRecord[] = [];
  for (const action of actions) {
    const stepped = run.step(action);
    if (!stepped.ok) break;
    records.push(stepped.record);
  }
  return {
    frames: buildFrames(config, run.initial, records),
    records,
    status: run.status,
    failure: run.failure,
    result: run.result(),
    log: encodeLog(records.map((record) => record.action)),
  };
}

/** The configuration a floor reference plays on (towers by number, the daily by its UTC day). */
export function configOfRef(ref: LevelRef): LevelConfig {
  return ref.kind === "daily" ? dailyFloor(ref.day).config : configForRef(ref, WARRIOR_NAME);
}

/** A finished hand run in the shape the result card and the board read. */
export function handFloorRun(ref: LevelRef, config: LevelConfig, hand: HandReplay): FloorRun {
  return {
    ref,
    config,
    frames: hand.frames,
    status: hand.status,
    failure: hand.failure,
    result: hand.result,
    log: hand.log,
    thoughts: [],
    outcome: null,
    end: describeEnd(hand.status, hand.failure),
    ranNothing: false,
  };
}

export interface HandRun extends HandReplay {
  /** The replay itself, one stable object per change, for memo dependencies. */
  replay: HandReplay;
  /** True while the run is still being played. */
  playing: boolean;
  turns: number;
  /** Plays one turn; false when the action is refused (malformed, or the run is over). */
  act: (action: TurnAction) => boolean;
  /** Takes back the last turn by replaying the log minus its last action. */
  undo: () => void;
  restart: () => void;
}

/**
 * Hand mode's run: the engine on the main thread (no player code runs, so no worker), one action
 * per tap. A new floor starts a new run.
 */
export function useHandRun(config: LevelConfig): HandRun {
  const [actions, setActions] = useState<TurnAction[]>([]);
  const [seen, setSeen] = useState(config);
  if (seen !== config) {
    setSeen(config);
    setActions([]);
  }
  const replay = useMemo(() => replayHand(config, actions), [config, actions]);
  const turns = replay.records.length;
  const playing = replay.status === "playing";

  const act = useCallback(
    (action: TurnAction) => {
      if (!playing || invalidActionReason(action) !== null) return false;
      // Taps in one batch each see the same closure, so this only appends; the replay ignores any
      // action past the end of the run, and undo cuts back to the turns that count.
      setActions((previous) => [...previous, action]);
      return true;
    },
    [playing],
  );
  const undo = useCallback(
    () => setActions((previous) => previous.slice(0, Math.max(0, turns - 1))),
    [turns],
  );
  const restart = useCallback(() => setActions([]), []);

  return { ...replay, replay, playing, turns, act, undo, restart };
}
