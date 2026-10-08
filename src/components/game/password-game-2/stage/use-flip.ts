import { useLayoutEffect, useRef, type RefObject } from "react";
import { FLIP_EASING, FLIP_MS, planFlip } from "./flip";

/**
 * FLIP reorder animation over the Web Animations API. When `orderKey` changes, the layout
 * top of each `[data-flip-id]` child is read and compared with the previous reading; items
 * that sit somewhere else are animated from the old position to the new one. Positions come
 * from offsetTop (layout, relative to the same offset parent as the container), never from
 * getBoundingClientRect, so a running FLIP, entrance or shake transform cannot skew them.
 * Nothing is measured on renders that keep the order. The first reading only records. A
 * no-op where Element.animate is missing (jsdom).
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, orderKey: string): void {
  const prevTops = useRef<Map<string, number> | null>(null);

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

    const prev = prevTops.current;
    prevTops.current = next;
    if (!prev) return;

    for (const { id, dy } of planFlip(prev, next)) {
      const el = els.get(id);
      if (!el || typeof el.animate !== "function") continue;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: FLIP_MS,
        easing: FLIP_EASING,
      });
    }
  }, [containerRef, orderKey]);
}
