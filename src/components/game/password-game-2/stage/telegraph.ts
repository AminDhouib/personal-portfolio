import { EVENT_DEFS } from "../engine/events/index";
import type { EventFamily, EventInstance } from "../engine/types";

/*
 * The telegraph beat, derived from engine state rather than added to the engine: an
 * instance is telegraphing when it has initialised (data defined) and its phase is still
 * "telegraph"; the time left is its def's telegraphMs minus the phase clock. The stage
 * reads this to show a banner, tint the card edge and play a cue, so no event ever
 * arrives unannounced.
 */

/** telegraphMs by def id, straight off the manifest. */
const TELEGRAPH_MS: ReadonlyMap<string, number> = new Map(
  EVENT_DEFS.map((d) => [d.id, d.telegraphMs]),
);

export interface Telegraph {
  defId: string;
  family: EventFamily;
  /** Milliseconds until the event strikes (never negative). */
  remainingMs: number;
}

/** Every instance in its telegraph beat, soonest to strike first. */
export function activeTelegraphs(events: readonly EventInstance[]): Telegraph[] {
  const out: Telegraph[] = [];
  for (const inst of events) {
    if (inst.data === undefined || inst.phase !== "telegraph") continue;
    const total = TELEGRAPH_MS.get(inst.defId);
    if (total === undefined) continue;
    out.push({
      defId: inst.defId,
      family: inst.family,
      remainingMs: Math.max(0, total - inst.phaseElapsedMs),
    });
  }
  return out.sort((a, b) => a.remainingMs - b.remainingMs);
}

/**
 * What the banner says while an event winds up: in-voice, short enough for a phone
 * band, and a hint at the threat rather than its name. Every def id needs an entry
 * (the telegraph test walks the manifest).
 */
const LABELS: Record<string, string> = {
  gerald: "Something is moving in",
  campfire: "Smoke on the horizon",
  garden: "Something is sprouting",
  infection: "Something smells off",
  "black-hole": "Gravity is acting up",
  parasite: "A stowaway is aboard",
  galaga: "Invaders inbound",
  snake: "Rustling in the grass",
  tetris: "Blocks incoming",
  "cookie-banner": "A privacy notice looms",
  autocorrect: "Autocorrect is warming up",
  "loading-bar": "An upload is queued",
};

export function telegraphLabel(defId: string): string {
  return LABELS[defId] ?? "Something is coming";
}

/** Family accent for the banner and the card-edge tint (the --pg2-<family> colours). */
export const FAMILY_TINT: Record<EventFamily, string> = {
  inhabitant: "#16a34a",
  force: "#7c3aed",
  invasion: "#dc2626",
  chrome: "#d97706",
};
