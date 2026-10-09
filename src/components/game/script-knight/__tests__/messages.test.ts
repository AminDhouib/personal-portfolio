import { describe, expect, it } from "vitest";
import { describeEnd, describeOutcome } from "../messages";
import type { RunOutcome } from "../sandbox/run-client";

describe("describeOutcome", () => {
  it("says nothing about a finished run: the engine's ending speaks", () => {
    expect(describeOutcome({ kind: "finished", log: "1:w-", thoughts: [] })).toBeNull();
  });

  it("puts a syntax error on its line", () => {
    expect(
      describeOutcome({
        kind: "compile-error",
        error: { kind: "syntax", message: "Unexpected token '}'", line: 4 },
      }),
    ).toEqual({ text: "Line 4: Unexpected token '}'", retry: false });
  });

  it("leaves a syntax error without a line as the browser worded it", () => {
    expect(
      describeOutcome({
        kind: "compile-error",
        error: { kind: "syntax", message: "Unexpected end of input", line: null },
      })?.text,
    ).toBe("Unexpected end of input");
  });

  it("passes the friendly Player errors through", () => {
    expect(
      describeOutcome({
        kind: "compile-error",
        error: { kind: "no-player", message: "You must define a Player class.", line: null },
      })?.text,
    ).toBe("You must define a Player class.");
    expect(
      describeOutcome({
        kind: "compile-error",
        error: {
          kind: "no-play-turn",
          message: "Your Player class must define a playTurn method.",
          line: null,
        },
      })?.text,
    ).toBe("Your Player class must define a playTurn method.");
    expect(
      describeOutcome({
        kind: "compile-error",
        error: {
          kind: "constructor",
          message: "Your Player constructor threw: TypeError: x is not a function",
          line: 3,
        },
      })?.text,
    ).toBe("Line 3: Your Player constructor threw: TypeError: x is not a function");
  });

  it("names the turn and line of an error thrown by playTurn", () => {
    expect(
      describeOutcome({
        kind: "player-error",
        log: "1:w-w-",
        t: 3,
        message: "TypeError: warrior.nope is not a function",
        line: 7,
      }),
    ).toEqual({ text: "Turn 3: TypeError: warrior.nope is not a function (line 7)", retry: false });
    expect(
      describeOutcome({
        kind: "player-error",
        log: "",
        t: 1,
        message: "Only one action can be performed per turn.",
        line: null,
      })?.text,
    ).toBe("Turn 1: Only one action can be performed per turn.");
  });

  it("explains each watchdog timeout", () => {
    const load: RunOutcome = { kind: "timeout", log: "1:", phase: "load", t: 1 };
    expect(describeOutcome(load)?.text).toBe(
      "Your code did not finish loading within 1 second. Look for a loop at the top level or in the constructor.",
    );
    const turn: RunOutcome = { kind: "timeout", log: "1:w-", phase: "turn", t: 2 };
    expect(describeOutcome(turn)?.text).toBe(
      "Turn 2: your code ran longer than 0.25 s and was stopped. Look for a loop that never ends.",
    );
    const run: RunOutcome = { kind: "timeout", log: "1:w-", phase: "run", t: 2 };
    expect(describeOutcome(run)?.text).toBe(
      "The run took longer than 5 seconds in all and was stopped.",
    );
  });

  it("shows an async playTurn as the sandbox words it, on its turn", () => {
    expect(
      describeOutcome({
        kind: "player-error",
        log: "1:w-",
        t: 2,
        message: "playTurn must not be async: return after choosing one action.",
        line: null,
      }),
    ).toEqual({
      text: "Turn 2: playTurn must not be async: return after choosing one action.",
      retry: false,
    });
  });

  it("explains a sandbox that never booted, with a retry", () => {
    const boot: RunOutcome = { kind: "timeout", log: "1:", phase: "boot", t: 1 };
    expect(describeOutcome(boot)).toEqual({ text: "The sandbox could not start.", retry: true });
  });

  it("offers a retry after a crash", () => {
    expect(describeOutcome({ kind: "crash", log: "1:" })).toEqual({
      text: "The sandbox stopped unexpectedly.",
      retry: true,
    });
  });

  it("says Workers are blocked, and does not promise a mode that is not there yet", () => {
    const message = describeOutcome({ kind: "no-worker" });
    expect(message?.text).toBe("Your browser blocks Web Workers, so code cannot run here.");
    expect(message?.text).not.toMatch(/by hand/);
  });

  it("acknowledges a cancelled run", () => {
    expect(describeOutcome({ kind: "cancelled", log: "1:" })?.text).toBe("Run stopped.");
  });
});

describe("describeEnd", () => {
  it("is silent while playing and on a pass", () => {
    expect(describeEnd("playing", null)).toBeNull();
    expect(describeEnd("passed", null)).toBeNull();
  });

  it("says the knight fell", () => {
    expect(describeEnd("failed", null)).toBe("Your knight fell before reaching the stairs.");
  });

  it("says out of turns the way upstream does not", () => {
    expect(describeEnd("out-of-turns", null)).toBe(
      "Out of turns: 200 turns passed without reaching the stairs.",
    );
  });

  it("reports an engine error with its cause", () => {
    expect(describeEnd("engine-error", { kind: "engine-error", message: "boom" })).toBe(
      "The game engine stopped on an unexpected error (boom). The turns so far are shown.",
    );
  });
});
