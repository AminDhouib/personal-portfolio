import { useCallback, useEffect, useRef, useState } from "react";
import { createCountdown } from "./countdown";

/**
 * Fly Again's 3-2-1 as a hook: the displayed step (null when idle) over the
 * timestamp state machine. The chime and the launch fire from the polling
 * callback, never from a state updater, so a replayed updater cannot double a cue.
 */
export function useCountdown(onChime: () => void, onLaunch: () => void) {
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
  }, [counting, onChime, onLaunch]);

  return { step, begin, cancel };
}
