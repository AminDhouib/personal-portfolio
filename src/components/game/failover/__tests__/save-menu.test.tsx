import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../sim/action-log";
import { S, resetSim } from "../sim/state";
import { step } from "../sim/tick";
import { SAVE_KEY } from "../persist/save-schema";
import { SaveMenu } from "../ui/save-menu";
import { createHudBridge, useHud } from "../ui/use-hud";
import { makeController } from "./ui-harness";

// The one-slot save menu over a real controller and sim: Save writes the slot,
// Load replays it into the live run (once, with the board held meanwhile),
// Delete asks first, and every refusal says why in words.

// A load can fail for a reason the replay does not own (a fault, a torn-down game).
const loadFault = vi.hoisted(() => ({ on: false }));

vi.mock("../persist/save", async (importOriginal) => {
  const real = await importOriginal<typeof import("../persist/save")>();
  return {
    ...real,
    loadSave: (...args: Parameters<typeof real.loadSave>) =>
      loadFault.on ? Promise.reject(new TypeError("a fault in the load")) : real.loadSave(...args),
  };
});

// A fault inside the replay itself: the sim's step throws once a load has stepped this often.
const stepFault = vi.hoisted(() => ({ after: null as number | null, calls: 0 }));

vi.mock("../sim/tick", async (importOriginal) => {
  const real = await importOriginal<typeof import("../sim/tick")>();
  return {
    ...real,
    step: (...args: Parameters<typeof real.step>) => {
      if (stepFault.after !== null && ++stepFault.calls > stepFault.after) {
        throw new Error("a fault in the sim");
      }
      return real.step(...args);
    },
  };
});

// The menu imports the save code (and zod) on open. Fetch it once up front, with room for a
// loaded machine, so each test waits on the menu and not on the first transform of zod.
beforeAll(async () => {
  await import("../persist/save");
}, 30_000);

beforeEach(() => {
  loadFault.on = false;
  stepFault.after = null;
  stepFault.calls = 0;
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  resetSim({ seed: "save-menu-reset" });
});

async function mount() {
  const h = makeController({ mode: "sandbox" });
  const bridge = createHudBridge();
  const onClose = vi.fn();
  function Host() {
    const hud = useHud(bridge);
    return hud ? <SaveMenu hud={hud} controller={h.controller} onClose={onClose} /> : null;
  }
  render(<Host />);
  act(() => {
    bridge.connect(h.controller);
    h.controller.start();
  });
  // The save code (and zod with it) arrives on open, not with the game.
  await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
  return { ...h, onClose };
}

const dialog = () => screen.getByRole("dialog", { name: "Save Game" });

describe("SaveMenu", () => {
  it("says the slot is empty, saves the run, and names what it holds", async () => {
    await mount();
    expect(dialog()).toHaveTextContent("No saved game found.");
    expect(screen.getByRole("button", { name: "Load" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    act(() => {
      step(1200);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status")).toHaveTextContent("Game Saved!");
    expect(JSON.parse(window.localStorage.getItem(SAVE_KEY)!)).toMatchObject({
      v: 1,
      mode: "sandbox",
      tick: 1200,
    });
    expect(dialog()).toHaveTextContent(/Sandbox Mode, 1:00 in, saved /);
    expect(screen.getByRole("button", { name: "Load" })).toBeEnabled();
  });

  it("loads the slot back into the live run, once, holding the board meanwhile", async () => {
    const h = await mount();
    act(() => {
      expect(dispatch({ op: 0, type: "waf", x: -28, z: 0 }).ok).toBe(true);
      step(200);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => {
      expect(dispatch({ op: 0, type: "compute", x: -16, z: 0 }).ok).toBe(true);
      step(300);
    });
    const swap = vi.spyOn(h.controller, "replaceRun");
    const load = screen.getByRole("button", { name: "Load" });
    fireEvent.click(load);
    // The swap began at once: the board is held and Load cannot be pressed again.
    expect(h.controller.getHud().loading).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the save...");
    expect(load).toBeDisabled();
    fireEvent.click(load);
    await waitFor(() => expect(h.controller.getHud().loading).toBe(false));
    expect(swap).toHaveBeenCalledTimes(1);
    expect(S.tick).toBe(200);
    expect(S.services.map((s) => s.type)).toEqual(["waf"]);
    expect(h.controller.getHud().paused).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(/^Loaded save from /);
  });

  it("puts each reason a run cannot be saved in words", async () => {
    await mount();
    const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const cases: [() => void, string][] = [
      [() => (S.tick = 36_001), "This run is past 30 minutes, too long to save."],
      [() => S.log.push([0, 0, 0, 4000, 0]), "This run could not be written to a save."],
      [() => (S.logOverflow = true), "This run has more actions than a save can hold."],
      [() => dispatch({ op: 8 }), "The run is over, so there is nothing to save."],
    ];
    for (const [spoil, text] of cases) {
      act(() => {
        resetSim({ seed: "spoilt", mode: "sandbox" });
        spoil();
      });
      save();
      expect(screen.getByRole("status")).toHaveTextContent(text);
    }
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
  });

  it("leaves a newer build's save alone, and says so", async () => {
    const newer = JSON.stringify({ v: 2, blob: "from the future" });
    window.localStorage.setItem(SAVE_KEY, newer);
    await mount();
    expect(dialog()).toHaveTextContent("from a newer version of the game");
    expect(screen.getByRole("button", { name: "Load" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status")).toHaveTextContent("from a newer version of the game");
    expect(window.localStorage.getItem(SAVE_KEY)).toBe(newer);
  });

  it("says an unreadable slot is unreadable and lets a new save replace it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    window.localStorage.setItem(SAVE_KEY, "{not json");
    await mount();
    expect(dialog()).toHaveTextContent("The save file may be corrupted.");
    expect(screen.getByRole("button", { name: "Load" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("status")).toHaveTextContent("Game Saved!");
  });

  it("refuses a save the replay refuses, and leaves the run alone", async () => {
    // It parses, but its one action (traffic toggle 2, neither on nor off) does not decode.
    window.localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ v: 1, savedAt: 1, mode: "sandbox", seed: "x", tick: 0, log: "0,7,2" }),
    );
    const h = await mount();
    act(() => {
      expect(dispatch({ op: 0, type: "waf", x: -28, z: 0 }).ok).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() => expect(h.controller.getHud().loading).toBe(false));
    expect(screen.getByRole("status")).toHaveTextContent(
      "Failed to load game. The save file may be corrupted.",
    );
    expect(S.services.map((s) => s.type)).toEqual(["waf"]);
  });

  it("catches a load that fails for a reason of its own, says so and keeps the run", async () => {
    const h = await mount();
    act(() => {
      expect(dispatch({ op: 0, type: "waf", x: -28, z: 0 }).ok).toBe(true);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => {
      expect(dispatch({ op: 0, type: "compute", x: -16, z: 0 }).ok).toBe(true);
      step(100);
    });
    loadFault.on = true;
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Failed to load game. The save file may be corrupted.",
      ),
    );
    expect(h.controller.getHud().loading).toBe(false);
    expect(screen.getByRole("button", { name: "Load" })).toBeEnabled();
    expect(S.services.map((s) => s.type)).toEqual(["waf", "compute"]);
    expect(S.tick).toBe(100);
  });

  it("starts a fresh paused run when the replay faults partway, not the half-built one", async () => {
    const h = await mount();
    act(() => {
      expect(dispatch({ op: 0, type: "waf", x: -28, z: 0 }).ok).toBe(true);
      step(3000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    // The replay steps once per 500-tick chunk here; it faults in the third.
    stepFault.after = 2;
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "Failed to load game. The save file may be corrupted.",
      ),
    );
    expect(stepFault.calls).toBe(3);
    expect(S.tick).toBe(0);
    expect(S.services).toEqual([]);
    expect(S.log).toEqual([]);
    expect(h.controller.getHud()).toMatchObject({ loading: false, paused: true, time: 0 });
  });

  it("stops a load mid-replay when the game is torn down, off the shared sim", async () => {
    const h = await mount();
    act(() => {
      step(3000);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    act(() => {
      resetSim({ seed: "elsewhere", mode: "sandbox" });
    });
    const swap = vi.spyOn(h.controller, "replaceRun");
    fireEvent.click(screen.getByRole("button", { name: "Load" }));
    // What unmounting the game does: dispose the controller while the replay is in its first chunk.
    h.controller.dispose();
    await act(async () => {
      await swap.mock.results[0]?.value.catch(() => undefined);
    });
    const stoppedAt = S.tick;
    expect(stoppedAt).toBeLessThan(3000);
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(S.tick).toBe(stoppedAt);
  });

  it("deletes the slot after asking, and closes", async () => {
    const h = await mount();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(dialog()).toHaveTextContent("Delete the save?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete the save" }));
    expect(window.localStorage.getItem(SAVE_KEY)).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent("Save deleted.");
    expect(dialog()).toHaveTextContent("No saved game found.");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(h.onClose).toHaveBeenCalledTimes(1);
  });
});
