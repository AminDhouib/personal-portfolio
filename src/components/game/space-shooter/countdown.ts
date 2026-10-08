// The Fly Again 3-2-1: a tiny state machine over timestamps, so it is testable
// without React or timers. The caller polls tick(now) and acts on the result.
export const COUNTDOWN_MS = 3000;
const STEP_MS = 1000;

export type CountdownTick = number | "launch" | null;

export function createCountdown() {
  let startedAt: number | null = null;
  return {
    start(now: number) {
      startedAt = now;
    },
    cancel() {
      startedAt = null;
    },
    active() {
      return startedAt !== null;
    },
    /** 3, 2 or 1 while counting; "launch" exactly once at the end; null when idle. */
    tick(now: number): CountdownTick {
      if (startedAt === null) return null;
      const elapsed = now - startedAt;
      if (elapsed >= COUNTDOWN_MS) {
        startedAt = null;
        return "launch";
      }
      return 3 - Math.floor(Math.max(0, elapsed) / STEP_MS);
    },
  };
}
