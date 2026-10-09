// @vitest-environment node
import { describe, expect, it, vi, type Mock } from "vitest";

import { createRun, configForRef } from "../../engine/run";
import {
  allAbilityNames,
  capTurn,
  describePlayerError,
  MAX_CALLS_PER_TURN,
  RuleError,
} from "../facade";

function inner(extra: Record<string, Mock> = {}): Readonly<Record<string, Mock>> {
  return Object.freeze({
    look: vi.fn((): string => "looked"),
    think: vi.fn(),
    walk: vi.fn(),
    ...extra,
  });
}

describe("capTurn", () => {
  it("lets 1,000 calls through and throws on the 1,001st", () => {
    const turn = inner();
    const capped = capTurn(turn);
    for (let i = 0; i < MAX_CALLS_PER_TURN; i += 1) {
      expect(capped.turn.look?.()).toBe("looked");
    }
    expect(turn.look).toHaveBeenCalledTimes(1000);
    expect(() => capped.turn.look?.()).toThrow("Too many senses in one turn.");
    expect(() => capped.turn.look?.()).toThrow(RuleError);
    expect(turn.look).toHaveBeenCalledTimes(1000);
  });

  it("counts every ability, not just one", () => {
    const capped = capTurn(inner());
    for (let i = 0; i < 500; i += 1) {
      capped.turn.look?.();
      capped.turn.think?.("x");
    }
    expect(() => capped.turn.look?.()).toThrow("Too many senses in one turn.");
  });

  it("passes arguments and the result through", () => {
    const turn = inner({ feel: vi.fn((direction: unknown) => `felt ${String(direction)}`) });
    const capped = capTurn(turn);
    expect(capped.turn.feel?.("left")).toBe("felt left");
    expect(turn.feel).toHaveBeenCalledWith("left");
  });

  it("keeps 10 think lines of at most 200 chars and drops the rest silently", () => {
    const capped = capTurn(inner());
    for (let i = 0; i < 12; i += 1) {
      capped.turn.think?.(`line ${i}`);
    }
    capped.turn.think?.("y".repeat(300));
    const lines = capped.thoughts();
    expect(lines).toHaveLength(10);
    expect(lines[0]).toBe("line 0");
    expect(lines[9]).toBe("line 9");

    const long = capTurn(inner());
    long.turn.think?.("y".repeat(300));
    expect(long.thoughts()[0]).toHaveLength(200);
  });

  it("formats several think arguments like the engine does", () => {
    const capped = capTurn(inner());
    capped.turn.think?.("a", 1, { b: true });
    expect(capped.thoughts()).toEqual(['a 1 {"b":true}']);
  });

  it("is a frozen object of exactly the granted abilities", () => {
    const capped = capTurn(inner());
    expect(Object.isFrozen(capped.turn)).toBe(true);
    expect(Object.keys(capped.turn).sort()).toEqual(["look", "think", "walk"]);
    expect(capped.turn.shoot).toBeUndefined();
  });

  it("turns anything the engine throws into a rule error with the same text", () => {
    const capped = capTurn(
      inner({
        walk: vi.fn(() => {
          throw new Error("Only one action can be performed per turn.");
        }),
      }),
    );
    let caught: unknown;
    try {
      capped.turn.walk?.();
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(RuleError);
    expect((caught as Error).message).toBe("Only one action can be performed per turn.");
  });

  it("is revoked after the turn: a stored reference throws", () => {
    const turn = inner();
    const capped = capTurn(turn);
    capped.revoke();
    expect(() => capped.turn.look?.()).toThrow("That turn is over");
    expect(() => capped.turn.walk?.()).toThrow(RuleError);
    expect(turn.look).not.toHaveBeenCalled();
  });

  it("wraps a real run's facade: a second action throws the upstream text", () => {
    const run = createRun(
      configForRef({ kind: "tower", tower: "narrow-path", level: 1, epic: false }, "Knight"),
    );
    const capped = capTurn(run.beginTurn());
    capped.turn.walk?.();
    expect(() => capped.turn.walk?.()).toThrow("Only one action can be performed per turn.");
    expect(() => capped.turn.walk?.("left")).toThrow("Only one action can be performed per turn.");
    capped.revoke();
    run.endTurn();
  });

  it("wraps a real run's facade: a bad direction names the valid ones", () => {
    const run = createRun(
      configForRef({ kind: "tower", tower: "narrow-path", level: 1, epic: false }, "Knight"),
    );
    const capped = capTurn(run.beginTurn());
    expect(() => capped.turn.walk?.("north")).toThrow(
      "'north' is not a direction: use forward, right, backward or left.",
    );
    capped.revoke();
    run.endTurn();
  });
});

describe("describePlayerError", () => {
  const granted = ["walk", "think"];

  it("gives a rule error's text bare", () => {
    expect(describePlayerError(new RuleError("Too many senses in one turn."), granted)).toBe(
      "Too many senses in one turn.",
    );
  });

  it("maps a missing ability to the floor's message, in each engine's wording", () => {
    for (const message of [
      "warrior.shoot is not a function",
      "warrior.shoot is not a function. (In 'warrior.shoot()', 'warrior.shoot' is undefined)",
      "w.shoot is not a function",
    ]) {
      expect(describePlayerError(new TypeError(message), granted)).toBe(
        "This floor does not give you shoot yet.",
      );
    }
  });

  it("does not claim a granted ability or an unknown name is missing", () => {
    expect(describePlayerError(new TypeError("warrior.walk is not a function"), granted)).toBe(
      "TypeError: warrior.walk is not a function",
    );
    expect(describePlayerError(new TypeError("warrior.fly is not a function"), granted)).toBe(
      "TypeError: warrior.fly is not a function",
    );
  });

  it("survives a thrown value that cannot be printed", () => {
    const text = "Your code threw a value that could not be printed.";
    const hostile = [
      {
        toString() {
          throw new Error("no");
        },
      },
      Object.defineProperty(new Error("x"), "message", {
        get() {
          throw new Error("no");
        },
      }),
      new Proxy(
        {},
        {
          get() {
            throw new Error("no");
          },
        },
      ),
      Object.create(null),
    ];
    for (const err of hostile) {
      expect(describePlayerError(err, granted)).toBe(text);
    }
  });

  it("names the error type for the player's own errors", () => {
    expect(describePlayerError(new RangeError("too deep"), granted)).toBe("RangeError: too deep");
    expect(describePlayerError(new Error("mine"), granted)).toBe("Error: mine");
    expect(describePlayerError("a string", granted)).toBe("Error: a string");
    expect(describePlayerError({ weird: true }, granted)).toBe("Error: [object Object]");
  });

  it("keeps the message under the protocol limit", () => {
    expect(describePlayerError(new Error("x".repeat(2000)), granted).length).toBeLessThanOrEqual(
      500,
    );
  });
});

describe("allAbilityNames", () => {
  it("lists every ability any tower grants", () => {
    const names = allAbilityNames();
    for (const name of ["walk", "attack", "rest", "rescue", "pivot", "shoot", "look", "think"]) {
      expect(names).toContain(name);
    }
    expect(new Set(names).size).toBe(names.length);
  });
});
