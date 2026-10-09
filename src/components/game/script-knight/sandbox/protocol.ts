import { decodeLog } from "../engine/codec";
import type { LevelRef } from "../engine/level-ref";

/** What the main thread posts to the worker, once per run. */
export type ToWorker = { type: "run"; code: string; language: "javascript"; level: LevelRef };

export type CompileErrorKind = "syntax" | "no-player" | "no-play-turn" | "constructor";

export type FromWorker =
  | { type: "ready" }
  | { type: "turn"; t: number; a: string; thoughts: string[] }
  | { type: "done" }
  | { type: "compile-error"; kind: CompileErrorKind; message: string; line: number | null }
  | { type: "player-error"; t: number; message: string; line: number | null };

export const MAX_MESSAGE_CHARS = 500;
export const MAX_THOUGHT_LINES = 10;
export const MAX_THOUGHT_CHARS = 200;
const MAX_TURN = 200;
const COMPILE_KINDS: readonly string[] = ["syntax", "no-player", "no-play-turn", "constructor"];

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const own = Object.keys(value);
  return own.length === keys.length && keys.every((key) => own.includes(key));
}

function isTurnNumber(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= MAX_TURN;
}

function isLine(value: unknown): value is number | null {
  return value === null || (Number.isInteger(value) && (value as number) >= 1);
}

function isMessage(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_MESSAGE_CHARS;
}

/** True for exactly one action token of the codec, such as "w-" or "a0". */
function isToken(value: unknown): value is string {
  return typeof value === "string" && decodeLog(`1:${value}`)?.length === 1;
}

function isThoughts(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_THOUGHT_LINES &&
    value.every((line) => typeof line === "string" && line.length <= MAX_THOUGHT_CHARS)
  );
}

/**
 * Strict guard for what the main thread accepts from the worker. Anything that does not fit
 * exactly is null: the run client ends the run as a crash rather than trusting it.
 */
export function parseFromWorker(data: unknown): FromWorker | null {
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return null;
  }
  const msg = data as Record<string, unknown>;
  switch (msg.type) {
    case "ready":
      return hasExactKeys(msg, ["type"]) ? { type: "ready" } : null;
    case "done":
      return hasExactKeys(msg, ["type"]) ? { type: "done" } : null;
    case "turn":
      return hasExactKeys(msg, ["type", "t", "a", "thoughts"]) &&
        isTurnNumber(msg.t) &&
        isToken(msg.a) &&
        isThoughts(msg.thoughts)
        ? { type: "turn", t: msg.t, a: msg.a, thoughts: [...msg.thoughts] }
        : null;
    case "compile-error":
      return hasExactKeys(msg, ["type", "kind", "message", "line"]) &&
        typeof msg.kind === "string" &&
        COMPILE_KINDS.includes(msg.kind) &&
        isMessage(msg.message) &&
        isLine(msg.line)
        ? {
            type: "compile-error",
            kind: msg.kind as CompileErrorKind,
            message: msg.message,
            line: msg.line,
          }
        : null;
    case "player-error":
      return hasExactKeys(msg, ["type", "t", "message", "line"]) &&
        isTurnNumber(msg.t) &&
        isMessage(msg.message) &&
        isLine(msg.line)
        ? { type: "player-error", t: msg.t, message: msg.message, line: msg.line }
        : null;
    default:
      return null;
  }
}
