// A recording stand-in for CanvasRenderingContext2D: it satisfies paint.ts's structural
// PaintCtx and keeps every path it was asked to fill or stroke so tests can assert on them.
// Modelled on super-voltorb-flip/__tests__/fake-ctx.ts (copied in spirit, not imported).

export type Point = [number, number];

export interface PathCall {
  style: string;
  points: Point[];
}

export interface ArcCall {
  style: string;
  x: number;
  y: number;
  r: number;
  start: number;
  end: number;
}

export interface FakeCtx2D {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  fills: PathCall[];
  strokes: PathCall[];
  arcs: ArcCall[];
  cleared: number;
  /** Every coordinate any drawing call touched, arcs as their bounding box corners. */
  touched: Point[];
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
  stroke(): void;
}

export function makeFakeCtx2D(): FakeCtx2D {
  let path: Point[] = [];
  let pathArcs: Omit<ArcCall, "style">[] = [];
  const ctx: FakeCtx2D = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    fills: [],
    strokes: [],
    arcs: [],
    cleared: 0,
    touched: [],
    clearRect() {
      ctx.cleared++;
    },
    beginPath() {
      path = [];
      pathArcs = [];
    },
    moveTo(x, y) {
      path.push([x, y]);
      ctx.touched.push([x, y]);
    },
    lineTo(x, y) {
      path.push([x, y]);
      ctx.touched.push([x, y]);
    },
    closePath() {},
    arc(x, y, r, start, end) {
      pathArcs.push({ x, y, r, start, end });
      ctx.touched.push([x - r, y - r], [x + r, y + r]);
    },
    fill() {
      ctx.fills.push({ style: ctx.fillStyle, points: [...path] });
      for (const a of pathArcs) ctx.arcs.push({ style: ctx.fillStyle, ...a });
    },
    stroke() {
      ctx.strokes.push({ style: ctx.strokeStyle, points: [...path] });
      for (const a of pathArcs) ctx.arcs.push({ style: ctx.strokeStyle, ...a });
    },
  };
  return ctx;
}
