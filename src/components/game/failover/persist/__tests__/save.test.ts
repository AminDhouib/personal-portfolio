import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../../sim/action-log";
import { CONFIG } from "../../sim/config";
import { stateHash } from "../../sim/hash";
import { encodeProof } from "../../sim/proof";
import { resetSim, S } from "../../sim/state";
import { step } from "../../sim/tick";
import { BOARD_S, MID_RUN_S, play } from "../../sim/__tests__/scripted";
import { captureSave, loadSave, readSave, writeSave } from "../save";
import { MAX_SAVE_TICKS, SAVE_KEY, type SaveV1 } from "../save-schema";

// Saving is the seed plus the action log; loading is a replay. The tests here
// pin that a loaded run is the run that was saved, tick for tick and onward.

const NOW = 1_760_000_000_000;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetSim({ seed: "after-save" });
});

function capture(): SaveV1 {
  const out = captureSave(NOW);
  if (!out.ok) throw new Error(`capture failed: ${out.reason}`);
  return out.save;
}

/** Through storage and JSON, the way a reload sees it. */
function roundTrip(save: SaveV1): SaveV1 {
  expect(writeSave(save)).toBe("written");
  const back = readSave();
  if (!back) throw new Error("save did not read back");
  return back;
}

describe("captureSave", () => {
  it("writes the pinned key order and the proof string for a survival run", () => {
    play("save-a", "survival", BOARD_S, 400);
    const save = capture();
    expect(Object.keys(save)).toEqual(["v", "savedAt", "mode", "seed", "tick", "log"]);
    expect(save).toMatchObject({ v: 1, savedAt: NOW, mode: "survival", seed: "save-a", tick: 400 });
    expect(save.log).toBe(encodeProof(S.log));
    expect(save.budget).toBeUndefined();
  });

  it("carries a sandbox budget only when it is not the default", () => {
    resetSim({ seed: "save-sb", mode: "sandbox" });
    expect(capture().budget).toBeUndefined();

    resetSim({ seed: "save-sb", mode: "sandbox", budget: 3500 });
    expect(capture().budget).toBe(3500);
  });

  it("refuses a finished run", () => {
    resetSim({ seed: "save-over" });
    dispatch({ op: 8 });
    expect(captureSave(NOW)).toEqual({ ok: false, reason: "over" });
  });

  it("refuses a run whose log overflowed the 700-action cap", () => {
    resetSim({ seed: "save-overflow", mode: "sandbox" });
    for (let i = 0; i < 701; i++) dispatch({ op: 7, on: i % 2 === 0 });
    expect(S.logOverflow).toBe(true);
    expect(captureSave(NOW)).toEqual({ ok: false, reason: "too-many-actions" });
  });

  it("refuses a run past the replay cap", () => {
    resetSim({ seed: "save-long", mode: "sandbox" });
    S.tick = MAX_SAVE_TICKS + 1;
    expect(captureSave(NOW)).toEqual({ ok: false, reason: "too-long" });
  });

  it("saves after a stray off-board click, which is a refusal and not in the log", () => {
    resetSim({ seed: "save-off", mode: "sandbox" });
    expect(dispatch({ op: 0, type: "waf", x: 4000, z: 0 })).toEqual({
      ok: false,
      reason: "bounds",
    });
    expect(captureSave(NOW)).toMatchObject({ ok: true, save: { log: "" } });
  });

  it("refuses, as a typed result, a log the proof format cannot write (defensive)", () => {
    resetSim({ seed: "save-bad-log", mode: "sandbox" });
    S.log.push([0, 0, 0, 4000, 0]);
    expect(captureSave(NOW)).toEqual({ ok: false, reason: "unencodable" });
  });
});

describe("writeSave and readSave", () => {
  it("writes exactly the JSON of the save under failover:save:v1", () => {
    play("save-w", "survival", BOARD_S, 200);
    const save = capture();
    expect(writeSave(save)).toBe("written");
    expect(window.localStorage.getItem("failover:save:v1")).toBe(JSON.stringify(save));
    expect(SAVE_KEY).toBe("failover:save:v1");
  });

  it("reads nothing from an empty slot", () => {
    expect(readSave()).toBeNull();
  });

  it("reads nothing, and reports once, from corrupt JSON", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    window.localStorage.setItem(SAVE_KEY, "{not json");
    expect(readSave()).toBeNull();
    expect(errors).toHaveBeenCalled();
  });

  it("reads nothing from a value that is not a v1 save", () => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, seed: "x" }));
    expect(readSave()).toBeNull();
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 2, savedAt: 1 }));
    expect(readSave()).toBeNull();
    window.localStorage.setItem(SAVE_KEY, "null");
    expect(readSave()).toBeNull();
  });

  it("does not write over a value a newer build wrote", () => {
    const newer = JSON.stringify({ v: 2, blob: "from the future" });
    window.localStorage.setItem(SAVE_KEY, newer);
    play("save-n", "survival", BOARD_S, 100);
    expect(writeSave(capture())).toBe("newer");
    expect(window.localStorage.getItem(SAVE_KEY)).toBe(newer);
  });

  it("overwrites a corrupt slot and an older-shaped one", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.localStorage.setItem(SAVE_KEY, "{not json");
    play("save-o", "survival", BOARD_S, 100);
    expect(writeSave(capture())).toBe("written");
    expect(readSave()).not.toBeNull();
  });

  it("reports a blocked store without throwing", () => {
    play("save-b", "survival", BOARD_S, 100);
    const save = capture();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    expect(writeSave(save)).toBe("failed");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    expect(readSave()).toBeNull();
    expect(writeSave(save)).toBe("failed");
  });
});

describe("loadSave", () => {
  it("replays a saved survival run to the same state, through storage", async () => {
    play("save-l", "survival", [...BOARD_S, ...MID_RUN_S], 1500);
    const liveHash = stateHash();
    const save = roundTrip(capture());

    resetSim({ seed: "somebody-else" });
    const loaded = await loadSave(save);
    expect(loaded.ok).toBe(true);
    expect(S.tick).toBe(1500);
    expect(S.seed).toBe("save-l");
    expect(stateHash()).toBe(liveHash);
  });

  it("carries on identically after a load", async () => {
    play("save-c", "survival", [...BOARD_S, ...MID_RUN_S], 1500);
    const save = roundTrip(capture());
    step(600);
    dispatch({ op: 4, id: "svc_3" });
    step(300);
    const straightThrough = stateHash();

    resetSim({ seed: "elsewhere" });
    await loadSave(save);
    step(600);
    dispatch({ op: 4, id: "svc_3" });
    step(300);
    expect(stateHash()).toBe(straightThrough);
  });

  it("restores a sandbox run with its own budget", async () => {
    resetSim({ seed: "save-sb2", mode: "sandbox", budget: 3500 });
    dispatch({ op: 0, type: "waf", x: 0, z: 0 });
    dispatch({ op: 0, type: "alb", x: 8, z: 0 });
    dispatch({ op: 1, from: "internet", to: "svc_1" });
    dispatch({ op: 1, from: "svc_1", to: "svc_2" });
    step(200);
    const liveHash = stateHash();
    const live = { money: S.money, budget: S.sandboxBudget };
    const save = roundTrip(capture());

    resetSim({ seed: "elsewhere" });
    expect((await loadSave(save)).ok).toBe(true);
    expect(S.gameMode).toBe("sandbox");
    expect({ money: S.money, budget: S.sandboxBudget }).toEqual(live);
    expect(stateHash()).toBe(liveHash);
  });

  it("applies the actions logged on the save tick itself", async () => {
    resetSim({ seed: "save-edge", mode: "sandbox" });
    step(40);
    dispatch({ op: 0, type: "waf", x: 0, z: 0 });
    const save = roundTrip(capture());
    expect(save.tick).toBe(40);

    resetSim({ seed: "elsewhere" });
    await loadSave(save);
    expect(S.services.map((s) => s.type)).toEqual(["waf"]);
  });

  it("reports a run that ended before the saved tick as ok, with where it ended", async () => {
    resetSim({ seed: "save-short", mode: "sandbox" });
    step(10);
    dispatch({ op: 8 });
    const save: SaveV1 = {
      v: 1,
      savedAt: NOW,
      mode: "sandbox",
      seed: "save-short",
      tick: 100,
      log: "10,8",
    };
    resetSim({ seed: "elsewhere" });
    const loaded = await loadSave(save);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.result.endReason).toBe("retired");
    expect(loaded.result.endedAtTick).toBe(10);
    expect(S.tick).toBe(10);
    expect(S.over).toEqual({ reason: "retired", atTick: 10 });
  });

  it("yields to the event loop while it replays", async () => {
    play("save-y", "survival", BOARD_S, 1200);
    const save = capture();
    const yielded = vi.fn(() => Promise.resolve());
    await loadSave(save, yielded);
    // 1200 ticks in chunks of 500: it yields between chunks.
    expect(yielded.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("refuses a save the proof path would refuse, and leaves the sim alone", async () => {
    resetSim({ seed: "untouched", mode: "sandbox" });
    step(10);
    const before = stateHash();
    const bad: SaveV1 = {
      v: 1,
      savedAt: NOW,
      mode: "survival",
      seed: "x",
      tick: 5,
      log: "10,8",
    };
    expect(await loadSave(bad)).toEqual({ ok: false, reason: "invalid" });
    expect(stateHash()).toBe(before);
  });

  it("refuses hostile objects handed in as a save", async () => {
    const hostile = [
      { ...(capturedFor("h1") as object), extra: 1 },
      { v: 1 },
      { v: 1, savedAt: 1, mode: "survival", seed: "x", tick: 1e300, log: "" },
    ] as unknown as SaveV1[];
    for (const save of hostile) {
      expect(await loadSave(save)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("an honest replay of the default sandbox budget needs no budget field", async () => {
    resetSim({ seed: "save-def", mode: "sandbox" });
    dispatch({ op: 0, type: "waf", x: 0, z: 0 });
    const save = capture();
    expect("budget" in save).toBe(false);
    resetSim({ seed: "elsewhere" });
    await loadSave(save);
    expect(S.sandboxBudget).toBe(CONFIG.sandbox.defaultBudget);
    expect(S.money).toBe(CONFIG.sandbox.defaultBudget - CONFIG.services.waf.cost);
  });
});

function capturedFor(seed: string): SaveV1 {
  play(seed, "survival", BOARD_S, 50);
  return capture();
}
