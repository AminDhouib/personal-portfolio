import { afterEach, describe, expect, it } from "vitest";
import { CONFIG } from "../sim/config";
import { dispatch } from "../sim/action-log";
import { S, resetSim } from "../sim/state";
import { makeController } from "./ui-harness";

// Switching between Survival and Sandbox, and swapping the live run for one
// built elsewhere (a save's replay, a shared blueprint) without the loop or the
// player touching the sim while it is being built.

afterEach(() => {
  resetSim({ seed: "controller-runs-reset" });
});

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("modes", () => {
  it("starts a new run in the other mode, and keeps it for the next restart", () => {
    const h = makeController({ mode: "survival" });
    h.place("waf", -28, 0);
    h.controller.restart(undefined, "sandbox");
    expect(S.gameMode).toBe("sandbox");
    expect(S.services).toHaveLength(0);
    expect(S.money).toBe(CONFIG.sandbox.defaultBudget);
    expect(h.controller.getHud().mode).toBe("sandbox");
    h.controller.restart();
    expect(S.gameMode).toBe("sandbox");
    h.controller.restart(undefined, "survival");
    expect(h.controller.getHud().mode).toBe("survival");
    expect(S.money).toBe(CONFIG.survival.startBudget);
  });
});

describe("replaceRun", () => {
  it("holds the loop and the player off the sim while the new run is built", async () => {
    const h = makeController({ mode: "survival" });
    h.controller.start();
    h.frame(16);
    const gate = deferred();
    const pending = h.controller.replaceRun(async () => {
      resetSim({ seed: "built", mode: "sandbox" });
      await gate.promise;
      dispatch({ op: 0, type: "compute", x: -16, z: 0 });
      return "done";
    });
    expect(h.controller.getHud().loading).toBe(true);
    // A frame already in flight does nothing, and the loop asks for no more.
    const tick = S.tick;
    h.frame(1000);
    expect(S.tick).toBe(tick);
    expect(() => h.frame(16)).toThrow("no frame scheduled");
    // Input is ignored, and a second swap is refused rather than queued.
    h.place("waf", -28, 0);
    expect(S.services).toHaveLength(0);
    await expect(h.controller.replaceRun(() => "again")).resolves.toEqual({ ok: false });

    gate.resolve();
    await expect(pending).resolves.toEqual({ ok: true, value: "done" });
    const hud = h.controller.getHud();
    expect(hud.loading).toBe(false);
    expect(hud.mode).toBe("sandbox");
    expect(S.services.map((s) => s.type)).toEqual(["compute"]);
    // The build's own events are history, not news: no badge, toast or alert from them.
    expect(hud.badges).toEqual([]);
    h.frame(16);
    expect(h.controller.getHud().alert).toBeNull();
    // A restart now stays in the adopted mode.
    h.controller.restart();
    expect(S.gameMode).toBe("sandbox");
  });

  it("lets the game go on when the work throws, and passes the error up", async () => {
    const h = makeController();
    h.controller.start();
    await expect(
      h.controller.replaceRun(() => {
        throw new Error("bad");
      }),
    ).rejects.toThrow("bad");
    expect(h.controller.getHud().loading).toBe(false);
    h.frame(16);
    h.place("waf", -28, 0);
    expect(S.services).toHaveLength(1);
  });
});
