// @vitest-environment node
import { describe, expect, it } from "vitest";

import { mulberry32 } from "@/components/game/password-game-2/engine/rng";
import {
  ACTION_LOG_RE,
  type ActionName,
  type Direction,
  decodeLog,
  encodeAction,
  encodeLog,
  LOG_VERSION,
  MAX_LOG_TOKENS,
  type TurnAction,
} from "../codec";

const LETTERS: Record<ActionName, string> = {
  walk: "w",
  attack: "a",
  rest: "r",
  rescue: "s",
  pivot: "p",
  shoot: "h",
  bind: "b",
  detonate: "d",
};
const DIRECTIONS: Direction[] = ["forward", "right", "backward", "left"];

describe("encodeAction input checks", () => {
  const bad: unknown[] = [
    { name: "walk", direction: "north" },
    { name: "undefined", direction: null },
    { name: "think", direction: null },
    { name: "constructor", direction: null },
    { name: "rest", direction: "left" },
    { name: "walk", direction: undefined },
    { name: "walk" },
    "walk",
    42,
    undefined,
    [],
  ];
  it.each(bad.map((value) => [JSON.stringify(value) ?? "undefined", value] as const))(
    "throws for %s instead of writing a log decodeLog would reject",
    (_label, value) => {
      expect(() => encodeAction(value as TurnAction)).toThrow();
    },
  );

  it("still encodes every valid action", () => {
    expect(encodeAction({ name: "detonate", direction: "left" })).toBe("d3");
    expect(encodeAction({ name: "walk", direction: null })).toBe("w-");
    expect(encodeAction(null)).toBe(".-");
  });
});

describe("action-log codec", () => {
  it("pins the version and the token cap", () => {
    expect(LOG_VERSION).toBe("1");
    expect(MAX_LOG_TOKENS).toBe(200);
  });

  it("round-trips every letter with every digit", () => {
    for (const [name, letter] of Object.entries(LETTERS) as [ActionName, string][]) {
      if (name === "rest") continue;
      DIRECTIONS.forEach((direction, index) => {
        expect(encodeAction({ name, direction })).toBe(`${letter}${index}`);
        expect(decodeLog(`1:${letter}${index}`)).toEqual([{ name, direction }]);
      });
      expect(encodeAction({ name, direction: null })).toBe(`${letter}-`);
      expect(decodeLog(`1:${letter}-`)).toEqual([{ name, direction: null }]);
    }
  });

  it("encodes rest without a direction and an idle turn as dot dash", () => {
    expect(encodeAction({ name: "rest", direction: null })).toBe("r-");
    expect(encodeAction(null)).toBe(".-");
    expect(decodeLog("1:r-.-")).toEqual([{ name: "rest", direction: null }, null]);
  });

  it("encodes a whole log behind the version prefix", () => {
    const actions: TurnAction[] = [
      { name: "walk", direction: "forward" },
      null,
      { name: "pivot", direction: null },
    ];
    expect(encodeLog(actions)).toBe("1:w0.-p-");
    expect(decodeLog(encodeLog(actions))).toEqual(actions);
  });

  it("refuses to encode a rest with a direction", () => {
    expect(() => encodeAction({ name: "rest", direction: "forward" })).toThrow();
  });

  it("decodes the empty log to an empty list", () => {
    expect(decodeLog("1:")).toEqual([]);
    expect(encodeLog([])).toBe("1:");
  });

  it("rejects a rest with a direction digit and an idle with one", () => {
    expect(decodeLog("1:r0")).toBeNull();
    expect(decodeLog("1:.0")).toBeNull();
  });

  it("rejects 201 tokens and accepts 200", () => {
    expect(decodeLog(`1:${"w0".repeat(200)}`)).toHaveLength(200);
    expect(decodeLog(`1:${"w0".repeat(201)}`)).toBeNull();
    expect(() => encodeLog(Array.from({ length: 201 }, () => null))).toThrow();
  });

  it("rejects a missing or different version prefix", () => {
    expect(decodeLog("w0")).toBeNull();
    expect(decodeLog("2:w0")).toBeNull();
    expect(decodeLog("0:w0")).toBeNull();
    expect(decodeLog(":w0")).toBeNull();
    expect(decodeLog("")).toBeNull();
  });

  it("rejects bad letters, bad digits, odd lengths and stray text", () => {
    for (const text of [
      "1:x0",
      "1:w4",
      "1:w",
      "1:w00",
      "1:W0",
      "1:w0 ",
      " 1:w0",
      "1:w0\n",
      "1:w9",
    ]) {
      expect(decodeLog(text)).toBeNull();
    }
    expect(decodeLog(undefined as never)).toBeNull();
  });

  it("agrees with the regex on 500 seeded random strings", () => {
    const rng = mulberry32(0x5eed);
    const alphabet = "1:wars.hpbd0123-4x \n";
    let valid = 0;
    for (let i = 0; i < 500; i++) {
      // Half the strings start from a well-formed log and get one character corrupted.
      let text: string;
      if (i % 2 === 0) {
        const length = Math.floor(rng() * 6);
        text = "1:";
        for (let k = 0; k < length; k++) {
          text += "warshpbd."[Math.floor(rng() * 9)];
          text += "0123-"[Math.floor(rng() * 5)];
        }
      } else {
        const length = Math.floor(rng() * 10);
        text = "";
        for (let k = 0; k < length; k++) text += alphabet[Math.floor(rng() * alphabet.length)];
      }
      const decoded = decodeLog(text);
      if (decoded !== null) valid++;
      expect(decoded !== null).toBe(ACTION_LOG_RE.test(text));
      if (decoded !== null) expect(encodeLog(decoded)).toBe(text);
    }
    expect(valid).toBeGreaterThan(20);
  });
});
