import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { applyKey, applyPointer, createRun, tick } from "../../engine/engine";
import type { GameState } from "../../engine/types";
import type { GeraldData } from "../../engine/events/gerald";
import { HudActions, hudActions } from "../hud-actions";
import { PAINTERS, type HitRegion, type StageLayout } from "../painters";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** A run with `id` forced and advanced into its peak, so its action chip is live. */
function bootWith(id: string): GameState {
  const g = createRun({ seed: 1, daily: false, forceEvent: id });
  applyKey(g, "a"); // the first key starts the run clock
  g.act = "act1";
  g.actElapsedMs = 0;
  for (let i = 0; i < 400; i++) tick(g, 100);
  return g;
}

describe("hudActions", () => {
  it.each([
    ["gerald", "feed-button"],
    ["garden", "basket-button"],
    ["campfire", "stoke-button"],
  ])("%s exposes one action that targets %s", (id, kind) => {
    const actions = hudActions(bootWith(id));
    expect(actions).toHaveLength(1);
    expect(actions[0]!.target).toEqual({ kind });
  });

  it("is empty before any event with a chip is live", () => {
    expect(hudActions(createRun({ seed: 1, daily: false }))).toEqual([]);
  });
});

describe("HudActions", () => {
  it("renders one 44px button per live action and applies its pointer target", () => {
    const g = bootWith("gerald");
    const d = g.events.find((e) => e.defId === "gerald")!.data as GeraldData;
    d.hunger = 70;
    const actions = hudActions(g);
    render(<HudActions g={g} onAction={(t) => applyPointer(g, t)} />);
    const btn = screen.getByRole("button", { name: new RegExp(actions[0]!.label, "i") });
    expect(btn.className).toContain("min-h-11");
    expect(btn.className).toContain("min-w-11");
    fireEvent.click(btn);
    expect(d.hunger).toBe(30); // FEED_RELIEF is 40
  });

  it("renders nothing when no event with chips is live", () => {
    const { container } = render(
      <HudActions g={createRun({ seed: 1, daily: false })} onAction={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the focus where it is on a pointer press, so the soft keyboard stays up", () => {
    const g = bootWith("campfire");
    render(<HudActions g={g} onAction={() => {}} />);
    const btn = screen.getByRole("button");
    // mousedown not cancelled would move focus off the hidden input and close the keyboard.
    expect(fireEvent.mouseDown(btn)).toBe(false);
  });
});

describe("the canvas no longer draws action chips", () => {
  const layout: StageLayout = {
    cellRects: new Map(),
    boxRect: { x: 20, y: 120, w: 520, h: 160 },
    panelRect: { x: 0, y: 0, w: 560, h: 380 },
  };
  it.each(["gerald", "garden", "campfire"])("%s registers no hit regions", (id) => {
    const g = bootWith(id);
    const inst = g.events.find((e) => e.defId === id)!;
    const target: Record<string, unknown> = {};
    const ctx = new Proxy(target, {
      get(t, p: string) {
        if (p === "measureText") return () => ({ width: 40 });
        if (p === "createLinearGradient" || p === "createRadialGradient") {
          return () => ({ addColorStop: () => {} });
        }
        return p in t ? t[p] : () => undefined;
      },
      set(t, p: string, v) {
        t[p] = v;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    const hits: HitRegion[] = [];
    PAINTERS[id]!(ctx, inst, layout, g, 5_000, hits);
    expect(hits).toEqual([]);
  });
});
