import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HudState } from "../controller";
import { dispatch } from "../sim/action-log";
import { CONFIG } from "../sim/config";
import { S, resetSim } from "../sim/state";
import { step } from "../sim/tick";
import { EMPTY_STATS } from "../stats";
import { Inspector } from "../ui/inspector";
import { MetricsPanel } from "../ui/metrics-panel";
import { Report } from "../ui/report";
import { createHudBridge, useHud } from "../ui/use-hud";
import { makeController } from "./ui-harness";

// The inspector, the metrics panel and the end-of-run report, each over a real
// controller and sim.

afterEach(() => {
  cleanup();
  resetSim({ seed: "panels-reset" });
});

function mountWith(
  view: (hud: HudState, h: ReturnType<typeof makeController>) => React.ReactNode,
  mode: "sandbox" | "survival" = "sandbox",
) {
  const h = makeController({ mode });
  const bridge = createHudBridge();
  function Host() {
    const hud = useHud(bridge);
    return hud ? <>{view(hud, h)}</> : null;
  }
  render(<Host />);
  act(() => bridge.connect(h.controller));
  return h;
}

function select(h: ReturnType<typeof makeController>, id: string, x: number, z: number) {
  act(() => {
    h.controller.setTool({ kind: "select" });
    h.aim({ x, z }, id);
    h.controller.tap(0, 0, "mouse");
  });
}

describe("Inspector", () => {
  it("shows the picked node with its upgrade and auto-scaling, and acts on them", () => {
    const h = mountWith((hud, c) => <Inspector hud={hud} controller={c.controller} />);
    act(() => h.place("compute", -16, 0));
    expect(screen.queryByRole("region")).toBeNull();
    select(h, "svc_1", -16, 0);

    const panel = screen.getByRole("region", { name: `${CONFIG.services.compute.name} details` });
    expect(panel).toHaveTextContent(`Tier 1 of ${CONFIG.services.compute.tiers?.length}`);
    expect(panel).toHaveTextContent("100% HP");
    const upgrade = within(panel).getByRole("button", {
      name: `Upgrade $${CONFIG.services.compute.tiers?.[1]?.cost}`,
    });
    fireEvent.click(upgrade);
    expect(S.services[0]!.tier).toBe(2);

    const asg = within(panel).getByRole("button", { name: /Auto-scaling/ });
    expect(asg).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(asg);
    expect(within(panel).getByRole("button", { name: /Auto-scaling/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(panel).toHaveTextContent("1 running");
  });

  it("offers a repair only when damaged, and greys out what the money cannot pay", () => {
    const h = mountWith((hud, c) => <Inspector hud={hud} controller={c.controller} />);
    act(() => h.place("waf", -28, 0));
    select(h, "svc_1", -28, 0);
    expect(screen.queryByRole("button", { name: /^Repair/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Upgrade/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Auto-scaling/ })).toBeNull();
    act(() => {
      S.services[0]!.health = 30;
      S.money = 0;
      h.controller.deselect();
    });
    select(h, "svc_1", -28, 0);
    expect(screen.getByRole("button", { name: /^Repair \$/ })).toBeDisabled();
  });

  it("asks before demolishing, naming the refund, and Cancel keeps the node", () => {
    const h = mountWith((hud, c) => <Inspector hud={hud} controller={c.controller} />);
    act(() => h.place("alb", -16, 0));
    select(h, "svc_1", -16, 0);
    const refund = `$${Math.floor(CONFIG.services.alb.cost / 2)}`;
    fireEvent.click(screen.getByRole("button", { name: `Demolish (refund ${refund})` }));
    expect(screen.getByText(`Demolish for a ${refund} refund?`)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(S.services).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: `Demolish (refund ${refund})` }));
    fireEvent.click(screen.getByRole("button", { name: "Demolish" }));
    expect(S.services).toHaveLength(0);
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("closes", () => {
    const h = mountWith((hud, c) => <Inspector hud={hud} controller={c.controller} />);
    act(() => h.place("alb", -16, 0));
    select(h, "svc_1", -16, 0);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region")).toBeNull();
  });
});

describe("MetricsPanel", () => {
  it("is locked without Monitoring, then lists every node", () => {
    const onClose = vi.fn();
    const h = mountWith((hud) => <MetricsPanel hud={hud} onClose={onClose} />);
    expect(
      screen.getByText("Place a Monitoring service to unlock live metrics."),
    ).toBeInTheDocument();
    act(() => {
      h.place("compute", -16, 0);
      h.place("monitor", -16, 8);
      step(20);
      h.controller.deselect();
    });
    const rows = screen.getAllByRole("row");
    expect(rows.map((r) => r.querySelector("th")?.textContent)).toEqual([
      "Service",
      CONFIG.services.compute.name,
      CONFIG.services.monitor.name,
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Report", () => {
  it("tells why the run ended, the score against the best, failures and money", () => {
    const onPlayAgain = vi.fn();
    const best = { ...EMPTY_STATS, bestSeconds: 125, bestScore: 4321, runs: 3 };
    const h = mountWith(
      (hud) => <Report hud={hud} best={best} onPlayAgain={onPlayAgain} />,
      "survival",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => {
      h.place("waf", -28, 0);
      S.failuresByReason = { fail_no_route: 4, fail_queue_full: 9 };
      S.failures.READ = 13;
      expect(dispatch({ op: 8 }).ok).toBe(true);
      h.controller.deselect();
    });
    const dialog = screen.getByRole("dialog", { name: "Run over" });
    expect(dialog).toHaveTextContent("You ended the run.");
    expect(dialog).toHaveTextContent("Best on this device: 2:05, 4,321");
    const failures = within(dialog).getByText("Top failures").nextElementSibling as HTMLElement;
    expect(
      within(failures)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Queue full9", "No route4"]);
    expect(dialog).toHaveTextContent(`Hardware-$${CONFIG.services.waf.cost}`);
    fireEvent.click(within(dialog).getByRole("button", { name: "Play again" }));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });
});
