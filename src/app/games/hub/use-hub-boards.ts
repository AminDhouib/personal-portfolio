"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { fetchHubBoard, type HubBoardResult } from "./hub-boards";
import type { TodaySource } from "./today-sources";

/**
 * Reads each source's daily board once, when the element behind `ref` comes within 200px
 * of the viewport (immediately where IntersectionObserver is missing). No polling, no
 * retry. Reads are aborted on unmount. `boards` has no entry for a slug until its read
 * settles, so a missing entry means "loading". State is only set from the read's
 * continuation, never synchronously in the effect.
 *
 * `sources` is an effect dependency, so it must be referentially stable (a module
 * constant). A fresh array each render would abort and restart every read.
 */
export function useHubBoards(sources: readonly TodaySource[]): {
  ref: RefObject<HTMLElement | null>;
  boards: Readonly<Partial<Record<string, HubBoardResult>>>;
} {
  const ref = useRef<HTMLElement | null>(null);
  const [boards, setBoards] = useState<Partial<Record<string, HubBoardResult>>>({});

  useEffect(() => {
    const lifetime = new AbortController();
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      for (const source of sources) {
        void fetchHubBoard(source, lifetime.signal).then((result) => {
          if (lifetime.signal.aborted) return;
          setBoards((previous) => ({ ...previous, [source.slug]: result }));
        });
      }
    };

    const node = ref.current;
    if (node === null || typeof IntersectionObserver === "undefined") {
      start();
      return () => lifetime.abort();
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((item) => item.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      lifetime.abort();
    };
  }, [sources]);

  return { ref, boards };
}
