import type { RunFailure, RunStatus } from "./engine/run";
import type { RunOutcome } from "./sandbox/run-client";

// What the player reads when a run does not simply pass: the failure table in the plan's
// "Decisions 7", one sentence per case. The engine's own words (a rule broken, a thrown error)
// come through unchanged; the framing around them is ours.

export interface OutcomeMessage {
  text: string;
  /** Offer a Retry button: the failure was the sandbox's, not the player's code. */
  retry: boolean;
}

function onLine(text: string, line: number | null): string {
  return line === null ? text : `Line ${line}: ${text}`;
}

function describeTimeout(phase: "load" | "turn" | "run", t: number): OutcomeMessage {
  switch (phase) {
    case "load":
      return {
        text: "Your code did not finish loading within 1 second. Look for a loop at the top level or in the constructor.",
        retry: false,
      };
    case "turn":
      return {
        text: `Turn ${t}: your code ran longer than 0.25 s and was stopped. Look for a loop that never ends.`,
        retry: false,
      };
    case "run":
      return { text: "The run took longer than 5 seconds in all and was stopped.", retry: false };
  }
}

/** The message for how the sandbox ended, or null when it ended normally. */
export function describeOutcome(outcome: RunOutcome): OutcomeMessage | null {
  switch (outcome.kind) {
    case "finished":
      return null;
    case "compile-error": {
      const { message, line } = outcome.error;
      return { text: onLine(message, line), retry: false };
    }
    case "player-error": {
      const where = outcome.line === null ? "" : ` (line ${outcome.line})`;
      return { text: `Turn ${outcome.t}: ${outcome.message}${where}`, retry: false };
    }
    case "timeout":
      return describeTimeout(outcome.phase, outcome.t);
    case "crash":
      return { text: "The sandbox stopped unexpectedly.", retry: true };
    case "no-worker":
      return { text: "Your browser blocks Web Workers, so code cannot run here.", retry: false };
    case "cancelled":
      return { text: "Run stopped.", retry: false };
  }
}

/** The ending of a run that reached the engine's own verdict, or null when it passed. */
export function describeEnd(status: RunStatus, failure: RunFailure | null): string | null {
  switch (status) {
    case "playing":
    case "passed":
      return null;
    case "failed":
      return "Your knight fell before reaching the stairs.";
    case "out-of-turns":
      return "Out of turns: 200 turns passed without reaching the stairs.";
    case "engine-error": {
      const cause = failure && "message" in failure ? ` (${failure.message})` : "";
      return `The game engine stopped on an unexpected error${cause}. The turns so far are shown.`;
    }
  }
}
