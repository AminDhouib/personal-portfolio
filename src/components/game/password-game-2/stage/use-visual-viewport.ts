"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { computeViewportLayout, type ViewportLayout } from "./viewport-layout";

const INERT: ViewportLayout = { keyboardOpen: false, height: 0, top: 0 };

/**
 * One store per hook instance. It remembers the tallest visual viewport it has seen
 * (the "no keyboard" height) and hands out a cached snapshot, so useSyncExternalStore
 * only re-renders when the sheet height, offset or keyboard state actually changed.
 */
function createStore() {
  let baseline = 0;
  let lastWidth = 0;
  let snap: ViewportLayout = INERT;

  function read(): ViewportLayout {
    const vv = window.visualViewport;
    const height = vv ? vv.height : window.innerHeight;
    const width = vv ? vv.width : window.innerWidth;
    // A width change is a rotation (or a window resize): the old baseline no longer applies.
    if (width !== lastWidth) {
      lastWidth = width;
      baseline = 0;
    }
    baseline = Math.max(baseline, height, window.innerHeight);
    const next = computeViewportLayout({
      baselineHeight: baseline,
      vvHeight: height,
      vvOffsetTop: vv ? vv.offsetTop : 0,
    });
    if (
      next.keyboardOpen !== snap.keyboardOpen ||
      next.height !== snap.height ||
      next.top !== snap.top
    ) {
      snap = next;
    }
    return snap;
  }

  function attach(notify: () => void): () => void {
    const vv = window.visualViewport;
    const onOrientation = () => {
      baseline = 0;
      notify();
    };
    window.addEventListener("orientationchange", onOrientation);
    if (vv) {
      vv.addEventListener("resize", notify);
      vv.addEventListener("scroll", notify);
    } else {
      window.addEventListener("resize", notify);
    }
    return () => {
      window.removeEventListener("orientationchange", onOrientation);
      if (vv) {
        vv.removeEventListener("resize", notify);
        vv.removeEventListener("scroll", notify);
      } else {
        window.removeEventListener("resize", notify);
      }
    };
  }

  return { read, attach };
}

/**
 * Tracks the visible area above the on-screen keyboard through `visualViewport`, so
 * the phone play sheet can be exactly that tall. Inert (and attaches nothing) while
 * `enabled` is false; without `visualViewport` it follows `window.innerHeight`.
 */
export function useVisualViewport(enabled: boolean): ViewportLayout {
  const [store] = useState(createStore);
  const subscribe = useCallback(
    (notify: () => void) => (enabled ? store.attach(notify) : () => {}),
    [enabled, store],
  );
  const getSnapshot = useCallback(() => (enabled ? store.read() : INERT), [enabled, store]);
  return useSyncExternalStore(subscribe, getSnapshot, () => INERT);
}
