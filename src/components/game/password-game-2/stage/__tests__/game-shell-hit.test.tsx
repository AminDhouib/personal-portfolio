import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import type { GameState, PointerTarget } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// The engine's pointer step is scripted per test: a press either lands (it downs an
// alien, which counts without touching the cells) or misses.
const script = { lands: true };
vi.mock("../../engine/engine", async (importOriginal) => {
  const orig = await importOriginal<typeof import("../../engine/engine")>();
  return {
    ...orig,
    applyPointer: (g: GameState, target: PointerTarget) => {
      if (script.lands && target.kind === "alien") g.stats.aliensDowned += 1;
    },
  };
});

// A canvas overlay that always reports an alien under the pointer, and records hits.
const onHit = vi.fn();
vi.mock("../canvas-overlay", () => ({
  CanvasOverlay: forwardRef(function AlienEverywhere(_props, ref) {
    useImperativeHandle(ref, () => ({
      paint: () => {},
      hitTest: () => ({ kind: "alien", id: 1 }) as const,
      onHit,
    }));
    return null;
  }),
}));

import { GameShell } from "../game-shell";

let frame: FrameRequestCallback | null = null;
function runFrame(ts: number) {
  act(() => {
    const cb = frame;
    frame = null;
    cb?.(ts);
  });
}

const panel = () => document.querySelector<HTMLElement>(".pg2-panel")!;

describe("GameShell hit feedback", () => {
  beforeEach(() => {
    script.lands = true;
    onHit.mockClear();
    frame = null;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      frame = cb;
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", () => {});
    // The shake jitter is random; pin it to its positive extreme.
    vi.spyOn(Math, "random").mockReturnValue(1);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      // Reduced motion on: game feel is not gated on it.
      matches: query.includes("reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function startRun() {
    const utils = render(<GameShell />);
    fireEvent.click(utils.getByRole("button", { name: /random seed/i }));
    runFrame(16);
    return utils;
  }

  it("a landed hit bursts at the target and shakes the card by the hit's weight", () => {
    const { getByRole } = startRun();
    fireEvent.pointerDown(getByRole("textbox", { name: "Password" }), {
      clientX: 120,
      clientY: 80,
    });
    expect(onHit).toHaveBeenCalledTimes(1);
    expect(onHit).toHaveBeenCalledWith({ kind: "alien", id: 1 }, 120, 80);
    runFrame(32);
    expect(panel().style.getPropertyValue("--pg2-shake-x")).toBe("5px");
  });

  it("the hit shake dies away within a fifth of a second", () => {
    const { getByRole } = startRun();
    fireEvent.pointerDown(getByRole("textbox", { name: "Password" }));
    for (let ts = 32; ts <= 32 + 16 * 14; ts += 16) runFrame(ts);
    expect(panel().style.getPropertyValue("--pg2-shake-x")).toBe("0px");
  });

  it("a miss gives no burst and no shake", () => {
    script.lands = false;
    const { getByRole } = startRun();
    fireEvent.pointerDown(getByRole("textbox", { name: "Password" }));
    expect(onHit).not.toHaveBeenCalled();
    runFrame(32);
    expect(panel().style.getPropertyValue("--pg2-shake-x")).toBe("0px");
  });
});
