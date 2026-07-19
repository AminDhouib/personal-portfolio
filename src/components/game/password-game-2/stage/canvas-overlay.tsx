"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { GameState, PointerTarget } from "../engine/types";
import { PAINTERS, FINALE_INST, type HitRegion, type RectLike, type StageLayout } from "./painters";

/** The shell drives paint() from its rAF loop and hitTest() from a pointer listener. */
export interface OverlayHandle {
  paint(g: GameState, tMs: number): void;
  hitTest(clientX: number, clientY: number): PointerTarget | null;
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
    }
    return { cellRects, boxRect, panelRect: { x: 0, y: 0, w: origin.width, h: origin.height } };
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

        for (const inst of g.events) {
          if (inst.data === undefined || inst.phase === "done") continue;
          const painter = PAINTERS[inst.defId];
          if (painter) painter(ctx, inst, layout, g, tMs, hits);
        }
        if (g.finale && g.finale.phase === "missiles") {
          PAINTERS["finale-missiles"]?.(ctx, FINALE_INST, layout, g, tMs, hits);
        }
      },
      hitTest(clientX, clientY) {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const x = clientX - rect.left;
        const y = clientY - rect.top;
        // Last registered wins visually, so test newest-first.
        const hits = hitsRef.current;
        for (let i = hits.length - 1; i >= 0; i--) {
          const h = hits[i]!;
          if (h.shape === "rect") {
            if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.target;
          } else {
            const dx = x - h.x;
            const dy = y - h.y;
            if (dx * dx + dy * dy <= h.r * h.r) return h.target;
          }
        }
        return null;
      },
    }),
    [],
  );

  return <canvas ref={canvasRef} className="pg2-overlay" aria-hidden="true" />;
});
