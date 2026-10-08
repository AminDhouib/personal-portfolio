import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { GameState } from "../../engine/types";

// One spy painter stands in for the cast: it records the clock it was given and
// registers an alien hit circle, as the galaga painter does.
const seen: number[] = [];
vi.mock("../painters", () => ({
  FINALE_INST: { defId: "finale-missiles" },
  PAINTERS: {
    galaga: (
      _ctx: unknown,
      _inst: unknown,
      _layout: unknown,
      _g: unknown,
      tMs: number,
      hits: unknown[],
    ) => {
      seen.push(tMs);
      hits.push({
        shape: "circle",
        x: 50,
        y: 40,
        w: 0,
        h: 0,
        r: 22,
        target: { kind: "alien", id: 3 },
      });
    },
  },
}));

import { CanvasOverlay, type OverlayHandle } from "../canvas-overlay";

interface Arc {
  x: number;
  y: number;
  fill: string;
}

function fakeContext(arcs: Arc[]) {
  let pending: { x: number; y: number } | null = null;
  const ctx = {
    fillStyle: "",
    globalAlpha: 1,
    setTransform() {},
    clearRect() {},
    save() {},
    restore() {},
    beginPath() {},
    arc(x: number, y: number) {
      pending = { x, y };
    },
    fill() {
      if (pending) arcs.push({ ...pending, fill: ctx.fillStyle });
      pending = null;
    },
  };
  return ctx;
}

const game = {
  version: 1,
  events: [{ defId: "galaga", phase: "peak", data: {} }],
  finale: null,
} as unknown as GameState;

describe("CanvasOverlay hit feedback", () => {
  let arcs: Arc[];

  beforeEach(() => {
    seen.length = 0;
    arcs = [];
    const ctx = fakeContext(arcs);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      (() => ctx) as unknown as HTMLCanvasElement["getContext"],
    );
    vi.spyOn(HTMLCanvasElement.prototype, "clientWidth", "get").mockReturnValue(300);
    vi.spyOn(HTMLCanvasElement.prototype, "clientHeight", "get").mockReturnValue(200);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function mount() {
    const ref = createRef<OverlayHandle>();
    render(
      <div>
        <CanvasOverlay ref={ref} />
      </div>,
    );
    return ref.current!;
  }

  it("bursts sparks from the centre of the target that was hit", () => {
    const overlay = mount();
    overlay.paint(game, 1_000);
    overlay.onHit({ kind: "alien", id: 3 }, 999, 999);
    arcs.length = 0;
    overlay.paint(game, 1_016);
    expect(arcs.length).toBeGreaterThan(0);
    // The hit-stop holds the sparks at their spawn point, the alien's centre.
    expect(arcs.every((a) => a.x === 50 && a.y === 40)).toBe(true);
    expect(arcs[0]!.fill).toBe("#f87171");
  });

  it("holds the painters' clock still for the hit-stop, then lets it run", () => {
    const overlay = mount();
    overlay.paint(game, 1_000);
    overlay.paint(game, 1_016);
    overlay.onHit({ kind: "alien", id: 3 }, 0, 0);
    overlay.paint(game, 1_032);
    overlay.paint(game, 1_048);
    overlay.paint(game, 1_080);
    expect(seen.slice(2)).toEqual([1_016, 1_016, 1_016]);
    overlay.paint(game, 1_100);
    expect(seen.at(-1)).toBeGreaterThan(1_016);
  });

  it("a press on a non-target gives no sparks and no stop", () => {
    const overlay = mount();
    overlay.paint(game, 1_000);
    overlay.onHit({ kind: "cell", id: 1 }, 10, 10);
    arcs.length = 0;
    overlay.paint(game, 1_016);
    expect(arcs).toHaveLength(0);
    expect(seen.at(-1)).toBe(1_016);
  });
});
