// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MAX_SAVE_BUDGET,
  MAX_SAVE_LOG_CHARS,
  MAX_SAVE_TICKS,
  MAX_SEED_CHARS,
  parseSave,
  SAVE_KEY,
} from "../save-schema";

// failover:save:v1 is the seed plus the action log, not the state: loading it
// replays the run to `tick`. This file pins the stored shape and every way a
// stored value can be wrong, before any of the code that writes or reads it.

const VALID = {
  v: 1,
  savedAt: 1_760_000_000_000,
  mode: "survival",
  seed: "run-1",
  tick: 400,
  // place type 2 on cell (10, 10) at tick 0, then retire at tick 100 (a delta of 100).
  log: "0,0,2,10,10,100,8",
} as const;

const parse = (value: unknown) => parseSave(value);

describe("failover:save:v1 shape", () => {
  it("has its own key and the pinned caps", () => {
    expect(SAVE_KEY).toBe("failover:save:v1");
    expect(MAX_SAVE_TICKS).toBe(36_000);
    expect(MAX_SAVE_LOG_CHARS).toBe(12_000);
    expect(MAX_SEED_CHARS).toBe(64);
    expect(MAX_SAVE_BUDGET).toBe(1_000_000);
  });

  it("accepts exactly {v, savedAt, mode, seed, tick, log}", () => {
    expect(parse(VALID)).toEqual(VALID);
  });

  it("accepts a sandbox save with its budget, and no budget at all", () => {
    expect(parse({ ...VALID, mode: "sandbox", budget: 2500 })).toEqual({
      ...VALID,
      mode: "sandbox",
      budget: 2500,
    });
    expect(parse({ ...VALID, mode: "sandbox" })).toEqual({ ...VALID, mode: "sandbox" });
  });

  it("accepts an empty log and a save at tick 0", () => {
    expect(parse({ ...VALID, log: "", tick: 0 })).toEqual({ ...VALID, log: "", tick: 0 });
  });

  it("accepts a log with an action on the save tick, and the caps themselves", () => {
    expect(parse({ ...VALID, tick: 100 })).not.toBeNull();
    expect(parse({ ...VALID, tick: MAX_SAVE_TICKS })).not.toBeNull();
    expect(parse({ ...VALID, seed: "s".repeat(MAX_SEED_CHARS) })).not.toBeNull();
    expect(parse({ ...VALID, mode: "sandbox", budget: MAX_SAVE_BUDGET })).not.toBeNull();
    expect(parse({ ...VALID, mode: "sandbox", budget: 0 })).not.toBeNull();
  });

  it("accepts a full 700-action log and rejects the 701st", () => {
    const retire = (n: number) => Array.from({ length: n }, () => "0,8").join(",");
    expect(parse({ ...VALID, log: retire(700), tick: 0 })).not.toBeNull();
    expect(parse({ ...VALID, log: retire(701), tick: 0 })).toBeNull();
  });
});

describe("failover:save:v1 rejects", () => {
  it("unknown versions and a missing or mistyped version", () => {
    for (const v of [0, 2, 3, -1, 1.5, "1", null, undefined, true, [1], { v: 1 }]) {
      expect(parse({ ...VALID, v }), String(v)).toBeNull();
    }
    const { v: _v, ...noVersion } = VALID;
    expect(parse(noVersion)).toBeNull();
  });

  it("a missing key, one at a time", () => {
    for (const key of Object.keys(VALID)) {
      const copy: Record<string, unknown> = { ...VALID };
      delete copy[key];
      expect(parse(copy), key).toBeNull();
    }
  });

  it("an unknown extra key, so a forward write is never half read", () => {
    expect(parse({ ...VALID, extra: 1 })).toBeNull();
    expect(parse({ ...VALID, state: {} })).toBeNull();
  });

  it("a bad savedAt", () => {
    for (const savedAt of [-1, 1.5, Number.NaN, Infinity, -Infinity, 1e300, "1", null, [], {}]) {
      expect(parse({ ...VALID, savedAt }), String(savedAt)).toBeNull();
    }
  });

  it("a bad mode", () => {
    for (const mode of ["daily", "Survival", "", "__proto__", 1, null, ["survival"]]) {
      expect(parse({ ...VALID, mode }), String(mode)).toBeNull();
    }
  });

  it("a bad seed", () => {
    for (const seed of ["", "s".repeat(MAX_SEED_CHARS + 1), 7, null, ["a"], {}]) {
      expect(parse({ ...VALID, seed }), String(seed)).toBeNull();
    }
  });

  it("a bad tick", () => {
    const ticks = [-1, 1.5, Number.NaN, Infinity, 1e300, MAX_SAVE_TICKS + 1, "400", null, []];
    for (const tick of ticks) {
      expect(parse({ ...VALID, tick }), String(tick)).toBeNull();
    }
  });

  it("a bad budget, and any budget outside sandbox", () => {
    const sandbox = { ...VALID, mode: "sandbox" };
    for (const budget of [
      -1,
      1.5,
      Number.NaN,
      Infinity,
      1e300,
      MAX_SAVE_BUDGET + 1,
      "2000",
      null,
    ]) {
      expect(parse({ ...sandbox, budget }), String(budget)).toBeNull();
    }
    expect(parse({ ...VALID, budget: 2000 })).toBeNull();
  });

  it("a log that is not a string", () => {
    for (const log of [null, 0, [], [[0, 8]], {}, ["0,8"], true]) {
      expect(parse({ ...VALID, log }), JSON.stringify(log)).toBeNull();
    }
  });

  it("a log over the character cap, however it is shaped", () => {
    expect(parse({ ...VALID, log: "0".repeat(MAX_SAVE_LOG_CHARS + 1) })).toBeNull();
    expect(parse({ ...VALID, log: "0,8,".repeat(MAX_SAVE_LOG_CHARS) })).toBeNull();
  });

  it("a log the proof parser refuses", () => {
    const bad = [
      " 0,8",
      "0, 8",
      "0,8,",
      ",0,8",
      "0",
      "0,9",
      "0,0,2,10",
      "0,0,99,10,10",
      "0,0,2,31,10",
      "+0,8",
      "-1,8",
      "1.5,8",
      "1e3,8",
      "00,8",
      "0x1,8",
      "NaN,8",
      "0,8;0,8",
      "9007199254740993,8",
    ];
    for (const log of bad) expect(parse({ ...VALID, log }), log).toBeNull();
  });

  it("a log that runs past the save's own tick", () => {
    // The retire is at tick 100.
    expect(parse({ ...VALID, tick: 99 })).toBeNull();
  });

  it("a huge array where the log string should be", () => {
    expect(parse({ ...VALID, log: Array.from({ length: 100_000 }, () => "0,8") })).toBeNull();
  });
});

describe("failover:save:v1 hostile input", () => {
  it("rejects anything that is not an object, without throwing", () => {
    for (const raw of [
      null,
      undefined,
      0,
      1,
      "",
      "{}",
      true,
      [],
      [VALID],
      () => VALID,
      Symbol("x"),
    ]) {
      expect(parse(raw)).toBeNull();
    }
  });

  it("rejects a JSON __proto__ or constructor key, and does not pollute", () => {
    const proto = JSON.parse(`{"__proto__":{"polluted":true},"v":1}`) as unknown;
    expect(parse(proto)).toBeNull();
    const withProto = JSON.parse(
      `{"v":1,"savedAt":1,"mode":"survival","seed":"a","tick":0,"log":"","__proto__":{"polluted":true}}`,
    ) as unknown;
    expect(parse(withProto)).toBeNull();
    expect(parse({ ...VALID, constructor: { prototype: { polluted: true } } })).toBeNull();
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("does not read values off the prototype", () => {
    const inherited = Object.create(VALID) as unknown;
    expect(parse(inherited)).toBeNull();
  });

  it("does not throw on an object that throws when read", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
        ownKeys() {
          throw new Error("boom");
        },
        getOwnPropertyDescriptor() {
          throw new Error("boom");
        },
      },
    );
    expect(parse(hostile)).toBeNull();
  });

  it("returns a copy, so a caller cannot reach the input through the result", () => {
    const input = { ...VALID };
    const out = parse(input);
    expect(out).not.toBe(input);
  });
});
