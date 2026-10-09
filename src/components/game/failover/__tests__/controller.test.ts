import { afterEach, describe, expect, it, vi } from "vitest";
import type { FailoverAudio } from "../audio/audio";
import type { CueName } from "../audio/cues";
import { FailoverController, type ControllerOptions } from "../controller";
import type { FailoverScene, Overlay, PickResult } from "../scene/scene";
import type { Snapshot } from "../sim/snapshot";
import { S, resetSim } from "../sim/state";
import type { SimEvent } from "../sim/types";

// The controller headless: an injected frame scheduler, a recording scene and a
// recording audio facade, so the loop, the input wiring and the HUD are tested
// without WebGL, Web Audio or a real animation frame.

function fakeScheduler() {
  let nextId = 1;
  const pending = new Map<number, (t: number) => void>();
  const cancelled: number[] = [];
  return {
    pending,
    cancelled,
    schedule: (cb: (t: number) => void) => {
      const id = nextId++;
      pending.set(id, cb);
      return id;
    },
    cancel: (id: number) => {
      cancelled.push(id);
      pending.delete(id);
    },
    /** Run the one scheduled frame at time t. */
    fire(t: number) {
      const entries = [...pending.entries()];
      expect(entries).toHaveLength(1);
      const [id, cb] = entries[0]!;
      pending.delete(id);
      cb(t);
    },
  };
}

function fakeScene() {
  const renders: { tick: number; events: readonly SimEvent[]; at: number }[] = [];
  const overlays: Overlay[] = [];
  let pickResult: PickResult | null = null;
  const scene: FailoverScene & { disposed: number; tiers: string[] } = {
    disposed: 0,
    tiers: [],
    render(snapshot: Snapshot, events, nowMs) {
      renders.push({ tick: snapshot.tick, events: [...events], at: nowMs });
    },
    resize: () => undefined,
    setCamera: () => undefined,
    setOverlay(o) {
      overlays.push(o);
    },
    setTier(t) {
      scene.tiers.push(t);
    },
    pick: () => pickResult,
    dispose() {
      scene.disposed++;
    },
  };
  return {
    scene,
    renders,
    overlays,
    setPick(result: PickResult | null) {
      pickResult = result;
    },
  };
}

function fakeAudio() {
  const played: CueName[] = [];
  let on = false;
  const audio: FailoverAudio & { closed: number; unlocked: number } = {
    closed: 0,
    unlocked: 0,
    unlock() {
      audio.unlocked++;
    },
    play(name) {
      played.push(name);
    },
    isOn: () => on,
    setOn(next) {
      on = next;
    },
    close() {
      audio.closed++;
    },
  };
  return { audio, played };
}

const DESKTOP = { coarsePointer: false, deviceMemory: 16, hardwareConcurrency: 12 };

function setup(over: Partial<ControllerOptions> = {}) {
  const sched = fakeScheduler();
  const view = fakeScene();
  const sound = fakeAudio();
  const controller = new FailoverController({
    seed: "controller-test",
    mode: "sandbox",
    schedule: sched.schedule,
    cancel: sched.cancel,
    audio: sound.audio,
    perfEnv: DESKTOP,
    gfxPref: "auto",
    createScene: () => view.scene,
    ...over,
  });
  controller.attach(document.createElement("canvas"), 800, 600);
  return { controller, sched, view, sound };
}

/** Fire `n` frames `ms` apart, starting at `start`; returns the time of the last. */
function run(sched: ReturnType<typeof fakeScheduler>, n: number, ms: number, start = 1000) {
  let t = start;
  for (let i = 0; i <= n; i++) {
    t = start + i * ms;
    sched.fire(t);
  }
  return t;
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetSim({ seed: "controller-test-reset" });
});

describe("the loop", () => {
  it.each([60, 600])("%i frames of 16.7 ms advance the sim floor(N * 16.7 / 50) ticks", (n) => {
    const { controller, sched } = setup();
    controller.start();
    run(sched, n, 16.7);
    expect(S.tick).toBe(Math.floor((n * 16.7) / 50));
    controller.dispose();
  });

  it("a 2 s stall advances at most 5 ticks", () => {
    const { controller, sched } = setup();
    controller.start();
    sched.fire(1000);
    sched.fire(3000);
    expect(S.tick).toBe(5);
    controller.dispose();
  });

  it("runs 3x at speed 3 and not at all when paused", () => {
    const { controller, sched } = setup();
    controller.setSpeed(3);
    controller.start();
    const end = run(sched, 60, 16.7);
    expect(S.tick).toBe(Math.floor((60 * 16.7 * 3) / 50));
    const before = S.tick;
    controller.togglePause();
    run(sched, 60, 16.7, end + 16.7);
    expect(S.tick).toBe(before);
    expect(controller.getHud().paused).toBe(true);
    controller.dispose();
  });

  it("stops when the tab is hidden and does not count the time away", () => {
    const { controller, sched } = setup();
    controller.start();
    run(sched, 30, 16.7);
    const before = S.tick;
    controller.setVisible(false);
    expect(sched.pending.size).toBe(0);
    expect(sched.cancelled).toHaveLength(1);
    controller.setVisible(true);
    sched.fire(60_000);
    expect(S.tick).toBe(before);
    controller.dispose();
  });

  it("stops while the canvas is off-screen", () => {
    const { controller, sched } = setup();
    controller.start();
    sched.fire(1000);
    controller.setOnScreen(false);
    expect(sched.pending.size).toBe(0);
    controller.setOnScreen(true);
    expect(sched.pending.size).toBe(1);
    controller.dispose();
  });

  it("renders at most 30 times a second on the low tier", () => {
    const { controller, sched, view } = setup({ gfxPref: "low" });
    controller.start();
    run(sched, 60, 16.7);
    expect(view.renders.length).toBeLessThanOrEqual(31);
    expect(view.renders.length).toBeGreaterThanOrEqual(29);
    controller.dispose();
  });

  it("drops to the low tier when frames are slow, and tells the scene once", () => {
    const { controller, sched, view } = setup();
    controller.start();
    run(sched, 70, 32);
    expect(view.scene.tiers).toEqual(["low"]);
    expect(controller.getHud().tier).toBe("low");
    controller.dispose();
  });

  it("reports a crash in the frame once, under the game's name, and stops", () => {
    const reported: unknown[] = [];
    vi.stubGlobal("reportError", (e: unknown) => reported.push(e));
    const { controller, sched, view } = setup();
    view.scene.render = () => {
      throw new Error("boom");
    };
    controller.start();
    sched.fire(1000);
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe("[failover] game loop crashed");
    expect(sched.pending.size).toBe(0);
    controller.dispose();
  });

  it("puts a crash in the HUD at once, and stays stopped when shown again", () => {
    vi.stubGlobal("reportError", () => undefined);
    const { controller, sched, view } = setup();
    const seen: boolean[] = [];
    controller.subscribe(() => seen.push(controller.getHud().crashed));
    expect(controller.getHud().crashed).toBe(false);
    view.scene.render = () => {
      throw new Error("boom");
    };
    controller.start();
    sched.fire(1000);
    expect(seen.at(-1)).toBe(true);
    controller.setVisible(false);
    controller.setVisible(true);
    controller.setOnScreen(true);
    expect(sched.pending.size).toBe(0);
    controller.dispose();
  });

  it("dispose releases the scene, the sound and the frame", () => {
    const { controller, sched, view, sound } = setup();
    controller.start();
    controller.dispose();
    expect(view.scene.disposed).toBe(1);
    expect(sound.audio.closed).toBe(1);
    expect(sched.pending.size).toBe(0);
  });
});

describe("input to sim", () => {
  it("a click with Place armed builds the service and plays its cue on the next frame", () => {
    const { controller, sched, view, sound } = setup();
    controller.start();
    controller.setTool({ kind: "place", service: "waf" });
    view.setPick({ cell: { x: -28, z: 0 }, node: null });
    controller.tap(10, 10, "mouse");
    expect(S.services.map((s) => s.type)).toEqual(["waf"]);
    sched.fire(1000);
    expect(sound.played).toContain("place");
    expect(view.renders.at(-1)?.events.some((e) => e.kind === "service-placed")).toBe(true);
    controller.dispose();
  });

  it("a finger tap shows a ghost first, and Confirm builds", () => {
    const { controller, view } = setup();
    controller.setTool({ kind: "place", service: "compute" });
    view.setPick({ cell: { x: 0, z: 8 }, node: null });
    controller.tap(10, 10, "touch");
    expect(S.services).toHaveLength(0);
    expect(view.overlays.at(-1)?.ghost).toEqual({ type: "compute", x: 0, z: 8 });
    expect(controller.getHud().pending).toMatchObject({ kind: "place" });
    controller.confirm();
    expect(S.services).toHaveLength(1);
    expect(view.overlays.at(-1)?.ghost).toBeNull();
    controller.dispose();
  });

  it("links through the machine, and an impossible link explains itself", () => {
    const { controller, view } = setup();
    controller.setTool({ kind: "place", service: "waf" });
    view.setPick({ cell: { x: -28, z: 0 }, node: null });
    controller.tap(0, 0, "mouse");
    controller.setTool({ kind: "place", service: "db" });
    view.setPick({ cell: { x: -16, z: 0 }, node: null });
    controller.tap(0, 0, "mouse");

    controller.setTool({ kind: "link" });
    view.setPick({ cell: { x: -40, z: 0 }, node: "internet" });
    controller.tap(0, 0, "mouse");
    expect(view.overlays.at(-1)?.highlight).toBe("internet");
    view.setPick({ cell: { x: -28, z: 0 }, node: "svc_1" });
    controller.tap(0, 0, "mouse");
    expect(S.connections).toEqual([{ from: "internet", to: "svc_1" }]);

    controller.tap(0, 0, "mouse");
    view.setPick({ cell: { x: -16, z: 0 }, node: "svc_2" });
    controller.tap(0, 0, "mouse");
    expect(controller.getHud().toast).toBe("Firewall can't send traffic to Relational DB.");
    controller.dispose();
  });

  it("confirms a link, and a repeat says it is there (the walk read that as a missed click)", () => {
    const { controller, view } = setup();
    controller.setTool({ kind: "place", service: "alb" });
    view.setPick({ cell: { x: -28, z: 0 }, node: null });
    controller.tap(0, 0, "mouse");
    controller.cancelPending();

    const linkInternetToAlb = () => {
      controller.setTool({ kind: "link" });
      view.setPick({ cell: { x: -40, z: 0 }, node: "internet" });
      controller.tap(0, 0, "mouse");
      view.setPick({ cell: { x: -28, z: 0 }, node: "svc_1" });
      controller.tap(0, 0, "mouse");
    };
    linkInternetToAlb();
    expect(S.connections).toEqual([{ from: "internet", to: "svc_1" }]);
    expect(controller.getHud().toast).toBe("Linked Internet to Load Balancer");

    linkInternetToAlb();
    expect(S.connections).toHaveLength(1);
    expect(controller.getHud().toast).toBe("Internet already sends to Load Balancer");
    controller.dispose();
  });

  it("turns a refusal from the sim into a toast", () => {
    const { controller, view } = setup();
    controller.setTool({ kind: "place", service: "waf" });
    view.setPick({ cell: { x: 0, z: 0 }, node: null });
    S.money = 0;
    controller.tap(0, 0, "mouse");
    expect(controller.getHud().toast).toBe("Not enough money");
    controller.dispose();
  });

  it("selects a node and upgrades it", () => {
    const { controller, view } = setup();
    controller.setTool({ kind: "place", service: "compute" });
    view.setPick({ cell: { x: 0, z: 0 }, node: null });
    controller.tap(0, 0, "mouse");
    controller.setTool({ kind: "select" });
    view.setPick({ cell: { x: 0, z: 0 }, node: "svc_1" });
    controller.tap(0, 0, "mouse");
    expect(controller.getHud().selected).toMatchObject({ id: "svc_1", name: "Compute", tier: 1 });
    controller.upgradeSelected();
    expect(controller.getHud().selected?.tier).toBe(2);
    controller.dispose();
  });

  it("game keys are consumed only while the run is live; other keys never", () => {
    const { controller } = setup();
    expect(controller.key("w")).toBe(true);
    expect(controller.key(" ")).toBe(true);
    expect(controller.getHud().paused).toBe(true);
    expect(controller.key("Tab")).toBe(false);
    expect(controller.key("Enter")).toBe(false);
    S.over = { reason: "retired", atTick: S.tick };
    expect(controller.key("w")).toBe(false);
    controller.dispose();
  });

  it("restart starts a fresh run", () => {
    const { controller, view } = setup();
    controller.setTool({ kind: "place", service: "waf" });
    view.setPick({ cell: { x: 0, z: 0 }, node: null });
    controller.tap(0, 0, "mouse");
    controller.restart("controller-test-2");
    expect(S.services).toHaveLength(0);
    expect(S.seed).toBe("controller-test-2");
    expect(controller.getHud().tool).toEqual({ kind: "select" });
    controller.dispose();
  });

  it("sound: unlocks from the gesture, and the switch reaches the HUD", () => {
    const { controller, sound } = setup();
    controller.unlockAudio();
    expect(sound.audio.unlocked).toBe(1);
    controller.setSoundOn(true);
    expect(controller.getHud().soundOn).toBe(true);
    controller.dispose();
  });
});

describe("the HUD", () => {
  it("refreshes about four times a second, not every frame", () => {
    const { controller, sched } = setup();
    let calls = 0;
    controller.subscribe(() => calls++);
    controller.start();
    run(sched, 120, 16.7);
    // Two seconds of frames.
    expect(calls).toBeGreaterThanOrEqual(7);
    expect(calls).toBeLessThanOrEqual(10);
    controller.dispose();
  });

  it("refreshes at once when the run ends", () => {
    const { controller, sched } = setup({ mode: "survival" });
    controller.start();
    sched.fire(1000);
    let calls = 0;
    controller.subscribe(() => calls++);
    S.reputation = -5;
    sched.fire(1010);
    sched.fire(1060);
    expect(calls).toBe(1);
    expect(controller.getHud().over).toBe("reputation");
    controller.dispose();
  });
});
