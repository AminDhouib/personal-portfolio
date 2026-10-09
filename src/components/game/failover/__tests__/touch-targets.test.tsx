import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FailoverGame } from "../../failover";
import { FailoverController } from "../controller";
import type { FailoverScene, PickResult } from "../scene/scene";
import { CONFIG } from "../sim/config";
import { dispatch } from "../sim/action-log";
import { S, resetSim } from "../sim/state";

// The game on a phone (a coarse pointer): it opens in a full-screen layer that
// stops the page scrolling, a finger taps, pans and pinches, a placement asks
// beside its ghost, and every control the game owns is at least 44 px square
// (min-h-11 min-w-11), as the other games size theirs; the classes are keyed
// to a coarse pointer so the desktop layout is unchanged.

const scene = vi.hoisted(() => ({ pick: null as PickResult | null, broken: false }));

vi.mock("../scene/scene", () => ({
  createFailoverScene: (): FailoverScene => ({
    render: () => {
      if (scene.broken) throw new Error("boom");
    },
    resize: () => undefined,
    setCamera: () => undefined,
    setOverlay: () => undefined,
    setTier: () => undefined,
    capture: () => null,
    pick: () => scene.pick,
    dispose: () => undefined,
  }),
}));

class NoopObserver {
  observe() {}
  disconnect() {}
}

const TOUCH = ["pointer-coarse:min-h-11", "pointer-coarse:min-w-11"];

function expectTouch(el: Element) {
  const name = el.getAttribute("aria-label") ?? el.textContent;
  expect({ name, classes: el.className.split(/\s+/) }).toEqual({
    name,
    classes: expect.arrayContaining(TOUCH),
  });
}

/** Every button, tab, radio label and visible field in the game, sized for a thumb. */
function sweep(): number {
  const board = screen.getByLabelText(/Failover game board/);
  const controls = board.querySelectorAll(
    "button, [role=tab], label, a, select, input:not(.sr-only)",
  );
  controls.forEach(expectTouch);
  return controls.length;
}

function stubPointer(coarse: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : !coarse,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

// The save menu imports the save code (and zod) on open; fetch it once up front, so the
// menu test waits on the menu and not on the first transform under a loaded machine.
beforeAll(async () => {
  await import("../persist/save");
}, 30_000);

beforeEach(() => {
  scene.pick = null;
  scene.broken = false;
  window.localStorage.clear();
  window.localStorage.setItem("failover:coach", '{"v":1,"done":true}');
  document.documentElement.style.overflow = "";
  stubPointer(true);
  vi.stubGlobal("ResizeObserver", NoopObserver);
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => undefined);
  // jsdom has PointerEvent but no pointer capture.
  HTMLElement.prototype.setPointerCapture = () => undefined;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetSim({ seed: "touch-targets-reset" });
});

const board = () => screen.getByLabelText(/Failover game board/);
const host = () => board().querySelector("canvas")!.parentElement!;

function touch(type: "down" | "move" | "up", id: number, x: number, y: number) {
  const init = { pointerId: id, pointerType: "touch", clientX: x, clientY: y };
  if (type === "down") fireEvent.pointerDown(host(), init);
  else if (type === "move") fireEvent.pointerMove(host(), init);
  else fireEvent.pointerUp(host(), init);
}

describe("Failover touch targets", () => {
  it("sizes the first-run coach, the toolbar and the closed build menu", () => {
    window.localStorage.removeItem("failover:coach");
    render(<FailoverGame />);
    expect(screen.getByRole("button", { name: "Skip Tutorial" })).toBeInTheDocument();
    expect(sweep()).toBeGreaterThan(10);
  });

  it("sizes the open build menu, its tabs and services, and the armed chip", () => {
    render(<FailoverGame />);
    expect(screen.getAllByRole("tab")).toHaveLength(5);
    sweep();
    const waf = CONFIG.services.waf;
    fireEvent.click(screen.getByRole("button", { name: `${waf.name} $${waf.cost}` }));
    expect(screen.getByRole("button", { name: "Disarm" })).toBeInTheDocument();
    sweep();
    fireEvent.click(screen.getByRole("button", { name: "Disarm" }));
    expect(screen.getByRole("button", { name: "Build" })).toBeInTheDocument();
    sweep();
  });

  it("sizes the confirm pair, the inspector, Settings and the metrics panel", () => {
    render(<FailoverGame />);
    act(() => {
      expect(dispatch({ op: 0, type: "compute", x: -16, z: 0 }).ok).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Demolish (3)" }));
    scene.pick = { cell: { x: -16, z: 0 }, node: "svc_1" };
    touch("down", 1, 100, 100);
    touch("up", 1, 100, 100);
    expect(screen.getByRole("group", { name: "Demolish Compute?" })).toBeInTheDocument();
    sweep();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    fireEvent.click(screen.getByRole("button", { name: "Select (1)" }));
    touch("down", 2, 100, 100);
    touch("up", 2, 100, 100);
    fireEvent.click(screen.getByRole("button", { name: /^Demolish \(refund/ }));
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Metrics" }));
    expect(screen.getByRole("region", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    sweep();
  });

  it("sizes the save menu, reached from Settings, and its delete check", async () => {
    render(<FailoverGame />);
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Save or load" }));
    expect(screen.queryByRole("region", { name: "Settings" })).toBeNull();
    const save = await screen.findByRole("button", { name: "Save" });
    await waitFor(() => expect(save).toBeEnabled());
    sweep();
    fireEvent.click(save);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByRole("button", { name: "Delete the save" })).toBeInTheDocument();
    sweep();
  });

  it("sizes the share dialog's field and copy button, and a shared link's dialog", async () => {
    render(<FailoverGame />);
    act(() => {
      expect(dispatch({ op: 0, type: "waf", x: -28, z: 0 }).ok).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(screen.getByRole("textbox", { name: "Link to this build" })).toBeInTheDocument();
    expect(sweep()).toBeGreaterThan(10);
    const url = (screen.getByRole("textbox") as HTMLInputElement).value;
    cleanup();

    window.history.replaceState(null, "", new URL(url).pathname + new URL(url).search);
    render(<FailoverGame />);
    expect(screen.getByRole("button", { name: "Build it" })).toBeInTheDocument();
    sweep();
    fireEvent.click(screen.getByRole("button", { name: "Build it" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Build it" })).toBeNull());
    sweep();
    window.history.replaceState(null, "", "/");
  });

  it("sizes Play again on the report and Reload on the crash card", () => {
    render(<FailoverGame />);
    act(() => {
      S.over = { reason: "money", atTick: 0 };
      fireEvent.click(screen.getByRole("button", { name: "Speed 2x" }));
    });
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
    sweep();
    cleanup();

    const frames: ((t: number) => void)[] = [];
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
    scene.broken = true;
    render(<FailoverGame />);
    act(() => frames.shift()?.(1000));
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    sweep();
  });
});

describe("Failover on a phone", () => {
  it("opens full screen, holds the page still, and lets the player out and back", () => {
    render(<FailoverGame />);
    expect(board()).toHaveAttribute("data-sheet", "true");
    expect(board().className).toContain("h-[100dvh]");
    expect(board().className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(document.documentElement.style.overflow).toBe("hidden");
    fireEvent.click(screen.getByRole("button", { name: "Exit full screen" }));
    expect(board()).not.toHaveAttribute("data-sheet");
    expect(document.documentElement.style.overflow).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Full screen" }));
    expect(document.documentElement.style.overflow).toBe("hidden");
    cleanup();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("stays inline with no full-screen control for a mouse", () => {
    stubPointer(false);
    render(<FailoverGame />);
    expect(board()).not.toHaveAttribute("data-sheet");
    expect(screen.queryByRole("button", { name: /full screen/i })).toBeNull();
    expect(document.documentElement.style.overflow).toBe("");
  });

  it("keeps the board from scrolling the page under a finger", () => {
    render(<FailoverGame />);
    expect(host().className.split(/\s+/)).toContain("touch-none");
  });

  it("places by tap, ghost and Confirm beside it", () => {
    render(<FailoverGame />);
    fireEvent.click(screen.getByRole("tab", { name: "Compute" }));
    const compute = CONFIG.services.compute;
    fireEvent.click(screen.getByRole("button", { name: `${compute.name} $${compute.cost}` }));
    scene.pick = { cell: { x: 0, z: 8 }, node: null };
    touch("down", 1, 200, 200);
    touch("up", 1, 200, 200);
    expect(S.services).toHaveLength(0);
    const pair = screen.getByRole("group", { name: "Build Compute here?" });
    expect(pair.style.left).toMatch(/px$/);
    fireEvent.click(within(pair).getByRole("button", { name: "Confirm" }));
    expect(S.services.map((s) => s.type)).toEqual(["compute"]);
    expect(screen.queryByRole("group", { name: "Build Compute here?" })).toBeNull();
    // The arm is sticky: the sheet stays a chip and the next tap builds another.
    expect(screen.getByRole("button", { name: "Disarm" })).toBeInTheDocument();
    scene.pick = { cell: { x: 0, z: 20 }, node: null };
    touch("down", 2, 200, 260);
    touch("up", 2, 200, 260);
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(S.services.map((s) => s.type)).toEqual(["compute", "compute"]);
  });

  it("pans with one finger's drag, pans and pinches with two, and taps with neither", () => {
    const tap = vi.spyOn(FailoverController.prototype, "tap");
    const drag = vi.spyOn(FailoverController.prototype, "dragBy");
    const zoom = vi.spyOn(FailoverController.prototype, "zoom");
    render(<FailoverGame />);

    touch("down", 1, 100, 100);
    touch("move", 1, 140, 100);
    touch("up", 1, 140, 100);
    expect(drag).toHaveBeenCalledWith(40, 0);
    expect(tap).not.toHaveBeenCalled();

    drag.mockClear();
    touch("down", 1, 100, 100);
    touch("down", 2, 200, 100);
    touch("move", 2, 300, 100);
    // Half the moving finger's travel pans; the spread between the two pinches.
    expect(drag).toHaveBeenCalledWith(50, 0);
    expect(zoom).toHaveBeenCalledWith(2);
    touch("up", 2, 300, 100);
    touch("up", 1, 100, 100);
    expect(tap).not.toHaveBeenCalled();

    touch("down", 3, 50, 60);
    touch("up", 3, 51, 61);
    expect(tap).toHaveBeenCalledWith(51, 61, "touch");
  });
});
