import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { decodeLog, type TurnAction } from "../engine/codec";
import { configForRef } from "../engine/run";
import { startDailyRun, startFloorRun, type Runner } from "../run-floor";
import { configOfRef, handFloorRun, replayHand, useHandRun } from "../use-hand-run";
import { towerFrames } from "./frames";

const walk: TurnAction = { name: "walk", direction: "forward" };
const attack: TurnAction = { name: "attack", direction: "forward" };
const cfg = (level: number) =>
  configForRef({ kind: "tower", tower: "narrow-path", level, epic: false }, "Knight");

// Built once: the hook starts a new run when the config object changes, as the stage's memo does.
const L1 = cfg(1);
const L2 = cfg(2);

/** Level 2: three walks bring the Sludge beside the knight, three attacks kill it (12 points). */
const KILL: TurnAction[] = [walk, walk, walk, attack, attack, attack];

function unitNames(frames: ReturnType<typeof replayHand>["frames"]): string[] {
  return (frames.at(-1)?.floor.units ?? []).map((unit) => unit.name);
}

describe("replayHand", () => {
  it("plays the moves on a fresh run and reports the log, status and score", () => {
    const hand = replayHand(cfg(2), KILL);
    expect(hand.records).toHaveLength(6);
    expect(hand.status).toBe("playing");
    expect(hand.result.warrior.score).toBe(12);
    expect(hand.log).toBe("1:w0w0w0a0a0a0");
    expect(unitNames(hand.frames)).toEqual(["Knight"]);
  });

  it("stops at an action the engine refuses and keeps what was played", () => {
    const hand = replayHand(cfg(2), [walk, { name: "shoot", direction: "forward" }, walk]);
    expect(hand.records).toHaveLength(1);
    expect(hand.log).toBe("1:w0");
  });
});

describe("useHandRun", () => {
  it("undo after a kill restores the unit and the score", () => {
    const { result } = renderHook(() => useHandRun(L2));
    act(() => {
      for (const action of KILL) result.current.act(action);
    });
    expect(result.current.turns).toBe(6);
    expect(result.current.result.warrior.score).toBe(12);
    expect(unitNames(result.current.frames)).toEqual(["Knight"]);

    act(() => result.current.undo());
    expect(result.current.turns).toBe(5);
    expect(result.current.result.warrior.score).toBe(0);
    expect(unitNames(result.current.frames)).toEqual(["Knight", "Sludge"]);
    expect(result.current.log).toBe("1:w0w0w0a0a0");
    // The state is the replay of the log minus its last action, nothing else.
    expect(result.current.frames).toEqual(replayHand(cfg(2), KILL.slice(0, -1)).frames);
  });

  it("undo with nothing played, and restart, both leave a fresh run", () => {
    const { result } = renderHook(() => useHandRun(L2));
    act(() => result.current.undo());
    expect(result.current.turns).toBe(0);
    act(() => {
      result.current.act(walk);
      result.current.act(walk);
    });
    expect(result.current.turns).toBe(2);
    act(() => result.current.restart());
    expect(result.current.turns).toBe(0);
    expect(result.current.log).toBe("1:");
    expect(result.current.playing).toBe(true);
  });

  it("refuses a malformed action and any action once the run is over", () => {
    const { result } = renderHook(() => useHandRun(L1));
    let accepted = true;
    act(() => {
      accepted = result.current.act({ name: "rest", direction: "forward" });
    });
    expect(accepted).toBe(false);
    expect(result.current.turns).toBe(0);
    act(() => {
      for (let i = 0; i < 7; i += 1) result.current.act(walk);
    });
    expect(result.current.status).toBe("passed");
    expect(result.current.playing).toBe(false);
    act(() => {
      accepted = result.current.act(walk);
    });
    expect(accepted).toBe(false);
    expect(result.current.turns).toBe(7);
  });

  it("takes two quick taps in one batch as two turns", () => {
    const { result } = renderHook(() => useHandRun(L2));
    act(() => {
      result.current.act(walk);
      result.current.act(walk);
    });
    expect(result.current.log).toBe("1:w0w0");
  });

  it("starts a new run when the floor changes", () => {
    const { result, rerender } = renderHook(({ config }) => useHandRun(config), {
      initialProps: { config: L1 },
    });
    act(() => result.current.act(walk));
    expect(result.current.turns).toBe(1);
    rerender({ config: L2 });
    expect(result.current.turns).toBe(0);
  });
});

describe("a hand run is a code run with the same moves", () => {
  const ref = { kind: "tower", tower: "narrow-path", level: 2, epic: false } as const;

  it("makes the same log and the same frames as the sandbox path (codec equality)", async () => {
    const hand = replayHand(cfg(2), KILL);
    const tokens = (decodeLog(hand.log) ?? []).length;
    expect(tokens).toBe(6);
    const runner: Runner = (_req, onTurn) => {
      hand.log
        .slice(2)
        .match(/../g)
        ?.forEach((token, i) => onTurn(i + 1, token, []));
      return {
        done: Promise.resolve({ kind: "finished", log: hand.log, thoughts: [] }),
        cancel: () => {},
      };
    };
    const code = await startFloorRun(ref, "", runner).done;
    expect(code.log).toBe(hand.log);
    expect(code.frames).toEqual(hand.frames);
    expect(code.result).toEqual(hand.result);
  });

  it("matches towerFrames, the helper the other tests build floors with", () => {
    expect(replayHand(cfg(2), KILL).frames).toEqual(towerFrames("narrow-path", 2, KILL));
  });

  it("builds the floor-run record the result card and board read", () => {
    const ref2 = { kind: "daily", day: "2026-10-15" } as const;
    const config = configOfRef(ref2);
    const floor = handFloorRun(ref2, config, replayHand(config, []));
    expect(floor).toMatchObject({
      ref: ref2,
      log: "1:",
      thoughts: [],
      outcome: null,
      ranNothing: false,
    });
    // The same ref a code run would carry.
    const viaCode = startDailyRun("2026-10-15", "", () => ({
      done: Promise.resolve({ kind: "finished", log: "1:", thoughts: [] }),
      cancel: () => {},
    }));
    return viaCode.done.then((codeRun) => expect(codeRun.config).toEqual(floor.config));
  });
});
