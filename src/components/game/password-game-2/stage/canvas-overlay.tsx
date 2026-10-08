"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { GameState, PointerTarget } from "../engine/types";
import { PAINTERS, FINALE_INST, type HitRegion, type RectLike, type StageLayout } from "./painters";
import { pickHit } from "./hit-test";
import {
  BURST,
  burstAt,
  hitKindFor,
  newPaintClock,
  requestHitStop,
  stepPaintClock,
  stepParticles,
  type Particle,
} from "./hit-fx";

/**
 * The shell drives paint() from its rAF loop and hitTest() from a pointer listener, and
 * calls onHit() when a press on a canvas target landed.
 */
export interface OverlayHandle {
  paint(g: GameState, tMs: number): void;
  hitTest(clientX: number, clientY: number): PointerTarget | null;
  onHit(target: PointerTarget, clientX: number, clientY: number): void;
}

interface Burst {
  color: string;
  ps: Particle[];
}

function sameTarget(a: PointerTarget, b: PointerTarget): boolean {
  return a.kind === b.kind && a.id === b.id;
}

/**
 * A full-panel canvas that repaints every event's vector art each frame. It is
 * absolutely positioned over .pg2-panel with pointer-events:none — clicks fall
 * through to the DOM cells beneath — while painters register per-frame hit regions
 * the shell consults BEFORE its own cell-click handling. Geometry ([data-cell-id]
 * rects, the box, the panel) is measured relative to the canvas origin and cached
 * against g.version + resize so we do not thrash getBoundingClientRect per frame.
 */
export const CanvasOverlay = forwardRef<OverlayHandle>(function CanvasOverlay(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const layoutRef = useRef<StageLayout | null>(null);
  const layoutVersionRef = useRef(-1);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const hitsRef = useRef<HitRegion[]>([]);
  const clockRef = useRef(newPaintClock());
  const burstsRef = useRef<Burst[]>([]);
  const burstSeedRef = useRef(0);
  const runRef = useRef<GameState | null>(null);

  // Invalidate the cached layout on any panel resize; the next paint re-measures.
  useEffect(() => {
    const canvas = canvasRef.current;
    const panel = canvas?.parentElement;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      layoutVersionRef.current = -1;
    });
    ro.observe(panel);
    return () => ro.disconnect();
  }, []);

  function measure(canvas: HTMLCanvasElement): StageLayout {
    const panel = canvas.parentElement;
    const origin = canvas.getBoundingClientRect();
    const cellRects = new Map<number, RectLike>();
    let boxRect: RectLike | null = null;
    let hudRect: RectLike | null = null;
    const rel = (r: DOMRect): RectLike => ({
      x: r.left - origin.left,
      y: r.top - origin.top,
      w: r.width,
      h: r.height,
    });
    if (panel) {
      panel.querySelectorAll<HTMLElement>("[data-cell-id]").forEach((el) => {
        const id = Number(el.dataset.cellId);
        if (Number.isFinite(id)) cellRects.set(id, rel(el.getBoundingClientRect()));
      });
      const box = panel.querySelector<HTMLElement>("[data-pg2-box]");
      if (box) boxRect = rel(box.getBoundingClientRect());
      const hud = panel.querySelector<HTMLElement>("[data-pg2-hud]");
      if (hud) hudRect = rel(hud.getBoundingClientRect());
    }
    return {
      cellRects,
      boxRect,
      panelRect: { x: 0, y: 0, w: origin.width, h: origin.height },
      hudRect,
    };
  }

  useImperativeHandle(
    ref,
    (): OverlayHandle => ({
      paint(g, tMs) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        if (cssW === 0 || cssH === 0) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const size = sizeRef.current;
        if (size.w !== cssW || size.h !== cssH || size.dpr !== dpr) {
          canvas.width = Math.round(cssW * dpr);
          canvas.height = Math.round(cssH * dpr);
          sizeRef.current = { w: cssW, h: cssH, dpr };
          layoutVersionRef.current = -1;
        }

        // Re-measure on a version bump or resize. The version-only cache is not
        // enough: a version bump precedes the React commit that adds a cell's DOM
        // node by a frame, so the first post-bump measure can capture the stale DOM
        // (a new parasite/garbage/pellet cell missing). Re-measuring whenever the
        // live [data-cell-id] count diverges from the cached map self-corrects that
        // within a frame, so per-cell hit regions land on the real glyphs.
        const domCellCount = canvas.parentElement?.querySelectorAll("[data-cell-id]").length ?? 0;
        if (
          layoutVersionRef.current !== g.version ||
          layoutRef.current === null ||
          layoutRef.current.cellRects.size !== domCellCount
        ) {
          layoutRef.current = measure(canvas);
          layoutVersionRef.current = g.version;
        }
        const layout = layoutRef.current;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const hits = hitsRef.current;
        hits.length = 0;

        // Painters run on the paint clock, which a hit-stop holds still for a beat.
        const clock = clockRef.current;
        const dt = stepPaintClock(clock, tMs);
        const paintMs = clock.paintMs;

        // A restart hands over a fresh GameState: the last run's sparks go with it.
        if (runRef.current !== g) {
          runRef.current = g;
          burstsRef.current = [];
        }

        for (const inst of g.events) {
          if (inst.data === undefined || inst.phase === "done") continue;
          const painter = PAINTERS[inst.defId];
          if (painter) painter(ctx, inst, layout, g, paintMs, hits);
        }
        if (g.finale && g.finale.phase === "missiles") {
          PAINTERS["finale-missiles"]?.(ctx, FINALE_INST, layout, g, paintMs, hits);
        }

        // Hit sparks, over the art.
        const bursts: Burst[] = [];
        for (const b of burstsRef.current) {
          const ps = dt > 0 ? stepParticles(b.ps, dt) : b.ps;
          if (ps.length === 0) continue;
          bursts.push({ color: b.color, ps });
          ctx.save();
          ctx.fillStyle = b.color;
          for (const p of ps) {
            ctx.globalAlpha = p.alpha;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
        burstsRef.current = bursts;
      },
      onHit(target, clientX, clientY) {
        const kind = hitKindFor(target);
        const canvas = canvasRef.current;
        if (!kind || !canvas) return;
        // Burst from the centre of the target the press landed on; fall back to the
        // pointer when the region is gone (it is from last frame).
        const region = hitsRef.current.find((h) => sameTarget(h.target, target));
        let x: number;
        let y: number;
        if (region) {
          x = region.shape === "rect" ? region.x + region.w / 2 : region.x;
          y = region.shape === "rect" ? region.y + region.h / 2 : region.y;
        } else {
          const rect = canvas.getBoundingClientRect();
          x = clientX - rect.left;
          y = clientY - rect.top;
        }
        const { n, color } = BURST[kind];
        burstSeedRef.current += 1;
        burstsRef.current.push({ color, ps: burstAt(x, y, n, burstSeedRef.current) });
        requestHitStop(clockRef.current);
      },
      hitTest(clientX, clientY) {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
        const cells = [...(layoutRef.current?.cellRects.values() ?? [])];
        return pickHit(hitsRef.current, x, y, { coarse, cells });
      },
    }),
    [],
  );

  return <canvas ref={canvasRef} className="pg2-overlay" aria-hidden="true" />;
});
