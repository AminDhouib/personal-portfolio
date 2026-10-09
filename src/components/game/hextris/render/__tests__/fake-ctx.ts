// A recording stand-in for CanvasRenderingContext2D: it satisfies paint.ts's structural
// PaintCtx and keeps every path it was asked to fill or stroke so tests can assert on them.
// Modelled on super-voltorb-flip/__tests__/fake-ctx.ts (copied in spirit, not imported).

export type Point = [number, number];

export interface PathCall {
  style: string;
  points: Point[];
  alpha: number;
  lineWidth: number;
}

export interface ArcCall {
  style: string;
  alpha: number;
  x: number;
  y: number;
  r: number;
  start: number;
  end: number;
}

export interface TextCall {
  kind: "fill" | "stroke";
  text: string;
  x: number;
  y: number;
  font: string;
  style: string;
  lineWidth: number;
  alpha: number;
}

export interface FakeCtx2D {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  lineJoin: CanvasLineJoin;
  globalAlpha: number;
  fills: PathCall[];
  strokes: PathCall[];
  arcs: ArcCall[];
  texts: TextCall[];
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
  fillText(text: string, x: number, y: number): void;
  strokeText(text: string, x: number, y: number): void;
}

export function makeFakeCtx2D(): FakeCtx2D {
  let path: Point[] = [];
  let pathArcs: Omit<ArcCall, "style" | "alpha">[] = [];
  const ctx: FakeCtx2D = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    lineJoin: "miter",
    globalAlpha: 1,
    fills: [],
    strokes: [],
    arcs: [],
    texts: [],
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
      const { fillStyle: style, globalAlpha: alpha, lineWidth } = ctx;
      ctx.fills.push({ style, points: [...path], alpha, lineWidth });
      for (const a of pathArcs) ctx.arcs.push({ style, alpha, ...a });
    },
    stroke() {
      const { strokeStyle: style, globalAlpha: alpha, lineWidth } = ctx;
      ctx.strokes.push({ style, points: [...path], alpha, lineWidth });
      for (const a of pathArcs) ctx.arcs.push({ style, alpha, ...a });
    },
    fillText(text, x, y) {
      ctx.texts.push({ kind: "fill", text, x, y, ...textState(ctx.fillStyle) });
    },
    strokeText(text, x, y) {
      ctx.texts.push({ kind: "stroke", text, x, y, ...textState(ctx.strokeStyle) });
    },
  };
  const textState = (style: string) => ({
    font: ctx.font,
    style,
    lineWidth: ctx.lineWidth,
    alpha: ctx.globalAlpha,
  });
  return ctx;
}
