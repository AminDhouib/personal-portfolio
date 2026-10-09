import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "../sim/config";
import { resetSim } from "../sim/state";
import { CATEGORIES, SHORT_NAME } from "../ui/catalog";
import { ToolSheet } from "../ui/tool-sheet";
import { createHudBridge, useHud } from "../ui/use-hud";
import { makeController } from "./ui-harness";

// The build palette: categories, arming, prices and affordability, the tab
// keys, and on a phone the sheet that collapses to a chip.

afterEach(() => {
  cleanup();
  resetSim({ seed: "tool-sheet-reset" });
});

const label = (type: ServiceType) => `${CONFIG.services[type].name} $${CONFIG.services[type].cost}`;

function mount({ coarse = false, money }: { coarse?: boolean; money?: number } = {}) {
  const h = makeController();
  const bridge = createHudBridge();
  function Sheet() {
    const hud = useHud(bridge);
    if (!hud) return null;
    return (
      <ToolSheet
        hud={money === undefined ? hud : { ...hud, money }}
        controller={h.controller}
        coarse={coarse}
      />
    );
  }
  render(<Sheet />);
  act(() => bridge.connect(h.controller));
  return h;
}

describe("the catalog", () => {
  it("puts every service in exactly one of five categories, with a short label", () => {
    expect(CATEGORIES.map((c) => c.id)).toEqual(["frontdoor", "compute", "data", "async", "ops"]);
    const listed = CATEGORIES.flatMap((c) => c.types);
    expect([...listed].sort()).toEqual([...SERVICE_TYPES].sort());
    expect(new Set(listed).size).toBe(listed.length);
    for (const type of SERVICE_TYPES) expect(SHORT_NAME[type].length).toBeGreaterThan(0);
  });
});

describe("ToolSheet", () => {
  it("shows the front door first, each service with its price", () => {
    mount();
    const panel = screen.getByRole("tabpanel");
    const names = within(panel)
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(
      ["dns", "cdn", "waf", "auth", "apigw", "alb"].map((t) => label(t as ServiceType)),
    );
    expect(within(panel).getByRole("button", { name: label("waf") })).toHaveTextContent(
      `${SHORT_NAME.waf}$${CONFIG.services.waf.cost}`,
    );
  });

  it("arms a service, and it stays armed after a placement", () => {
    const h = mount();
    fireEvent.click(screen.getByRole("button", { name: label("waf") }));
    expect(h.controller.getHud().tool).toEqual({ kind: "place", service: "waf" });
    expect(screen.getByRole("button", { name: label("waf") })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    act(() => {
      h.aim({ x: -28, z: 0 });
      h.controller.tap(0, 0, "mouse");
    });
    expect(h.controller.getHud().tool).toEqual({ kind: "place", service: "waf" });
  });

  it("greys out what the money cannot buy, but keeps the armed one", () => {
    mount({ money: CONFIG.services.waf.cost - 1 });
    const waf = screen.getByRole("button", { name: label("waf") });
    expect(waf).toBeDisabled();
    expect(waf).toHaveAttribute("title", `${CONFIG.services.waf.name}: Not enough money`);
    const cheap = (["dns", "cdn", "waf", "auth", "apigw", "alb"] as ServiceType[]).filter(
      (t) => CONFIG.services[t].cost < CONFIG.services.waf.cost,
    );
    for (const t of cheap) expect(screen.getByRole("button", { name: label(t) })).toBeEnabled();
  });

  it("moves between categories with the arrow keys, Home and End", () => {
    mount();
    const tabs = () => screen.getAllByRole("tab");
    const selected = () => tabs().find((t) => t.getAttribute("aria-selected") === "true");
    expect(selected()).toHaveTextContent("Front Door");
    fireEvent.keyDown(tabs()[0]!, { key: "ArrowRight" });
    expect(selected()).toHaveTextContent("Compute");
    expect(document.activeElement).toBe(selected());
    expect(screen.getByRole("button", { name: label("gpu") })).toBeInTheDocument();
    fireEvent.keyDown(selected()!, { key: "End" });
    expect(selected()).toHaveTextContent("Ops");
    fireEvent.keyDown(selected()!, { key: "ArrowRight" });
    expect(selected()).toHaveTextContent("Front Door");
    fireEvent.keyDown(selected()!, { key: "ArrowLeft" });
    expect(selected()).toHaveTextContent("Ops");
    fireEvent.keyDown(selected()!, { key: "Home" });
    expect(selected()).toHaveTextContent("Front Door");
    expect(tabs().filter((t) => t.tabIndex === 0)).toHaveLength(1);
  });

  it("gives every tab and service a 44 px target on a coarse pointer", () => {
    mount();
    for (const el of [
      ...screen.getAllByRole("tab"),
      ...within(screen.getByRole("tabpanel")).getAllByRole("button"),
    ]) {
      expect(el.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["pointer-coarse:min-h-11", "pointer-coarse:min-w-11"]),
      );
    }
  });

  it("on a phone, collapses to a chip once armed: reopen, or disarm", () => {
    const h = mount({ coarse: true });
    fireEvent.click(screen.getByRole("button", { name: label("waf") }));
    expect(screen.queryByRole("tabpanel")).toBeNull();
    expect(screen.getByRole("group")).toHaveTextContent(label("waf"));

    fireEvent.click(screen.getByRole("button", { name: "Open the build menu" }));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide the build menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Disarm" }));
    expect(h.controller.getHud().tool).toEqual({ kind: "select" });
    expect(screen.getByRole("button", { name: "Build" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });

  it("on a desktop, stays open after arming", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: label("alb") }));
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hide the build menu" })).toBeNull();
  });
});
