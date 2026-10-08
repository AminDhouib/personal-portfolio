const MIN_MAX = 40;
const STEP = 20;

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** The chart ceiling: the peak rounded up to a multiple of 20, never below 40. */
export function niceMax(values: readonly number[]): number {
  const peak = Math.max(0, ...values);
  return Math.max(MIN_MAX, Math.ceil(peak / STEP) * STEP);
}

/**
 * An SVG path through the values: x spaced evenly over `w`, y scaled so `max`
 * sits at the top. A single value becomes a flat line across the width.
 */
export function graphPath(
  values: readonly number[],
  { w, h, max }: { w: number; h: number; max: number },
): string {
  if (values.length === 0) return "";
  const y = (v: number) => round1(h - (Math.min(max, Math.max(0, v)) / max) * h);
  if (values.length === 1) return `M0,${y(values[0] ?? 0)} L${w},${y(values[0] ?? 0)}`;
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${round1((i * w) / (values.length - 1))},${y(v)}`)
    .join(" ");
}
