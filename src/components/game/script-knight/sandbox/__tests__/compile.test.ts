// @vitest-environment node
import { describe, expect, it } from "vitest";

import { compilePlayer, playerLine } from "../compile";

const STARTER = `class Player {
  playTurn(warrior) {
    // Cool code goes here.
  }
}`;

describe("compilePlayer", () => {
  it("compiles the upstream starter", () => {
    const result = compilePlayer(STARTER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.player.playTurn).toBe("function");
      expect(result.player.playTurn({})).toBeUndefined();
    }
  });

  it("reports a syntax error as kind syntax with the engine's message", () => {
    const result = compilePlayer("class Player {\n  playTurn(w) {\n    let x = ;\n  }\n}");
    expect(result).toMatchObject({ ok: false, kind: "syntax" });
    if (!result.ok) {
      expect(result.message).toContain("Unexpected token");
    }
  });

  it("reports no class as no-player with the player-facing text", () => {
    expect(compilePlayer("const x = 1;")).toEqual({
      ok: false,
      kind: "no-player",
      message: "You must define a Player class.",
      line: null,
    });
  });

  it("reports a Player that is not a function as no-player", () => {
    expect(compilePlayer("const Player = 5;")).toMatchObject({ ok: false, kind: "no-player" });
  });

  it("reports a class without playTurn as no-play-turn", () => {
    expect(compilePlayer("class Player { walk() {} }")).toEqual({
      ok: false,
      kind: "no-play-turn",
      message: "Your Player class must define a playTurn method.",
      line: null,
    });
  });

  it("reports a throwing constructor as kind constructor, with its line", () => {
    const result = compilePlayer(
      "class Player {\n  constructor() {\n    throw new Error('boom');\n  }\n  playTurn() {}\n}",
    );
    expect(result).toEqual({
      ok: false,
      kind: "constructor",
      message: "Your Player constructor threw: Error: boom",
      line: 3,
    });
  });

  it("reports code that throws while loading as kind constructor", () => {
    const result = compilePlayer("nope();\nclass Player { playTurn() {} }");
    expect(result).toMatchObject({ ok: false, kind: "constructor", line: 1 });
    if (!result.ok) {
      expect(result.message).toContain("ReferenceError");
    }
  });

  it("runs the player's code in strict mode", () => {
    const result = compilePlayer("class Player { playTurn() { undeclared = 1; } }");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(() => result.player.playTurn({})).toThrow(ReferenceError);
    }
  });

  it("does not see the compile function's own variables", () => {
    const result = compilePlayer("class Player { playTurn(w) { w.seen = typeof code; } }");
    const turn: Record<string, unknown> = {};
    if (!result.ok) throw new Error("expected the player to compile");
    result.player.playTurn(turn as never);
    expect(turn.seen).toBe("undefined");
  });
});

describe("playerLine", () => {
  it("reads the player's line from a real V8 stack, minus the prepended line", () => {
    const result = compilePlayer("class Player {\n  playTurn() {\n    undefinedThing();\n  }\n}");
    if (!result.ok) throw new Error("expected the player to compile");
    let caught: unknown;
    try {
      result.player.playTurn({});
    } catch (err) {
      caught = err;
    }
    expect(playerLine(caught)).toBe(3);
  });

  it("reads a recorded V8 (Chrome, Edge) stack", () => {
    const err = new Error("x");
    err.stack = [
      "ReferenceError: foo is not defined",
      "    at Player.playTurn (eval at compilePlayer (https://example.test/_next/static/chunks/w.js:1:2), <anonymous>:9:11)",
      "    at handleRun (https://example.test/_next/static/chunks/w.js:5:6)",
    ].join("\n");
    expect(playerLine(err)).toBe(6);
  });

  it("skips frames outside the player's code", () => {
    const err = new Error("x");
    err.stack = [
      "Error: Too many senses in one turn.",
      "    at look (https://example.test/_next/static/chunks/w.js:77:11)",
      "    at new Function (<anonymous>)",
      "    at eval (eval at compilePlayer (https://example.test/w.js:1:2), <anonymous>:5:3)",
    ].join("\n");
    expect(playerLine(err)).toBe(2);
  });

  it("reads a Gecko (Firefox) stack in its documented format", () => {
    const err = new Error("x");
    err.stack = [
      "playTurn@https://example.test/_next/static/chunks/w.js line 1 > Function:9:11",
      "handleRun@https://example.test/_next/static/chunks/w.js:5:6",
    ].join("\n");
    expect(playerLine(err)).toBe(6);
  });

  it("returns null for a stack with no player frame, or a non-error", () => {
    const err = new Error("x");
    err.stack = "Error: x\n    at foo (https://example.test/w.js:1:1)";
    expect(playerLine(err)).toBeNull();
    expect(playerLine("boom")).toBeNull();
    expect(playerLine(null)).toBeNull();
    expect(playerLine({ stack: 5 })).toBeNull();
  });

  it("returns null for a frame inside the prepended lines", () => {
    const err = new Error("x");
    err.stack = "Error: x\n    at eval (eval at c (https://e.test/w.js:1:2), <anonymous>:2:1)";
    expect(playerLine(err)).toBeNull();
  });
});

describe("compilePlayer: promises", () => {
  const MESSAGE = "playTurn must not be async: return after choosing one action.";

  it("throws when playTurn is async or returns a thenable", () => {
    for (const body of [
      "async playTurn(w) { await 1; }",
      "playTurn(w) { return new Promise(() => {}); }",
      "playTurn(w) { return { then() {} }; }",
      "playTurn(w) { return { get then() { return () => {}; } }; }",
    ]) {
      const result = compilePlayer(`class Player { ${body} }`);
      if (!result.ok) throw new Error("expected the player to compile");
      expect(() => result.player.playTurn({})).toThrow(MESSAGE);
    }
  });

  it("lets a plain return value through", () => {
    const result = compilePlayer("class Player { playTurn(w) { return 5; } }");
    if (!result.ok) throw new Error("expected the player to compile");
    expect(() => result.player.playTurn({})).not.toThrow();
  });

  it("reports a constructor that returns a promise", () => {
    const result = compilePlayer(
      "class Player { constructor() { return Promise.resolve(); } playTurn() {} }",
    );
    expect(result).toMatchObject({ ok: false, kind: "constructor" });
    if (!result.ok) expect(result.message).toBe("Your Player constructor must not be async.");
  });
});
