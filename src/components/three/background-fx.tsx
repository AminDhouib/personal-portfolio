/**
 * Stacked low-cost ambient effects, all `pointer-events: none` so they
 * never intercept input. Layer order (bottom → top):
 *   1. Aurora   — slow CSS linear-gradient drift
 *   2. Vignette — radial gradient darkening the corners
 *   3. Grain    — SVG-noise PNG tile at low opacity
 *
 * Pure CSS, GPU-composited, zero JS per frame.
 */
export function BackgroundFX() {
  return (
    <>
      <div className="bg-fx-aurora" aria-hidden />
      <div className="bg-fx-vignette" aria-hidden />
      <div className="bg-fx-grain" aria-hidden />
    </>
  );
}
