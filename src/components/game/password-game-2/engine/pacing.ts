import type { ActId, EventInstance } from "./types";

/** Gap between "act rules solved" and the next pulled-forward event's onset. */
export const PULL_FORWARD_BEAT_MS = 4_000;

const isBlocking = (e: EventInstance): boolean => e.family !== "inhabitant";
const isLiveBlocking = (e: EventInstance): boolean =>
  isBlocking(e) && e.data !== undefined && e.phase !== "done";

/**
 * Once an act's core rules are solved the authored clock is dead time. Returns the new
 * scheduledAtMs for events that should come sooner: every unstarted inhabitant, and the
 * single earliest unstarted blocking event while no other blocking event is live (so the
 * overlapping authored slots do not stack). Pulled events are staggered in authored
 * order: each lands at least beatMs after the one before it, so they do not arrive on
 * the same frame. Never delays an event, never drops one, and is idempotent across
 * frames (an event already pulled keeps its slot, so the chain holds).
 */
export function pullForwardTargets(
  events: readonly EventInstance[],
  act: ActId,
  actElapsedMs: number,
  beatMs: number,
): Map<EventInstance, number> {
  const out = new Map<EventInstance, number>();
  const unstarted = events.filter((e) => e.act === act && e.data === undefined);
  const candidates = unstarted.filter((e) => !isBlocking(e));
  if (!events.some((e) => e.act === act && isLiveBlocking(e))) {
    const first = unstarted.filter(isBlocking).sort((a, b) => a.scheduledAtMs - b.scheduledAtMs)[0];
    if (first) candidates.push(first);
  }
  candidates.sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
  let previousAt = Number.NEGATIVE_INFINITY;
  for (const e of candidates) {
    const slot = Math.max(actElapsedMs + beatMs, previousAt + beatMs);
    if (e.scheduledAtMs > slot) {
      out.set(e, slot);
      previousAt = slot;
    } else {
      previousAt = e.scheduledAtMs;
    }
  }
  return out;
}

/** Every inhabitant of the act has arrived and finished its telegraph. */
export function inhabitantsArrived(events: readonly EventInstance[], act: ActId): boolean {
  return events
    .filter((e) => e.act === act && e.family === "inhabitant")
    .every((e) => e.data !== undefined && e.phase !== "telegraph");
}
