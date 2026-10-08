import { useEffect, useState } from "react";
import { countUp } from "./post-run";

/**
 * A number that counts up to `target` on mount. The timeout lands on the final
 * value even if rAF is throttled (an occluded tab), so the card never shows a
 * stale partial number.
 */
export function CountUp({ target, durationMs = 900 }: { target: number; durationMs?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const step = () => {
      const v = countUp(target, performance.now() - t0, durationMs);
      setValue(v);
      if (v < target) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const done = setTimeout(() => setValue(target), durationMs + 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
    };
  }, [target, durationMs]);

  return <span data-testid="count-up">{value}</span>;
}
