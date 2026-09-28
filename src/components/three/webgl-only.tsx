"use client";

import { useSyncExternalStore, type ReactNode } from "react";

let webgl: boolean | undefined;

/**
 * Whether this browser can create the WebGL2 context three.js renders with
 * (three dropped WebGL1). Asked once per page load, on a throwaway canvas
 * whose context is released at once so the probe never holds one of the
 * browser's few live contexts.
 */
function canRenderWebGL(): boolean {
  if (webgl === undefined) {
    try {
      const context = document.createElement("canvas").getContext("webgl2");
      context?.getExtension("WEBGL_lose_context")?.loseContext();
      webgl = context !== null;
    } catch {
      // silent-ok: a browser that throws here has no usable WebGL; that is the answer, not a fault.
      webgl = false;
    }
  }
  return webgl;
}

// Support does not change while the page is open, so there is nothing to watch.
const subscribe = () => () => {};

/**
 * Mounts `children` only where WebGL works. Without it, three.js throws
 * "Error creating WebGL context." from react-three-fiber's async Canvas setup:
 * an unhandled rejection no error boundary can catch, repeated on every render
 * of the Canvas. So a Canvas must never mount there, and `fallback` renders
 * instead. `pending` holds the place on the server and through hydration,
 * before the browser can be asked.
 */
export function WebGLOnly({
  children,
  fallback = null,
  pending = null,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  pending?: ReactNode;
}) {
  const supported = useSyncExternalStore<boolean | null>(subscribe, canRenderWebGL, () => null);
  if (supported === null) return pending;
  return supported ? children : fallback;
}
