import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HudState } from "../controller";
import { dailyRun } from "../daily/daily";
import { resetSim } from "../sim/state";
import { StatusBar } from "../ui/hud";
import { createHudBridge, useHud } from "../ui/use-hud";
import { makeController } from "./ui-harness";

// The HUD says so while a Daily Incident is live, and stops saying so on every path that
// clears the daily (they all go through freshRun).

const DAY = "2026-10-15";

afterEach(() => {
  cleanup();
  resetSim({ seed: "hud-daily-reset" });
});

function mount(mode: "sandbox" | "survival" = "survival") {
  const h = makeController({ mode });
  const bridge = createHudBridge();
  function Host() {
    const hud: HudState | null = useHud(bridge);
    return hud ? <StatusBar hud={hud} /> : null;
  }
  render(<Host />);
  h.controller.start();
  act(() => bridge.connect(h.controller));
  act(() => h.frame(16));
  return h;
}

const marker = () => screen.queryByTestId("failover-daily-marker");

describe("the Daily marker", () => {
  it("shows during a daily with the day's profile name", () => {
    const h = mount();
    act(() => h.controller.startDaily(DAY));
    expect(marker()?.textContent).toBe(`Daily: ${dailyRun(DAY).profile.name}`);
    expect(h.controller.getHud().daily?.profile).toBe(dailyRun(DAY).profile.name);
  });

  it("is not there in free survival or in Sandbox", () => {
    mount("survival");
    expect(marker()).toBeNull();
    cleanup();
    mount("sandbox");
    expect(marker()).toBeNull();
  });

  it("stays after the daily run ends, where the report takes over", () => {
    const h = mount();
    act(() => h.controller.startDaily(DAY));
    expect(marker()).not.toBeNull();
    expect(h.controller.getHud().daily?.day).toBe(DAY);
  });

  it("truncates a long name instead of widening the bar", () => {
    const h = mount();
    act(() => h.controller.startDaily(DAY));
    expect(marker()?.className).toContain("truncate");
    expect(marker()?.className).toMatch(/max-w-/);
  });

  describe("is gone on every path that clears the daily", () => {
    it("restart (Play again)", () => {
      const h = mount();
      act(() => h.controller.startDaily(DAY));
      expect(marker()).not.toBeNull();
      act(() => h.controller.restart());
      expect(marker()).toBeNull();
    });

    it("a switch to Sandbox", () => {
      const h = mount();
      act(() => h.controller.startDaily(DAY));
      expect(marker()).not.toBeNull();
      act(() => h.controller.restart(undefined, "sandbox"));
      expect(marker()).toBeNull();
    });

    it("a load or an import (replaceRun)", async () => {
      const h = mount();
      act(() => h.controller.startDaily(DAY));
      expect(marker()).not.toBeNull();
      await act(async () => {
        await h.controller.replaceRun(() => {
          resetSim({ seed: "a-loaded-run", mode: "survival" });
        });
      });
      expect(marker()).toBeNull();
    });
  });
});
