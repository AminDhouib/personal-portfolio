import { useLayoutEffect, useRef, type RefObject } from "react";
import { FLIP_EASING, FLIP_MS, planFlip } from "./flip";

/**
 * FLIP reorder animation over the Web Animations API. After every commit the top of each
 * `[data-flip-id]` child (relative to the container, so an ancestor scrolling between
 * commits is not mistaken for a move) is recorded. When `orderKey` changed since the
 * previous commit, items that sit somewhere else than before are animated from the old
 * position to the new one. The first commit only records. A no-op where Element.animate
 * is missing (jsdom).
 */
export function useFlip(containerRef: RefObject<HTMLElement | null>, orderKey: string): void {
  const prevTops = useRef<Map<string, number> | null>(null);
  const prevKey = useRef(orderKey);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const origin = container.getBoundingClientRect().top;
    const next = new Map<string, number>();
    const els = new Map<string, HTMLElement>();
    for (const el of container.querySelectorAll<HTMLElement>("[data-flip-id]")) {
      const id = el.dataset.flipId!;
      els.set(id, el);
      next.set(id, el.getBoundingClientRect().top - origin);
    }

    const prev = prevTops.current;
    const reordered = prevKey.current !== orderKey;
    prevTops.current = next;
    prevKey.current = orderKey;
    if (!prev || !reordered) return;

    for (const { id, dy } of planFlip(prev, next)) {
      const el = els.get(id);
      if (!el || typeof el.animate !== "function") continue;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], {
        duration: FLIP_MS,
        easing: FLIP_EASING,
      });
    }
  });
}
