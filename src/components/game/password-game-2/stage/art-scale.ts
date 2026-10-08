/**
 * How much larger each painter draws its world art than the original cast (T3-4: events
 * have to read at a glance on a phone). One table, keyed by painter id, so the size of the
 * cast is tuned in one place. Painters multiply sprite sizes, strokes and offsets by it; a
 * painter whose art would otherwise leave the stage card narrows its own factor to fit
 * (`fitScale`) rather than draw off the card.
 */
export const ART_SCALE: Record<string, number> = {
  gerald: 1.5,
  campfire: 1.4,
  garden: 1.4,
  infection: 1.5,
  "black-hole": 1.4,
  parasite: 1.4,
  galaga: 1.4,
  snake: 1.4,
  tetris: 1.4,
  "cookie-banner": 1.4,
  autocorrect: 1.4,
  "loading-bar": 1.4,
  "finale-missiles": 1.4,
};

/** A canvas hit circle is never smaller than this radius, so every target is 44 px across. */
export const HIT_MIN_R = 22;

/** Scale a hit radius with the art, but never below the 44 px target floor. */
export function hitRadius(r: number, scale: number): number {
  return Math.max(HIT_MIN_R, r * scale);
}
