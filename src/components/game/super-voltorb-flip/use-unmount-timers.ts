import { useCallback, useEffect, useRef } from "react";

/**
 * Timers for the round-end flow that die with the component (T-6453). A plain `setTimeout` left
 * armed past unmount runs after the test environment is torn down and throws from react-dom
 * ("window is not defined"), which fails a whole vitest run although every test passed; in the
 * browser it sets state on a game that is gone. Same fix as the Typing Speed burst timers (T-6088).
 *
 * `later` schedules a callback and returns its id (or -1 once unmounted, when it schedules
 * nothing); `cancel` clears one early. `sleep` is a promise that resolves after `ms`.
 *
 * A pending `sleep` is never resolved by an unmount, and a `sleep` or `later` called after one
 * does nothing. The `async` round-end chain that awaits them therefore stops where it is instead of
 * animating a dead component, the same way `waitForUserInteraction` already ends on unmount. The
 * suspended chain holds nothing that a timer or listener keeps alive, so it is garbage collected.
 */
export function useUnmountTimers() {
  // Starts true so a timer set before this hook's own effect has run (the same render pass) still
  // counts; the cleanup flips it for good, and a StrictMode re-run of the effect flips it back.
  const aliveRef = useRef(true);
  const pendingRef = useRef(new Set<number>());

  useEffect(() => {
    aliveRef.current = true;
    const pending = pendingRef.current;
    return () => {
      aliveRef.current = false;
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const later = useCallback((fn: () => void, ms: number): number => {
    if (!aliveRef.current) return -1;
    const pending = pendingRef.current;
    const id = window.setTimeout(() => {
      pending.delete(id);
      fn();
    }, ms);
    pending.add(id);
    return id;
  }, []);

  const cancel = useCallback((id: number): void => {
    window.clearTimeout(id);
    pendingRef.current.delete(id);
  }, []);

  const sleep = useCallback(
    (ms: number): Promise<void> => new Promise<void>((resolve) => void later(resolve, ms)),
    [later],
  );

  return { later, cancel, sleep };
}
