import { useCallback, useEffect, useRef, useState } from "react";
import { createCountdown } from "./countdown";

const alwaysAct = () => true;

/**
 * Fly Again's 3-2-1 as a hook: the displayed step (null when idle) over the
 * timestamp state machine. The chime and the launch fire from the polling
 * callback, never from a state updater, so a replayed updater cannot double a cue.
 * `canAct` is read live on every tick; when it turns false the count cancels.
 */
export function useCountdown(
  onChime: () => void,
  onLaunch: () => void,
  canAct: () => boolean = alwaysAct,
) {
  const machine = useRef(createCountdown());
  const lastStep = useRef<number | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const counting = step !== null;

  const begin = useCallback(() => {
    machine.current.start(performance.now());
    lastStep.current = 3;
    setStep(3);
    onChime();
  }, [onChime]);

  const cancel = useCallback(() => {
    machine.current.cancel();
    lastStep.current = null;
    setStep(null);
  }, []);

  useEffect(() => {
    if (!counting) return;
    const id = window.setInterval(() => {
      // The game left the armed screen (a tap or key started the run) before the
      // deferred cancel ran: stop here instead of chiming or launching late.
      if (!canAct()) {
        cancel();
        return;
      }
      const r = machine.current.tick(performance.now());
      if (r === "launch") {
        lastStep.current = null;
        setStep(null);
        onLaunch();
      } else if (r !== null) {
        if (r !== lastStep.current) {
          lastStep.current = r;
          onChime();
        }
        setStep(r);
      }
    }, 80);
    return () => window.clearInterval(id);
  }, [counting, onChime, onLaunch, canAct, cancel]);

  return { step, begin, cancel };
}
