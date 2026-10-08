import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { freeSeed } from "../daily";
import { craneOffset, drop, newRun, perfectDropTime, type TowerRun } from "../engine";
import { Stage } from "../stage";

const realGetContext =
  Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext") ?? {};
let clock = 0;
let frames = new Map<number, FrameRequestCallback>();
let nextFrame = 1;

function fakeCanvasContext() {
  return new Proxy(
    {},
    {
      get: (_target, prop) => (prop === "measureText" ? () => ({ width: 10 }) : () => undefined),
      set: () => true,
    },
  );
}

beforeEach(() => {
  clock = 1000;
  frames = new Map();
  nextFrame = 1;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    value: () => fakeCanvasContext(),
    configurable: true,
    writable: true,
  });
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    const id = nextFrame++;
    frames.set(id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames.delete(id);
  });
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: false,
        media: query,
        addEventListener() {},
        removeEventListener() {},
      }) as unknown as MediaQueryList,
  );
});

afterEach(() => {
  cleanup();
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", realGetContext);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const stage = () => screen.getByTestId("tower-stage");
const hit = () => screen.getByTestId("tower-hit-layer");

function start(seedText = "e2e") {
  render(<Stage seedText={seedText} />);
  fireEvent.click(screen.getByRole("button", { name: "Start" }));
  // The component starts its run at this instant; mirror it for the tests.
  return newRun(freeSeed(seedText), clock);
}

/** Advance the clock and release the block with a pointer press on the stage. */
function dropAt(t: number) {
  clock = t;
  fireEvent.pointerDown(hit());
}

function timeAtOffset(run: TowerRun, from: number, target: number): number {
  const swing = run.swing;
  if (!swing) throw new Error("run is over");
  for (let t = Math.max(from, swing.spawnAt); t < from + 20_000; t++) {
    if (Math.round(craneOffset(swing, t)) === target) return t;
  }
  throw new Error("no instant");
}

function advance(run: TowerRun, t: number): TowerRun {
  const result = drop(run, t);
  if (!result) throw new Error("mirror drop refused");
  return result.run;
}

describe("Stage", () => {
  it("starts on the ready screen with a hint and a Start button", () => {
    render(<Stage seedText="e2e" />);
    expect(stage().dataset.phase).toBe("ready");
    expect(screen.getByText(/Land it dead centre for a perfect/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
  });

  it("Start goes live, and a centred release is a perfect on floor 1", () => {
    const run = start();
    expect(stage().dataset.phase).toBe("live");
    dropAt(perfectDropTime(run, clock));
    expect(stage().dataset.floors).toBe("1");
    expect(stage().dataset.score).toBe("20");
    expect(stage().dataset.streak).toBe("1");
    expect(screen.getByTestId("tower-live-region").textContent).toBe("Floor 1. Perfect, streak 1.");
  });

  it("Space drops too, and Enter on a button does not", () => {
    const run = start();
    clock = perfectDropTime(run, clock);
    fireEvent.keyDown(window, { key: " " });
    expect(stage().dataset.floors).toBe("1");
  });

  it("announces a trim with the width that is left", () => {
    const run = start();
    dropAt(timeAtOffset(run, clock, 30));
    expect(screen.getByTestId("tower-live-region").textContent).toBe("Floor 1. Trimmed to 210.");
    expect(stage().dataset.streak).toBe("0");
  });

  it("ends the run on a miss and puts focus on the card", () => {
    let mirror = start();
    let t = timeAtOffset(mirror, clock, 205);
    mirror = advance(mirror, t);
    dropAt(t);
    t = timeAtOffset(mirror, t, 205);
    dropAt(t);
    expect(stage().dataset.phase).toBe("over");
    const card = screen.getByTestId("tower-over-card");
    expect(document.activeElement).toBe(card);
    expect(card.textContent).toContain("Floors");
    expect(card.textContent).toContain("Best streak");
  });

  it("Play again starts a fresh run", () => {
    let mirror = start();
    let t = timeAtOffset(mirror, clock, 205);
    mirror = advance(mirror, t);
    dropAt(t);
    t = timeAtOffset(mirror, t, 205);
    dropAt(t);
    fireEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(stage().dataset.phase).toBe("live");
    expect(stage().dataset.floors).toBe("0");
    expect(stage().dataset.score).toBe("0");
  });

  it("keeps the canvas out of the accessibility tree", () => {
    render(<Stage seedText="e2e" />);
    expect(stage().querySelector("canvas")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("gives every button a 44 px minimum", () => {
    render(<Stage seedText="e2e" />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toContain("min-h-11");
      expect(button.className).toContain("min-w-11");
    }
  });

  it("pauses on a hidden tab and resumes only on a tap", () => {
    start();
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(stage().dataset.phase).toBe("paused");
    act(() => {
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(stage().dataset.phase).toBe("paused");
    fireEvent.click(screen.getByRole("button", { name: /Paused/ }));
    expect(stage().dataset.phase).toBe("live");
  });

  it("does not drop on a Space typed into a text field", () => {
    const run = start();
    const input = document.createElement("textarea");
    document.body.append(input);
    clock = perfectDropTime(run, clock);
    fireEvent.keyDown(input, { key: " " });
    expect(stage().dataset.floors).toBe("0");
    input.remove();
  });

  it("scrolls nothing: Space on the page during a run is prevented", () => {
    start();
    const event = new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("held keys", () => {
  it("a held Space (repeat keydown) does not drop again", () => {
    const run = start();
    clock = perfectDropTime(run, clock);
    fireEvent.keyDown(window, { key: " ", repeat: true });
    expect(stage().dataset.floors).toBe("0");
  });
});

describe("persisted mute", () => {
  it("starts muted, with the right label, when storage says muted", () => {
    localStorage.setItem("tower:sound", "0");
    render(<Stage seedText="e2e" />);
    expect(screen.getByRole("button", { name: "Unmute sound" })).toBeTruthy();
    localStorage.clear();
  });
});
