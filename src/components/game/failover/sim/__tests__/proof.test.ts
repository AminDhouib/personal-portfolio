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

/** The longest entry of each shape, spread over the run so the tick deltas sum to the cap. */
function worstCase(shape: (tick: number) => Entry): Entry[] {
  const step = Math.floor(TICKS / MAX_LOGGED_ACTIONS);
  return Array.from({ length: MAX_LOGGED_ACTIONS }, (_, i) => shape((i + 1) * step));
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

  it("measured: 700 worst-case placements, links and upgrades", () => {
    const sizes = {
      place: encodeProof(worstCase(worstPlace)).length,
      link: encodeProof(worstCase(worstLink)).length,
      one: encodeProof(worstCase(worstOne)).length,
    };
    // Recorded so a format change that bloats the proof is a visible edit.
    expect(sizes.place).toBeLessThanOrEqual(10_000);
    expect(sizes.link).toBeLessThanOrEqual(9_500);
    expect(sizes.one).toBeLessThanOrEqual(7_500);
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
