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
 * overlapping authored slots do not stack). Never delays an event, never drops one.
 */
export function pullForwardTargets(
  events: readonly EventInstance[],
  act: ActId,
  actElapsedMs: number,
  beatMs: number,
): Map<EventInstance, number> {
  const out = new Map<EventInstance, number>();
  const target = actElapsedMs + beatMs;
  const unstarted = events.filter((e) => e.act === act && e.data === undefined);
  for (const e of unstarted) {
    if (e.family === "inhabitant" && e.scheduledAtMs > target) out.set(e, target);
  }
  if (!events.some((e) => e.act === act && isLiveBlocking(e))) {
    const first = unstarted.filter(isBlocking).sort((a, b) => a.scheduledAtMs - b.scheduledAtMs)[0];
    if (first && first.scheduledAtMs > target) out.set(first, target);
  }
  return out;
}

/** Every inhabitant of the act has arrived and finished its telegraph. */
export function inhabitantsArrived(events: readonly EventInstance[], act: ActId): boolean {
  return events
    .filter((e) => e.act === act && e.family === "inhabitant")
    .every((e) => e.data !== undefined && e.phase !== "telegraph");
}
