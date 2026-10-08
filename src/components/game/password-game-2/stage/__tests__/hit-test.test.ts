import { describe, expect, it } from "vitest";
import type { EventInstance, GameState } from "../../engine/types";
import { pickHit } from "../hit-test";
import { PAINTERS, type HitRegion, type RectLike, type StageLayout } from "../painters";

// A do-nothing 2D context: these tests only read the hit regions a painter registers.
const nullCtx = new Proxy({} as CanvasRenderingContext2D, {
  get: (_t, k) => (k === "measureText" ? () => ({ width: 0 }) : () => undefined),
  set: () => true,
});

// Two 18x36 glyphs side by side: a plain neighbour (id 6) and the parasite (id 7).
const NEIGHBOUR: RectLike = { x: 82, y: 100, w: 18, h: 36 };
const MIMIC: RectLike = { x: 100, y: 100, w: 18, h: 36 };
const CX = MIMIC.x + MIMIC.w / 2;
const CY = MIMIC.y + MIMIC.h / 2;

function parasiteRegions(): { hits: HitRegion[]; cells: RectLike[] } {
  const layout: StageLayout = {
    cellRects: new Map([
      [6, NEIGHBOUR],
      [7, MIMIC],
    ]),
    boxRect: { x: 20, y: 90, w: 300, h: 60 },
    panelRect: { x: 0, y: 0, w: 340, h: 400 },
    hudRect: null,
  };
  const g = { cells: [{ id: 6 }, { id: 7 }] } as unknown as GameState;
  const inst = {
    defId: "parasite",
    phase: "peak",
    phaseElapsedMs: 1_000,
    data: { parasiteIds: [7], spawnedSecondAtMs: null },
  } as unknown as EventInstance;
  const hits: HitRegion[] = [];
  PAINTERS.parasite!(nullCtx, inst, layout, g, 1_000, hits);
  return { hits, cells: [...layout.cellRects.values()] };
}

describe("pickHit: a parasite never steals a neighbouring glyph's caret", () => {
  it("fine pointer: the target is the glyph's own box", () => {
    const { hits, cells } = parasiteRegions();
    const fine = { coarse: false, cells };
    expect(pickHit(hits, CX, CY, fine)).toEqual({ kind: "parasite", id: 7 });
    // A tap on the neighbour leaves the parasite alone; the caret gets it.
    expect(pickHit(hits, NEIGHBOUR.x + 9, CY, fine)).toBeNull();
    // So does a tap just past the glyph's edge.
    expect(pickHit(hits, CX + 10, CY, fine)).toBeNull();
  });

  it("coarse pointer: a tap 10 px off centre, outside any neighbour, evicts", () => {
    const { hits, cells } = parasiteRegions();
    expect(pickHit(hits, CX + 10, CY, { coarse: true, cells })).toEqual({
      kind: "parasite",
      id: 7,
    });
  });

  it("coarse pointer: a tap inside the neighbour's box places the caret", () => {
    const { hits, cells } = parasiteRegions();
    expect(pickHit(hits, NEIGHBOUR.x + 9, CY, { coarse: true, cells })).toBeNull();
  });

  it("overlapping regions: the nearest centre wins", () => {
    const hits: HitRegion[] = [
      { shape: "circle", x: 100, y: 100, w: 0, h: 0, r: 22, target: { kind: "alien", id: 1 } },
      { shape: "circle", x: 130, y: 100, w: 0, h: 0, r: 22, target: { kind: "alien", id: 2 } },
    ];
    const opts = { coarse: true, cells: [] };
    expect(pickHit(hits, 112, 100, opts)).toEqual({ kind: "alien", id: 1 });
    expect(pickHit(hits, 118, 100, opts)).toEqual({ kind: "alien", id: 2 });
  });
});
