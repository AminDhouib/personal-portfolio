import type { LevelConfig } from "./engine/core/level-config";
import type { TurnEvent } from "./engine/core/logger";
import type { TurnRecord } from "./engine/run";
import { applyEvent, type FloorFrame, floorFrame, startState } from "./view-model";

// The playback model: a run (its starting snapshot and turn records) becomes a list of frames,
// one per event, and these pure helpers move around them. use-playback.ts drives the clock.

export interface Frame {
  index: number;
  /** 0 for the starting frame, otherwise the 1-based turn the event belongs to. */
  turn: number;
  event: TurnEvent | null;
  floor: FloorFrame;
  status: { health: number; score: number } | null;
  text: string;
}

export type Speed = "1x" | "2x" | "4x" | "instant";

export const SPEEDS: readonly Speed[] = ["1x", "2x", "4x", "instant"];

/** How long a whole turn takes to play at each speed, in milliseconds. */
export const SPEED_TURN_MS: Record<Speed, number> = { "1x": 300, "2x": 150, "4x": 75, instant: 0 };

function formatParam(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "object" && value !== null && "name" in value) {
    const { name } = value as { name: unknown };
    if (typeof name === "string") return name;
  }
  return "";
}

/** The event as a sentence: the actor's name, then the upstream template with its blanks filled. */
export function describeEvent(event: TurnEvent): string {
  const filled = event.action.description.replace(/\{(\w+)\}/g, (_match, key: string) =>
    formatParam(event.action.params[key]),
  );
  return event.actor ? `${event.actor.name} ${filled}` : filled;
}

/** One frame for the starting floor, then one per event of every turn. */
export function buildFrames(
  config: LevelConfig,
  initial: TurnEvent,
  records: readonly TurnRecord[],
): Frame[] {
  let state = startState(config);
  const frames: Frame[] = [
    {
      index: 0,
      turn: 0,
      event: null,
      floor: floorFrame(state, initial.floorMap),
      status: initial.warriorStatus ?? null,
      text: "The floor is ready.",
    },
  ];
  for (const record of records) {
    for (const event of record.events) {
      state = applyEvent(state, event);
      frames.push({
        index: frames.length,
        turn: record.t,
        event,
        floor: floorFrame(state, event.floorMap),
        status: event.warriorStatus ?? null,
        text: describeEvent(event),
      });
    }
  }
  return frames;
}

export function clampFrame(frames: readonly Frame[], index: number): number {
  return Math.min(Math.max(0, Math.floor(index)), Math.max(0, frames.length - 1));
}

export function nextFrame(frames: readonly Frame[], index: number): number {
  return clampFrame(frames, index + 1);
}

export function prevFrame(index: number): number {
  return Math.max(0, index - 1);
}

/** The frame showing the floor after `turn` has finished; turn 0 is the start. */
export function lastFrameOfTurn(frames: readonly Frame[], turn: number): number {
  if (turn <= 0) return 0;
  let found = 0;
  frames.forEach((frame, index) => {
    if (frame.turn <= turn) found = index;
  });
  return found;
}

/** This many quiet turns in a row play at the usual pace; the rest are fast-forwarded. */
const QUIET_GRACE_TURNS = 3;
/** What a fast-forwarded frame is shown for, at every speed but instant. */
const FAST_FRAME_MS = 4;

const fastTurnsCache = new WeakMap<readonly Frame[], ReadonlySet<number>>();

/**
 * The turns to fast-forward: those past the third in an unbroken stretch where nothing changed on
 * the floor or in the warrior's health and score. A program that does nothing idles until the
 * 200-turn limit, which at 300 ms a turn kept the result off screen for a minute; the log and the
 * engine are untouched, only how long each such frame is shown.
 */
function fastTurns(frames: readonly Frame[]): ReadonlySet<number> {
  const cached = fastTurnsCache.get(frames);
  if (cached) return cached;
  const fast = new Set<number>();
  let before = JSON.stringify([frames[0]?.floor, frames[0]?.status]);
  let quietRun = 0;
  let turn = 0;
  let turnChanged = false;
  const closeTurn = () => {
    if (turn === 0) return;
    quietRun = turnChanged ? 0 : quietRun + 1;
    if (quietRun > QUIET_GRACE_TURNS) fast.add(turn);
  };
  for (const frame of frames.slice(1)) {
    if (frame.turn !== turn) {
      closeTurn();
      turn = frame.turn;
      turnChanged = false;
    }
    const now = JSON.stringify([frame.floor, frame.status]);
    if (now !== before) turnChanged = true;
    before = now;
  }
  closeTurn();
  fastTurnsCache.set(frames, fast);
  return fast;
}

/** How long to show frame `index` before moving on. A turn's time is shared by its frames. */
export function frameDelayMs(frames: readonly Frame[], index: number, speed: Speed): number {
  const turnMs = SPEED_TURN_MS[speed];
  const frame = frames[index];
  if (!frame || turnMs === 0) return 0;
  if (frame.turn === 0) return turnMs;
  if (fastTurns(frames).has(frame.turn)) return FAST_FRAME_MS;
  const inTurn = frames.filter((other) => other.turn === frame.turn).length;
  return turnMs / Math.max(1, inTurn);
}
