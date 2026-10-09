// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { dispatch, MAX_LOGGED_ACTIONS, type Action } from "../action-log";
import { stateHash } from "../hash";
import { encodeProof, parseProof } from "../proof";
import { replay } from "../replay";
import { resetSim, S } from "../state";
import { step } from "../tick";

// Only accepted actions are recorded. A refusal changes nothing the hash or the
// RNG sees (it can only queue a view event), so leaving it out of the log cannot
// change a replay, and a stray click can never make a run unprovable.

afterEach(() => resetSim({ seed: "after-refused" }));

const TICKS = 600;

/** Refusals of every kind dispatch has: tile, bounds, edge rules, missing, not upgradable, not scalable, healthy. */
const STRAY: Action[] = [
  { op: 0, type: "waf", x: 4000, z: 0 },
  { op: 0, type: "alb", x: 0, z: 0 },
  { op: 0, type: "compute", x: 1, z: 1 },
  { op: 1, from: "svc_1", to: "svc_1" },
  { op: 1, from: "svc_2", to: "svc_1" },
  { op: 1, from: "internet", to: "svc_99" },
  { op: 2, from: "svc_2", to: "svc_1" },
  { op: 3, id: "svc_99" },
  { op: 4, id: "svc_99" },
  { op: 4, id: "svc_1" },
  { op: 5, id: "svc_1" },
  { op: 6, id: "svc_1" },
];

function board(): void {
  dispatch({ op: 0, type: "waf", x: 0, z: 0 });
  dispatch({ op: 0, type: "alb", x: 8, z: 0 });
  dispatch({ op: 1, from: "internet", to: "svc_1" });
  dispatch({ op: 1, from: "svc_1", to: "svc_2" });
}

function run(withStray: boolean): { log: typeof S.log; hash: number } {
  resetSim({ seed: "refused", mode: "survival" });
  board();
  step(100);
  if (withStray) {
    for (const action of STRAY) dispatch(action);
  }
  step(TICKS - 100);
  return { log: structuredClone(S.log), hash: stateHash() };
}

describe("a refused action is not logged", () => {
  it("leaves the log alone, whatever the refusal", () => {
    resetSim({ seed: "refused", mode: "survival" });
    board();
    const before = S.log.length;
    expect(before).toBe(4);
    const results = STRAY.map((action) => dispatch(action));
    expect(results.some((r) => r.ok)).toBe(false);
    expect(S.log).toHaveLength(before);
  });

  it("still logs the accepted ones", () => {
    resetSim({ seed: "refused", mode: "survival" });
    board();
    expect(S.log).toHaveLength(4);
  });

  it("does not count refusals toward the 700-action cap", () => {
    resetSim({ seed: "refused-cap", mode: "sandbox" });
    for (let i = 0; i < 3 * MAX_LOGGED_ACTIONS; i++) dispatch({ op: 3, id: "svc_99" });
    expect(S.log).toHaveLength(0);
    expect(S.logOverflow).toBe(false);
  });

  it("a refusal changes no state the hash sees", () => {
    resetSim({ seed: "refused", mode: "survival" });
    board();
    step(50);
    const before = stateHash();
    const money = S.money;
    for (const action of STRAY) dispatch(action);
    expect(stateHash()).toBe(before);
    expect(S.money).toBe(money);
  });
});

describe("a run with stray clicks", () => {
  it("replays to the same state hash as the same run without them", () => {
    const clean = run(false);
    const stray = run(true);
    expect(stray.hash).toBe(clean.hash);
    expect(stray.log).toEqual(clean.log);
    const again = replay({ seed: "refused", mode: "survival", log: stray.log, ticks: TICKS });
    expect(again.hash).toBe(clean.hash);
  });

  it("encodes as a proof, including after an off-board click", () => {
    resetSim({ seed: "refused-proof", mode: "survival" });
    board();
    dispatch({ op: 0, type: "waf", x: 4000, z: 4000 });
    step(40);
    const proof = encodeProof(S.log);
    expect(parseProof(proof)).toEqual(S.log);
  });
});
