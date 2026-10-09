// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { decodeLog } from "../../engine/codec";
import type { LevelRef } from "../../engine/level-ref";
import fixtures from "../../engine/__tests__/fixtures/upstream-runs.json";
import { parseFromWorker, type FromWorker, type ToWorker } from "../protocol";
import { handleRun, turnFailureMessage } from "../worker-core";

const NARROW_1: LevelRef = { kind: "tower", tower: "narrow-path", level: 1, epic: false };
const WALKER = "class Player { playTurn(warrior) { warrior.walk(); } }";

function runMessage(code: string, level: LevelRef = NARROW_1): ToWorker {
  return { type: "run", code, language: "javascript", level };
}

function harness() {
  const posted: FromWorker[] = [];
  return { posted, post: (message: FromWorker) => void posted.push(message), scope: {} };
}

function fixtureFor(level: number) {
  const run = fixtures.find(
    (f) => f.tower === "narrow-path" && f.level === level && f.epic === false,
  );
  if (!run) throw new Error("fixture missing");
  return run;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handleRun", () => {
  it("plays Narrow Path 1: ready, one turn message per turn, done", () => {
    const { posted, post, scope } = harness();
    handleRun(runMessage(WALKER), post, scope);

    const fixture = fixtureFor(1);
    expect(posted[0]).toEqual({ type: "ready" });
    expect(posted.at(-1)).toEqual({ type: "done" });
    const turns = posted.filter((m) => m.type === "turn");
    expect(turns).toHaveLength(fixture.turns);
    expect(turns.map((m) => m.t)).toEqual(Array.from({ length: fixture.turns }, (_, i) => i + 1));

    const tokens = turns.map((m) => m.a).join("");
    expect(decodeLog(`1:${tokens}`)).toEqual(decodeLog(fixture.log));
    for (const message of posted) {
      expect(parseFromWorker(message)).toEqual(message);
    }
  });

  it("posts the think lines of each turn", () => {
    const { posted, post, scope } = harness();
    handleRun(
      runMessage("class Player { playTurn(w) { w.think('hello', 2); w.walk(); } }"),
      post,
      scope,
    );
    const first = posted.find((m) => m.type === "turn");
    expect(first).toMatchObject({ t: 1, a: "w-", thoughts: ["hello 2"] });
  });

  it("posts a compile error and stops, without ready", () => {
    const { posted, post, scope } = harness();
    handleRun(runMessage("class Player { playTurn( {"), post, scope);
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ type: "compile-error", kind: "syntax" });

    const none = harness();
    handleRun(runMessage("const x = 1;"), none.post, none.scope);
    expect(none.posted).toEqual([
      {
        type: "compile-error",
        kind: "no-player",
        message: "You must define a Player class.",
        line: null,
      },
    ]);
  });

  it("posts player-error with the turn and the player's line when playTurn throws", () => {
    const { posted, post, scope } = harness();
    const code = [
      "class Player {",
      "  playTurn(warrior) {",
      "    if (this.n === undefined) this.n = 0;",
      "    this.n += 1;",
      "    if (this.n === 3) { null.boom; }",
      "    warrior.walk();",
      "  }",
      "}",
    ].join("\n");
    handleRun(runMessage(code), post, scope);

    expect(posted.filter((m) => m.type === "turn")).toHaveLength(2);
    const last = posted.at(-1);
    expect(last).toMatchObject({ type: "player-error", t: 3, line: 5 });
    expect((last as { message: string }).message).toMatch(/^TypeError: /);
    expect(posted.some((m) => m.type === "done")).toBe(false);
  });

  it("reports each broken rule with the exact text", () => {
    const cases: Array<[string, string]> = [
      [
        "class Player { playTurn(w) { w.walk(); w.walk(); } }",
        "Only one action can be performed per turn.",
      ],
      [
        "class Player { playTurn(w) { w.walk('north'); } }",
        "'north' is not a direction: use forward, right, backward or left.",
      ],
      ["class Player { playTurn(w) { w.shoot(); } }", "This floor does not give you shoot yet."],
      [
        "class Player { playTurn(w) { for (;;) { w.think('x'); } } }",
        "Too many senses in one turn.",
      ],
    ];
    for (const [code, message] of cases) {
      const { posted, post, scope } = harness();
      handleRun(runMessage(code), post, scope);
      expect(posted.at(-1)).toMatchObject({ type: "player-error", t: 1, message });
    }
  });

  it("locks down before any player code runs, and the player cannot post", () => {
    const g = globalThis as Record<string, unknown>;
    const forged = vi.fn();
    g.skSentinelFetch = () => "network";
    g.postMessage = forged;
    try {
      const { posted, post, scope } = harness();
      const lock = vi.fn(() => {
        delete g.skSentinelFetch;
        delete g.postMessage;
        return { removed: ["skSentinelFetch", "postMessage"], stuck: [] };
      });
      // The top-level line runs while the code is compiled; playTurn runs later.
      const code = [
        "const atLoad = typeof skSentinelFetch;",
        "class Player {",
        "  playTurn(w) {",
        "    w.think(atLoad, typeof skSentinelFetch, typeof postMessage);",
        "    try { postMessage({ type: 'done' }); } catch (e) { w.think(e.name); }",
        "    w.walk();",
        "  }",
        "}",
      ].join("\n");
      handleRun(runMessage(code), post, scope, lock);

      expect(lock).toHaveBeenCalledWith(scope);
      const first = posted.find((m) => m.type === "turn");
      expect(first).toMatchObject({
        thoughts: ["undefined undefined undefined", "ReferenceError"],
      });
      expect(forged).not.toHaveBeenCalled();
      expect(posted.filter((m) => m.type === "done")).toHaveLength(1);
    } finally {
      delete g.skSentinelFetch;
      delete g.postMessage;
    }
  });

  it("really locks the scope it is given", () => {
    const scope: Record<string, unknown> = { fetch: () => 1, setTimeout: () => 2, keep: 3 };
    const { post } = harness();
    handleRun(runMessage(WALKER), post, scope);
    expect(scope.fetch).toBeUndefined();
    expect("setTimeout" in scope).toBe(false);
    expect(scope.keep).toBe(3);
  });

  it("refuses to run when the lock-down could not remove a name", () => {
    const { posted, post, scope } = harness();
    const lock = () => ({ removed: [], stuck: ["navigator"] });
    expect(() => handleRun(runMessage(WALKER), post, scope, lock)).toThrow(
      "The sandbox could not start (navigator).",
    );
    expect(posted).toEqual([]);
  });

  it("ignores every message after the first run", () => {
    const { posted, post, scope } = harness();
    handleRun(runMessage(WALKER), post, scope);
    const count = posted.length;
    handleRun(runMessage(WALKER), post, scope);
    handleRun(runMessage("class Player { playTurn() { throw 1; } }"), post, scope);
    expect(posted).toHaveLength(count);

    const other = harness();
    handleRun(runMessage(WALKER), other.post, other.scope);
    expect(other.posted.length).toBe(count);
  });

  it("throws on a message that is not a run, so the page sees a crash", () => {
    for (const bad of [
      null,
      "run",
      { type: "run" },
      { ...runMessage(WALKER), language: "python" },
    ]) {
      const { posted, post, scope } = harness();
      expect(() => handleRun(bad, post, scope)).toThrow();
      expect(posted).toEqual([]);
    }
  });

  it("throws for a floor it cannot build", () => {
    const bad: LevelRef[] = [
      { kind: "tower", tower: "narrow-path", level: 99, epic: false },
      { kind: "daily", day: "2026-10-09" },
    ];
    for (const level of bad) {
      const { post, scope } = harness();
      expect(() => handleRun(runMessage(WALKER, level), post, scope)).toThrow();
    }
  });

  it("ends an unwinnable run at turn 200 with done", () => {
    const { posted, post, scope } = harness();
    handleRun(runMessage("class Player { playTurn(w) { w.walk('backward'); } }"), post, scope);
    // Walking into the wall every turn never passes: the engine ends the run at turn 200.
    expect(posted.filter((m) => m.type === "turn")).toHaveLength(200);
    expect(posted.at(-1)).toEqual({ type: "done" });
  });

  it("throws, so the page sees a crash, when the engine fails inside a turn", () => {
    const { posted, post, scope } = harness();
    const original = Array.prototype.forEach;
    const code = [
      "class Player {",
      "  playTurn(w) {",
      "    Array.prototype.forEach = function () { throw new Error('engine broke'); };",
      "    w.walk();",
      "  }",
      "}",
    ].join("\n");
    try {
      expect(() => handleRun(runMessage(code), post, scope)).toThrow(
        "The sandbox engine failed: engine broke",
      );
    } finally {
      Array.prototype.forEach = original;
    }
    expect(posted.some((m) => m.type === "turn" || m.type === "done")).toBe(false);
  });
});

describe("turnFailureMessage", () => {
  it("words each typed failure for the player", () => {
    expect(turnFailureMessage({ kind: "ungranted-action", action: "shoot" })).toBe(
      "This floor does not give you shoot yet.",
    );
    expect(
      turnFailureMessage({ kind: "invalid-action", message: "'north' is not a direction." }),
    ).toBe("'north' is not a direction.");
    expect(turnFailureMessage({ kind: "run-over" })).toBe("The run is over.");
  });
});
