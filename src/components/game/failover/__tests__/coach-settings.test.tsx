import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dispatch } from "../sim/action-log";
import { resetSim } from "../sim/state";
import { Coach } from "../ui/coach";
import { Settings } from "../ui/settings";
import { createHudBridge, useHud } from "../ui/use-hud";
import { makeController } from "./ui-harness";

// The first-run coach, driven through its five steps by the sim itself, and
// the Settings panel (sound, graphics tier, coach replay, the motion note).

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetSim({ seed: "coach-settings-reset" });
});

function mountCoach(onDone: (skipped: boolean) => void) {
  const h = makeController({ startPaused: true });
  const bridge = createHudBridge();
  function Host() {
    const hud = useHud(bridge);
    return hud ? <Coach hud={hud} onDone={onDone} /> : null;
  }
  render(<Host />);
  act(() => bridge.connect(h.controller));
  return h;
}

const coach = () => screen.queryByRole("region", { name: "Welcome, Architect!" });

describe("Coach", () => {
  it("moves through its five steps as the board changes, then finishes once", () => {
    const onDone = vi.fn();
    const h = mountCoach(onDone);
    const step = (n: number, title: string) => {
      expect(coach()).toHaveTextContent(`Step ${n} of 5`);
      expect(within(coach()!).getByRole("heading")).toHaveTextContent(title);
    };
    step(1, "Deploy Firewall");
    act(() => h.place("waf", -28, 0));
    step(2, "Connect to Internet");
    act(() => {
      expect(dispatch({ op: 1, from: "internet", to: "svc_1" }).ok).toBe(true);
      h.controller.deselect();
    });
    step(3, "Deploy Compute Server");
    act(() => h.place("compute", -16, 0));
    step(4, "Deploy SQL Database");
    act(() => h.place("db", -4, 0));
    step(5, "Infrastructure Ready!");
    expect(onDone).not.toHaveBeenCalled();
    act(() => h.controller.togglePause());
    expect(coach()).toBeNull();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith(false);
  });

  it("can be skipped", () => {
    const onDone = vi.fn();
    mountCoach(onDone);
    fireEvent.click(screen.getByRole("button", { name: "Skip Tutorial" }));
    expect(onDone).toHaveBeenCalledWith(true);
  });

  it("is plain ASCII text, with no upstream markup left in it", () => {
    mountCoach(() => undefined);
    expect(coach()!.innerHTML).not.toMatch(/&lt;|class=\\"text-/);
    expect(coach()).toHaveTextContent("Pick FW in the Front Door tab");
  });
});

describe("Settings", () => {
  function mountSettings(onReplayCoach = vi.fn(), onClose = vi.fn()) {
    const h = makeController();
    const bridge = createHudBridge();
    function Host() {
      const hud = useHud(bridge);
      return hud ? (
        <Settings
          hud={hud}
          controller={h.controller}
          onReplayCoach={onReplayCoach}
          onClose={onClose}
        />
      ) : null;
    }
    render(<Host />);
    act(() => bridge.connect(h.controller));
    return { h, onReplayCoach, onClose };
  }

  it("switches the sound cues on and off", () => {
    const { h } = mountSettings();
    fireEvent.click(screen.getByRole("button", { name: "Sound on" }));
    expect(h.controller.getHud().soundOn).toBe(true);
    expect(screen.getByRole("button", { name: "Sound off" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("pins the graphics tier and keeps it in failover:gfx", () => {
    const { h } = mountSettings();
    expect(screen.getByRole("radio", { name: "Auto" })).toBeChecked();
    expect(screen.getByText("Drawing at full detail.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Low" }));
    expect(window.localStorage.getItem("failover:gfx")).toBe('{"v":1,"tier":"low"}');
    expect(h.controller.getHud()).toMatchObject({ gfxPref: "low", tier: "low" });
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    expect(screen.getByText(/reduced detail/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(h.controller.getHud()).toMatchObject({ gfxPref: "high", tier: "high" });
  });

  it("offers the coach again, says why motion stays, and closes", () => {
    const { onReplayCoach, onClose } = mountSettings();
    fireEvent.click(screen.getByRole("button", { name: /Show the tour again/ }));
    expect(onReplayCoach).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/keeps its motion when your system asks for less/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sizes its controls for a thumb", () => {
    mountSettings();
    const region = screen.getByRole("region", { name: "Settings" });
    for (const el of [
      ...within(region).getAllByRole("button"),
      ...within(region)
        .getAllByRole("radio")
        .map((r) => r.closest("label")!),
    ]) {
      expect(el.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["pointer-coarse:min-h-11", "pointer-coarse:min-w-11"]),
      );
    }
  });
});
