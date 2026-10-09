import { Profiler } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { dispatch } from "../sim/action-log";
import { S, resetSim } from "../sim/state";
import { createHudBridge, useHud, type HudBridge } from "../ui/use-hud";
import { makeController } from "./ui-harness";

// The HUD reaches React at 4 Hz and at once on a discrete event, never once per
// frame or per tick.

afterEach(() => {
  cleanup();
  resetSim({ seed: "use-hud-reset" });
});

function mount(mode: "survival" | "sandbox" = "survival") {
  const h = makeController({ mode });
  const bridge = createHudBridge();
  const seen = { renders: 0 };
  function Probe({ store }: { store: HudBridge }) {
    const hud = useHud(store);
    return <span data-testid="t">{hud ? `${hud.time.toFixed(2)} ${hud.over ?? ""}` : "none"}</span>;
  }
  // The Profiler counts commits of the probe: one per HUD change React sees.
  render(
    <Profiler id="hud" onRender={() => seen.renders++}>
      <Probe store={bridge} />
    </Profiler>,
  );
  act(() => {
    bridge.connect(h.controller);
    h.controller.start();
  });
  return { ...h, bridge, seen };
}

describe("useHud", () => {
  it("is empty until the controller connects", () => {
    const bridge = createHudBridge();
    function Probe() {
      const hud = useHud(bridge);
      return <span data-testid="t">{hud ? "hud" : "none"}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("t").textContent).toBe("none");
  });

  it("240 ticks at 60 fps (12 s of frames) render at 4 Hz: at most 48 times, not 720", () => {
    const h = mount();
    const before = h.seen.renders;
    // One act per frame: in a browser each animation frame is its own task, so React
    // cannot fold several notifications into one render.
    for (let i = 0; i <= 720; i++) act(() => h.frame(1000 / 60));
    expect(S.tick).toBe(240);
    const renders = h.seen.renders - before;
    expect(renders).toBeLessThanOrEqual(48);
    expect(renders).toBeGreaterThanOrEqual(40);
    expect(screen.getByTestId("t").textContent).toMatch(/^11\.\d\d /);
    h.controller.dispose();
  });

  it("240 ticks at 3x (4 s of frames) render at most 16 times", () => {
    const h = mount();
    act(() => h.controller.setSpeed(3));
    const before = h.seen.renders;
    for (let i = 0; i <= 240; i++) act(() => h.frame(1000 / 60));
    expect(S.tick).toBe(240);
    expect(h.seen.renders - before).toBeLessThanOrEqual(16);
    h.controller.dispose();
  });

  it("shows the end of the run on the very next frame, inside the 250 ms window", () => {
    const h = mount();
    act(() => h.frame(300));
    const before = h.seen.renders;
    act(() => {
      expect(dispatch({ op: 8 }).ok).toBe(true);
      h.frame(16);
    });
    expect(h.seen.renders - before).toBe(1);
    expect(screen.getByTestId("t").textContent).toMatch(/retired$/);
    h.controller.dispose();
  });

  it("shows a placement at once", () => {
    const h = mount("sandbox");
    act(() => h.frame(300));
    const before = h.seen.renders;
    act(() => h.place("waf", -28, 0));
    expect(h.seen.renders - before).toBe(1);
    expect(h.bridge.get()?.milestones.waf).toBe(true);
    h.controller.dispose();
  });
});
