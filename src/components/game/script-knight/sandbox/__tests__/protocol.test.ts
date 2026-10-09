// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseFromWorker } from "../protocol";

describe("parseFromWorker", () => {
  it("accepts each shape", () => {
    expect(parseFromWorker({ type: "ready" })).toEqual({ type: "ready" });
    expect(parseFromWorker({ type: "done" })).toEqual({ type: "done" });
    expect(parseFromWorker({ type: "turn", t: 1, a: "w-", thoughts: [] })).toEqual({
      type: "turn",
      t: 1,
      a: "w-",
      thoughts: [],
    });
    expect(parseFromWorker({ type: "turn", t: 200, a: ".-", thoughts: ["hi", "there"] })).not.toBe(
      null,
    );
    expect(
      parseFromWorker({
        type: "compile-error",
        kind: "syntax",
        message: "Unexpected token '}'",
        line: 4,
      }),
    ).not.toBe(null);
    expect(
      parseFromWorker({ type: "compile-error", kind: "no-player", message: "m", line: null }),
    ).not.toBe(null);
    expect(
      parseFromWorker({ type: "player-error", t: 3, message: "TypeError: x", line: 7 }),
    ).not.toBe(null);
  });

  it("rejects things that are not objects or have an unknown type", () => {
    for (const bad of [null, undefined, 1, "ready", [], { type: "nope" }, {}, { type: 1 }]) {
      expect(parseFromWorker(bad)).toBeNull();
    }
  });

  it("rejects extra keys", () => {
    expect(parseFromWorker({ type: "ready", extra: 1 })).toBeNull();
    expect(parseFromWorker({ type: "done", extra: 1 })).toBeNull();
    expect(parseFromWorker({ type: "turn", t: 1, a: "w-", thoughts: [], extra: 1 })).toBeNull();
    expect(
      parseFromWorker({ type: "player-error", t: 1, message: "m", line: null, extra: 1 }),
    ).toBeNull();
  });

  it("rejects wrong types and a missing field", () => {
    expect(parseFromWorker({ type: "turn", t: "1", a: "w-", thoughts: [] })).toBeNull();
    expect(parseFromWorker({ type: "turn", t: 1.5, a: "w-", thoughts: [] })).toBeNull();
    expect(parseFromWorker({ type: "turn", t: 1, a: "w-" })).toBeNull();
    expect(parseFromWorker({ type: "turn", t: 1, a: "w-", thoughts: "hi" })).toBeNull();
    expect(parseFromWorker({ type: "turn", t: 1, a: "w-", thoughts: [1] })).toBeNull();
    expect(parseFromWorker({ type: "player-error", t: 1, message: 5, line: null })).toBeNull();
    expect(parseFromWorker({ type: "player-error", t: 1, message: "m", line: "7" })).toBeNull();
    expect(
      parseFromWorker({ type: "compile-error", kind: "other", message: "m", line: null }),
    ).toBeNull();
  });

  it("rejects an action that is not exactly one token", () => {
    for (const a of ["", "w", "w-w-", "x-", "w9", "r0", "1:w-", "w-\n"]) {
      expect(parseFromWorker({ type: "turn", t: 1, a, thoughts: [] })).toBeNull();
    }
    for (const a of ["w-", "a0", "p3", "r-", ".-", "h1", "b2", "d-", "s1"]) {
      expect(parseFromWorker({ type: "turn", t: 1, a, thoughts: [] })).not.toBeNull();
    }
  });

  it("rejects a turn number outside 1 to 200", () => {
    expect(parseFromWorker({ type: "turn", t: 0, a: "w-", thoughts: [] })).toBeNull();
    expect(parseFromWorker({ type: "turn", t: 201, a: "w-", thoughts: [] })).toBeNull();
    expect(parseFromWorker({ type: "player-error", t: 201, message: "m", line: null })).toBeNull();
  });

  it("rejects messages over 500 chars and thoughts past the caps", () => {
    const long = "x".repeat(501);
    expect(
      parseFromWorker({ type: "player-error", t: 1, message: "x".repeat(500), line: null }),
    ).not.toBeNull();
    expect(parseFromWorker({ type: "player-error", t: 1, message: long, line: null })).toBeNull();
    expect(
      parseFromWorker({ type: "compile-error", kind: "syntax", message: long, line: null }),
    ).toBeNull();
    const ten = Array.from({ length: 10 }, () => "a");
    expect(parseFromWorker({ type: "turn", t: 1, a: "w-", thoughts: ten })).not.toBeNull();
    expect(parseFromWorker({ type: "turn", t: 1, a: "w-", thoughts: [...ten, "a"] })).toBeNull();
    expect(
      parseFromWorker({ type: "turn", t: 1, a: "w-", thoughts: ["x".repeat(201)] }),
    ).toBeNull();
  });

  it("rejects a line that is not a positive integer or null", () => {
    for (const line of [0, -1, 1.5, Number.NaN, undefined]) {
      expect(parseFromWorker({ type: "player-error", t: 1, message: "m", line })).toBeNull();
    }
  });
});
