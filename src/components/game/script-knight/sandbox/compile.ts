import type { CompileErrorKind } from "./protocol";
import type { WarriorTurn } from "../engine/facade";
import { RuleError } from "./facade";

export type CompileResult =
  | { ok: true; player: { playTurn: (turn: WarriorTurn) => void } }
  | { ok: false; kind: CompileErrorKind; message: string; line: number | null };

const PREAMBLE = '"use strict";\n';
const EPILOGUE = '\n;return typeof Player === "function" ? Player : undefined;';
/**
 * Lines before the player's first one. The preamble is one. The Function constructor wraps the
 * body as `function anonymous(\n) {\n<body>\n}`, which puts two more lines in front of it, so
 * the first player line is body line 2 and the reported line is 3 higher than the player's own.
 */
const LINES_BEFORE_PLAYER = 3;

/** `<anonymous>:L:C` in V8 (Chrome, Edge) and `Function:L:C` / `eval:L:C` in Gecko. */
const V8_FRAME = /<anonymous>:(\d+):\d+\)?\s*$/m;
const GECKO_FRAME = /(?:Function|eval):(\d+):\d+\s*$/m;

/** The 1-based line in the player's code for an error thrown from it, or null. */
export function playerLine(err: unknown): number | null {
  const stack = typeof err === "object" && err !== null ? (err as { stack?: unknown }).stack : null;
  if (typeof stack !== "string") {
    return null;
  }
  const match = V8_FRAME.exec(stack) ?? GECKO_FRAME.exec(stack);
  const line = match ? Number(match[1]) - LINES_BEFORE_PLAYER : 0;
  return line >= 1 ? line : null;
}

const ASYNC_MESSAGE = "playTurn must not be async: return after choosing one action.";

function isThenable(value: unknown): boolean {
  return (
    (typeof value === "object" || typeof value === "function") &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function describeError(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
}

function fail(kind: CompileErrorKind, message: string, line: number | null): CompileResult {
  return { ok: false, kind, message, line };
}

/**
 * Turns the player's source into a `Player` instance. This is the one place player code is
 * evaluated, and it only ever runs inside the locked-down worker, never on the main thread or
 * the server (DESIGN.md register).
 */
export function compilePlayer(code: string): CompileResult {
  let factory: () => unknown;
  try {
    // The one place player code is evaluated: only inside the locked-down worker, never on the
    // main thread or the server (DESIGN.md register).
    factory = new Function(PREAMBLE + code + EPILOGUE) as () => unknown;
  } catch (err) {
    // silent-ok: the error is returned to the player as a compile error
    return fail("syntax", err instanceof Error ? err.message : String(err), null);
  }

  let PlayerClass: unknown;
  try {
    PlayerClass = factory();
  } catch (err) {
    // silent-ok: the error is returned to the player as a load error
    return fail(
      "constructor",
      `Your code threw while loading: ${describeError(err)}`,
      playerLine(err),
    );
  }
  if (typeof PlayerClass !== "function") {
    return fail("no-player", "You must define a Player class.", null);
  }

  let player: unknown;
  try {
    player = new (PlayerClass as new () => unknown)();
  } catch (err) {
    // silent-ok: the error is returned to the player as a constructor error
    return fail(
      "constructor",
      `Your Player constructor threw: ${describeError(err)}`,
      playerLine(err),
    );
  }
  if (isThenable(player)) {
    return fail("constructor", "Your Player constructor must not be async.", null);
  }
  const playTurn = (player as { playTurn?: unknown } | null)?.playTurn;
  if (typeof playTurn !== "function") {
    return fail("no-play-turn", "Your Player class must define a playTurn method.", null);
  }
  return {
    ok: true,
    player: {
      playTurn: (turn) => {
        const returned = (playTurn as (t: WarriorTurn) => unknown).call(player, turn);
        // An async playTurn would choose its action after the turn is over: refuse it loudly
        // instead of letting every turn idle.
        if (isThenable(returned)) {
          throw new RuleError(ASYNC_MESSAGE);
        }
      },
    },
  };
}
