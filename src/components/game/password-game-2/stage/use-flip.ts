import { useLayoutEffect, useRef, type RefObject } from "react";
import { FLIP_EASING, FLIP_MS, planFlip } from "./flip";

/** The vertical translation in a computed matrix(...) or matrix3d(...) transform. */
function translateY(transform: string): number {
  const m = /^matrix(3d)?\(([^)]+)\)$/.exec(transform.trim());
  if (!m) return 0;
  const v = m[2]!.split(",").map(Number);
  const ty = m[1] ? v[13] : v[5];
  return Number.isFinite(ty) ? ty! : 0;
}

/**
 * FLIP reorder animation over the Web Animations API. When `orderKey` changes, the layout
 * top of each `[data-flip-id]` child is read and compared with the previous reading; items
 * that sit somewhere else are animated from the old position to the new one. Positions come
 * from offsetTop (layout, relative to the same offset parent as the container), never from
 * getBoundingClientRect, so a running FLIP, entrance or shake transform cannot skew them.
 * Positions are re-read after every commit so they never go stale, but only an order change
 * animates. The first reading only records, and so does the first after `runId` changes
 * (a new run reuses the rule ids, so old-run positions mean nothing). A no-op where
 * Element.animate is missing (jsdom).
 */
export function useFlip(
  containerRef: RefObject<HTMLElement | null>,
  orderKey: string,
  runId = 0,
): void {
  const prevTops = useRef<Map<string, number> | null>(null);
  const prevKey = useRef<string | null>(null);
  const running = useRef(new Map<string, Animation>());
  const prevRun = useRef(runId);

  // Runs after every commit: the reading is cheap (offsetTop) and must stay current, or a
  // height change between two reorders (a wrapping message, an expanded card, an entrance)
  // would make the next reorder animate from stale offsets. Only a key change animates.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const origin = container.offsetTop;
    const next = new Map<string, number>();
    const els = new Map<string, HTMLElement>();
    for (const el of container.querySelectorAll<HTMLElement>("[data-flip-id]")) {
      const id = el.dataset.flipId!;
      els.set(id, el);
      next.set(id, el.offsetTop - origin);
    }

    if (prevRun.current !== runId) {
      prevRun.current = runId;
      for (const anim of running.current.values()) anim.cancel();
      running.current.clear();
      prevTops.current = null;
      prevKey.current = null;
    }
    const prev = prevTops.current;
    const reordered = prevKey.current !== null && prevKey.current !== orderKey;
    prevTops.current = next;
    prevKey.current = orderKey;
    if (!prev || !reordered) return;

    // A card still mid-flight is painted ty away from its layout offset: restart from where
    // it visibly is, not from where it was laid out, or the second reorder snaps.
    const visualPrev = new Map(prev);
    for (const [id, anim] of running.current) {
      const el = els.get(id);
      if (el && anim.playState === "running" && visualPrev.has(id)) {
        visualPrev.set(id, visualPrev.get(id)! + translateY(getComputedStyle(el).transform));
      }
      anim.cancel();
    }
    running.current.clear();

    for (const { id, dy } of planFlip(visualPrev, next)) {
      const el = els.get(id);
      if (!el || typeof el.animate !== "function") continue;
      const anim = el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: FLIP_MS,
        easing: FLIP_EASING,
      });
      if (anim) running.current.set(id, anim);
    }
  });
}
