import { describe, expect, it } from "vitest";
import { applyKey, createRun, tick } from "../../engine/engine";
import type { GameState } from "../../engine/types";
import { PAINTERS, type HitRegion, type StageLayout } from "../painters";
import { hudSlots } from "../hud-slots";

/** Names every crisis meter paints as its label (drawCrisisMeter writes it above the bar). */
const METER_LABELS = new Set(["HIVE", "GERALD", "FUEL"]);

/** A recording 2D context: every call is a no-op; fillText calls log their text and y. */
function recordingCtx() {
  const texts: { text: string; y: number }[] = [];
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(t, p: string) {
      if (p === "measureText") return () => ({ width: 40 });
      if (p === "createLinearGradient" || p === "createRadialGradient") {
        return () => ({ addColorStop: () => {} });
      }
      if (p in t) return t[p];
      return (...a: unknown[]) => {
        if (p === "fillText") texts.push({ text: String(a[0]), y: a[2] as number });
        return undefined;
      };
    },
    set(t, p: string, v) {
      t[p] = v;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, texts };
}

const box = { x: 20, y: 120, w: 520, h: 160 };
const layout: StageLayout = {
  cellRects: new Map(),
  boxRect: box,
  panelRect: { x: 0, y: 0, w: 560, h: 380 },
  hudRect: null,
};

/** A run with `id` forced, advanced into its peak so every HUD element is live. */
function peakRun(id: string): GameState {
  const g = createRun({ seed: 1, daily: false, forceEvent: id });
  applyKey(g, "a"); // the first key starts the run clock
  g.act = "act1";
  g.actElapsedMs = 0;
  for (let i = 0; i < 400; i++) tick(g, 100);
  return g;
}

describe.each(["gerald", "garden", "campfire"])("%s HUD meter", (id) => {
  it("draws inside a reserved HUD band, never on the password box rows", () => {
    const g = peakRun(id);
    const inst = g.events.find((e) => e.defId === id)!;
    expect(inst.data).toBeDefined();
    const { ctx, texts } = recordingCtx();
    const hits: HitRegion[] = [];
    PAINTERS[id]!(ctx, inst, layout, g, 5_000, hits);

    const slots = hudSlots(layout)!;
    const labels = texts.filter((t) => METER_LABELS.has(t.text));
    expect(labels.length).toBeGreaterThan(0);
    for (const l of labels) {
      const inTop = l.y >= slots.top.y && l.y <= slots.top.y + slots.top.h;
      const inBottom = l.y >= slots.bottom.y && l.y <= slots.bottom.y + slots.bottom.h;
      expect(inTop || inBottom).toBe(true);
      expect(l.y < box.y || l.y > box.y + box.h).toBe(true);
    }
  });
});
