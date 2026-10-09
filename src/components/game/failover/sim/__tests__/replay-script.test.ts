// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { dispatch } from "../action-log";
import { stateHash } from "../hash";
import { replay, replayAsync } from "../replay";
import { resetSim, S } from "../state";
import { step } from "../tick";
import { BOARD_S, play } from "./scripted";

afterEach(() => resetSim({ seed: "after-replay-script" }));

const SEED = "replay-script-day";

// A daily changes the sim from outside: a starting setup and calls at set ticks. The replay
// has to make them at the same points the live game does, or the server and the page diverge.

describe("replay setup and scheduled calls", () => {
  it("runs setup after the reset and before the first step", () => {
    const seen: number[] = [];
    replay({
      seed: SEED,
      mode: "survival",
      log: [],
      ticks: 10,
      setup: () => seen.push(S.tick, S.services.length),
    });
    expect(seen).toEqual([0, 0]);
  });

  it("runs each scheduled call when the sim reaches its tick, before the actions of that tick", () => {
    const order: string[] = [];
    replay({
      seed: SEED,
      mode: "survival",
      log: [[40, 8]],
      ticks: 100,
      scheduled: [
        { tick: 0, run: () => order.push(`a@${S.tick}`) },
        { tick: 40, run: () => order.push(`b@${S.tick}:${S.over ? "over" : "live"}`) },
        { tick: 40, run: () => order.push(`c@${S.tick}`) },
        { tick: 75, run: () => order.push(`d@${S.tick}`) },
      ],
    });
    // The retire at tick 40 ends the run, but the calls due at 40 came first; 75 is never reached.
    expect(order).toEqual(["a@0", "b@40:live", "c@40"]);
  });

  it("drops a call scheduled past the end of the run", () => {
    const ran: number[] = [];
    replay({
      seed: SEED,
      mode: "survival",
      log: [],
      ticks: 20,
      scheduled: [{ tick: 21, run: () => ran.push(21) }],
    });
    expect(ran).toEqual([]);
  });

  it("changes the run, and gives the same result the live game gets", () => {
    const bump = () => {
      S.money += 123;
    };
    const plain = play(SEED, "survival", BOARD_S, 600);
    // The live game: the board at tick 0, then a call made between two steps.
    resetSim({ seed: SEED, mode: "survival" });
    for (const [, action] of BOARD_S) dispatch(action);
    step(300);
    bump();
    step(300);
    const liveHash = stateHash();

    const withCall = replay({
      seed: SEED,
      mode: "survival",
      log: plain.log,
      ticks: 600,
      scheduled: [{ tick: 300, run: bump }],
    });
    const without = replay({ seed: SEED, mode: "survival", log: plain.log, ticks: 600 });
    expect(withCall.hash).toBe(liveHash);
    expect(withCall.hash).not.toBe(without.hash);
    expect(without.hash).toBe(plain.hash);
  });

  it("is the same in the chunked replay", async () => {
    const bump = () => {
      S.money += 123;
    };
    const opts = {
      seed: SEED,
      mode: "survival" as const,
      log: play(SEED, "survival", BOARD_S, 900).log,
      ticks: 900,
      scheduled: [
        { tick: 250, run: bump },
        { tick: 777, run: bump },
      ],
    };
    const sync = replay(opts);
    const chunked = await replayAsync(opts, { yieldEvery: 100, yieldFn: async () => {} });
    expect(chunked).toEqual(sync);
  });
});
