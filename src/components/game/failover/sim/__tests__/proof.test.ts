// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { MAX_LOGGED_ACTIONS } from "../action-log";
import { CONFIG, SERVICE_TYPES } from "../config";
import { encodeProof, parseProof } from "../proof";
import { replay } from "../replay";
import { resetSim } from "../state";
import { BOARD_S, MID_RUN_S, play } from "./scripted";

afterEach(() => resetSim({ seed: "after-proof" }));

// The arcade route caps a proof at 12,000 characters (ARCADE_PROOF_MAX_CHARS).
const PROOF_CAP = 12_000;
const TILE = CONFIG.tileSize;
const HALF_CELLS = CONFIG.gridSize / 2;
const TICKS = 18000;

type Entry = readonly number[];

/**
 * The longest proof for an entry shape. The cap on ticks (18,000) is spent to maximise
 * the digits of the tick deltas: every delta first grows to two digits (10 ticks
 * each), and the rest of the budget buys third digits at 90 ticks apiece. That is 122
 * deltas of 100 and 578 of 10, 17,980 ticks in all.
 */
function worstCase(shape: (tick: number) => Entry): Entry[] {
  const hundreds = Math.floor((TICKS - 10 * MAX_LOGGED_ACTIONS) / 90);
  let tick = 0;
  return Array.from({ length: MAX_LOGGED_ACTIONS }, (_, i) => {
    tick += i < hundreds ? 100 : 10;
    return shape(tick);
  });
}

const worstPlace = (tick: number): Entry => [
  tick,
  0,
  SERVICE_TYPES.length - 1,
  HALF_CELLS * TILE,
  HALF_CELLS * TILE,
];
const worstLink = (tick: number): Entry => [tick, 1, 699, 700];
const worstOne = (tick: number): Entry => [tick, 4, 700];

describe("proof encoding", () => {
  it("round-trips a real recorded run", () => {
    const run = play("proof-day", "survival", [...BOARD_S, ...MID_RUN_S], 2400);
    const proof = encodeProof(run.log);
    expect(parseProof(proof)).toEqual(run.log);
    const again = replay({
      seed: "proof-day",
      mode: "survival",
      log: parseProof(proof) ?? [],
      ticks: run.ticks,
    });
    expect(again.hash).toBe(run.hash);
  });

  it("an empty log is an empty proof", () => {
    expect(encodeProof([])).toBe("");
    expect(parseProof("")).toEqual([]);
  });

  it("writes tick deltas and grid cells, not absolute ticks and world units", () => {
    const proof = encodeProof([
      [10, 0, 2, -8, 12],
      [15, 4, 3],
      [15, 8],
    ]);
    // delta 10, op 0, type 2, cell (-8/4 + 15, 12/4 + 15); delta 5; delta 0
    expect(proof).toBe("10,0,2,13,18,5,4,3,0,8");
  });

  it("fits the 12,000 character cap with 700 of the longest actions", () => {
    for (const [name, shape] of [
      ["place", worstPlace],
      ["link", worstLink],
      ["one-argument", worstOne],
    ] as const) {
      const proof = encodeProof(worstCase(shape));
      expect(proof.length, name).toBeLessThan(PROOF_CAP);
    }
  });

  it("the true worst case is 9,921 characters, pinned", () => {
    const deltas = worstCase(worstPlace).map((e, i, all) => (e[0] ?? 0) - (all[i - 1]?.[0] ?? 0));
    expect(deltas.filter((d) => d === 100)).toHaveLength(122);
    expect(deltas.filter((d) => d === 10)).toHaveLength(578);
    expect(worstCase(worstPlace).at(-1)?.[0]).toBe(17980);
    expect(encodeProof(worstCase(worstPlace)).length).toBe(9921);
    expect(encodeProof(worstCase(worstLink)).length).toBeLessThan(9921);
    expect(encodeProof(worstCase(worstOne)).length).toBeLessThan(9921);
  });

  it("a lone late action is still one short entry", () => {
    expect(encodeProof([[17999, 8]])).toBe("17999,8");
  });

  it("refuses a position that is not on the grid", () => {
    expect(() => encodeProof([[1, 0, 0, 3, 0]])).toThrow(RangeError);
    expect(() => encodeProof([[1, 0, 0, 4000, 0]])).toThrow(RangeError);
  });

  it("refuses ticks that run backwards", () => {
    expect(() =>
      encodeProof([
        [5, 8],
        [4, 8],
      ]),
    ).toThrow(RangeError);
  });
});

describe("proof parsing", () => {
  it("accepts exactly 700 actions and rejects the 701st", () => {
    const retire = (n: number): string => Array.from({ length: n }, () => "0,8").join(",");
    expect(parseProof(retire(MAX_LOGGED_ACTIONS))?.length).toBe(MAX_LOGGED_ACTIONS);
    expect(parseProof(retire(MAX_LOGGED_ACTIONS + 1))).toBeNull();
  });

  it("rejects a 11,999 character proof of the shortest action repeated", () => {
    const proof = "0,8,".repeat(2999) + "0,8";
    expect(proof.length).toBe(11999);
    expect(parseProof(proof)).toBeNull();
  });

  it("returns null, never throws, for input that is not a string", () => {
    for (const bad of [null, undefined, 7, {}, [], ["0,8"], true]) {
      expect(parseProof(bad)).toBeNull();
    }
  });

  it("rejects a service type index past the last type", () => {
    const last = SERVICE_TYPES.length - 1;
    expect(parseProof(`1,0,${last},3,3`)).not.toBeNull();
    expect(parseProof(`1,0,${last + 1},3,3`)).toBeNull();
  });

  it("the last grid cell (30) is valid and the one past it (31) is not", () => {
    expect(parseProof("1,0,2,30,30")).toEqual([[1, 0, 2, 60, 60]]);
    expect(parseProof("1,0,2,31,3")).toBeNull();
    expect(parseProof("1,0,2,3,31")).toBeNull();
    expect(() => encodeProof([[1, 0, 0, 60, 60]])).not.toThrow();
    expect(() => encodeProof([[1, 0, 0, 64, 0]])).toThrow(RangeError);
    expect(() => encodeProof([[1, 0, 0, 0, 64]])).toThrow(RangeError);
  });

  it("rejects deltas whose running tick passes the safe integers", () => {
    expect(parseProof("9007199254740991,8")).not.toBeNull();
    expect(parseProof("9007199254740991,8,1,8")).toBeNull();
  });

  const bad = [
    "x",
    "1,2,",
    ",1",
    "1,0,2,13",
    "1,9",
    "1,4",
    "1,4,3,2",
    "1.5,8",
    "-1,8",
    "1,0,2,99,3",
    "1,8,0",
    "01,8",
    "1e2,8",
    " 1,8",
  ];
  for (const proof of bad) {
    it(`rejects ${JSON.stringify(proof)}`, () => {
      expect(parseProof(proof)).toBeNull();
    });
  }

  it("rejects a delta that would overflow a safe integer tick", () => {
    expect(parseProof("9007199254740993,8")).toBeNull();
  });
});
