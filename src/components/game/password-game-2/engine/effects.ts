import type { Effect, GameState } from "./types";

/** Hard cap on the queued backlog; the stage drains every frame, so this only
 *  bounds a pathological burst (many events emitting in one stalled tick). */
const MAX_EFFECTS = 64;

/** Queue a stage-bound side effect, dropping the oldest once the cap is hit. */
export function pushEffect(g: GameState, effect: Effect): void {
  g.effects.push(effect);
  if (g.effects.length > MAX_EFFECTS) {
    g.effects.splice(0, g.effects.length - MAX_EFFECTS);
  }
}

/** Return every queued effect and clear the queue (the stage drains per frame). */
export function drainEffects(g: GameState): Effect[] {
  const drained = g.effects;
  g.effects = [];
  return drained;
}
