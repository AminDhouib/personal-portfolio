"use client";

import { useSyncExternalStore } from "react";
import type { FailoverController, HudState } from "../controller";

// React's view of the controller's HUD. The controller rebuilds HudState at
// 4 Hz and at once on a discrete event (a placement, a link, an incident, the
// end of the run), and only then tells its listeners, so a component reading
// it renders at that rate and not once per frame or per tick.

/** A store React can subscribe to before the controller exists: empty until connect(). */
export function createHudBridge() {
  let controller: FailoverController | null = null;
  let unsubscribe: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  return {
    connect(next: FailoverController | null) {
      unsubscribe?.();
      unsubscribe = null;
      controller = next;
      if (next) unsubscribe = next.subscribe(notify);
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get: (): HudState | null => (controller ? controller.getHud() : null),
    /** The connected controller; non-null exactly when get() is. */
    controller: (): FailoverController | null => controller,
  };
}

export type HudBridge = ReturnType<typeof createHudBridge>;

const SERVER_HUD = () => null;

/** The current HUD, or null before the controller is connected (and on the server). */
export function useHud(bridge: HudBridge): HudState | null {
  return useSyncExternalStore(bridge.subscribe, bridge.get, SERVER_HUD);
}
