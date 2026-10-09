import { FailoverController, type ControllerOptions } from "../controller";
import type { FailoverScene, PickResult } from "../scene/scene";
import type { ServiceType } from "../sim/config";

// A real controller for the UI tests: frames run when the test says, the scene
// is a stub whose pick the test sets, and the audio is silent.

export function makeController(over: Partial<ControllerOptions> = {}) {
  const frames: ((t: number) => void)[] = [];
  let pick: PickResult | null = null;
  const scene: FailoverScene = {
    render: () => undefined,
    resize: () => undefined,
    setCamera: () => undefined,
    setOverlay: () => undefined,
    setTier: () => undefined,
    pick: () => pick,
    dispose: () => undefined,
  };
  let soundOn = false;
  const controller = new FailoverController({
    seed: "ui-harness",
    mode: "sandbox",
    schedule: (cb) => frames.push(cb),
    cancel: () => undefined,
    audio: {
      unlock: () => undefined,
      play: () => undefined,
      isOn: () => soundOn,
      setOn: (on) => {
        soundOn = on;
      },
      close: () => undefined,
    },
    perfEnv: { coarsePointer: false, deviceMemory: 16, hardwareConcurrency: 12 },
    gfxPref: "auto",
    createScene: () => scene,
    ...over,
  });
  controller.attach(document.createElement("canvas"), 800, 600);
  let now = 1000;
  return {
    controller,
    /** Run the scheduled frame `ms` after the last one. */
    frame(ms = 1000 / 60) {
      now += ms;
      const cb = frames.shift();
      if (!cb) throw new Error("no frame scheduled");
      cb(now);
    },
    /** Make the next pick hit this cell, or this node on it. */
    aim(cell: { x: number; z: number }, node: string | null = null) {
      pick = { cell, node };
    },
    /** Place a service with a mouse click. */
    place(service: ServiceType, x: number, z: number) {
      controller.setTool({ kind: "place", service });
      pick = { cell: { x, z }, node: null };
      controller.tap(0, 0, "mouse");
    },
  };
}
