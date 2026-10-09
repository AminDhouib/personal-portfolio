import { encodeAction } from "../engine/codec";
import type { LevelRef } from "../engine/level-ref";
import { configForRef, createRun, type RunFailure } from "../engine/run";
import { isTowerId } from "../engine/towers";
import { compilePlayer, playerLine } from "./compile";
import { capTurn, describePlayerError } from "./facade";
import { lockDown } from "./lockdown";
import type { FromWorker, ToWorker } from "./protocol";

/** The warrior's display name inside the engine; the page never shows it. */
const WARRIOR_NAME = "Knight";

/** Scopes that have already taken their one run. */
const started = new WeakSet<object>();

function isLevelRef(value: unknown): value is LevelRef {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const ref = value as Record<string, unknown>;
  if (ref.kind === "daily") {
    return typeof ref.day === "string";
  }
  return (
    ref.kind === "tower" &&
    isTowerId(ref.tower) &&
    Number.isInteger(ref.level) &&
    typeof ref.epic === "boolean"
  );
}

function isRunMessage(value: unknown): value is ToWorker {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const msg = value as Record<string, unknown>;
  return (
    msg.type === "run" &&
    typeof msg.code === "string" &&
    msg.language === "javascript" &&
    isLevelRef(msg.level)
  );
}

/** The text the player sees for a typed failure that is theirs (not an engine error). */
export function turnFailureMessage(reason: RunFailure): string {
  switch (reason.kind) {
    case "ungranted-action":
      return `This floor does not give you ${reason.action} yet.`;
    case "invalid-action":
      return reason.message;
    case "run-over":
      return "The run is over.";
    case "engine-error":
      return reason.message;
  }
}

/**
 * The worker's whole job, testable without a Worker: build the floor, lock the scope down,
 * compile the player, then play turns and post one message per turn. Only the first message a
 * scope sees is a run; the rest are ignored. A message that is not a valid run, a floor that
 * cannot be built, or a lock-down that could not finish all throw, which the page sees as a
 * crash. Nothing posted here is trusted by the page: it re-simulates from the action tokens.
 */
export function handleRun(
  data: unknown,
  post: (message: FromWorker) => void,
  scope: object,
  lock: typeof lockDown = lockDown,
): void {
  if (started.has(scope)) {
    return;
  }
  started.add(scope);
  if (!isRunMessage(data)) {
    throw new Error("The sandbox got a message that is not a run.");
  }
  if (data.level.kind !== "tower") {
    throw new Error("Daily floors cannot run in the sandbox yet.");
  }

  // Level configs hold classes, so they are rebuilt here from the ref and never posted.
  const run = createRun(configForRef(data.level, WARRIOR_NAME));
  const granted = Object.keys(run.config.floor.warrior.abilities ?? {});

  const { stuck } = lock(scope);
  if (stuck.length > 0) {
    throw new Error(`The sandbox could not start (${stuck.join(", ")}).`);
  }

  const compiled = compilePlayer(data.code);
  if (!compiled.ok) {
    post({
      type: "compile-error",
      kind: compiled.kind,
      message: compiled.message.slice(0, 500),
      line: compiled.line,
    });
    return;
  }
  post({ type: "ready" });

  while (run.status === "playing") {
    const t = run.turnCount + 1;
    const turn = capTurn(run.beginTurn());
    try {
      compiled.player.playTurn(turn.turn);
    } catch (err) {
      // silent-ok: the error is posted to the page as the player's error for this turn
      turn.revoke();
      post({
        type: "player-error",
        t,
        message: describePlayerError(err, granted),
        line: playerLine(err),
      });
      return;
    }
    turn.revoke();
    const stepped = run.endTurn();
    if (!stepped.ok) {
      if (stepped.reason.kind === "engine-error") {
        // Deliberate: an engine failure is not the player's error; the page sees a crash.
        throw new Error(`The sandbox engine failed: ${stepped.reason.message}`);
      }
      post({
        type: "player-error",
        t,
        message: turnFailureMessage(stepped.reason).slice(0, 500),
        line: null,
      });
      return;
    }
    post({ type: "turn", t, a: encodeAction(stepped.record.action), thoughts: turn.thoughts() });
  }
  post({ type: "done" });
}
