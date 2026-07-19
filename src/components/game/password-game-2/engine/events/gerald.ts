import type { EventContext, EventDef, EventInstance, Pg2RuleDef } from "../types";

/**
 * Gerald the fish. He lives in the box for the whole run: telegraph, a one-tick
 * onset (name-tag appears, the coupled "must be fed" rule injects), then peak
 * forever. He does not resolve until the finale, so he never gates an act.
 *
 * Hunger climbs a point every HUNGER_PERIOD_MS. Fractional dt is carried in
 * hungerCarryMs so an odd tick cadence never drifts the rate. Feeding drops hunger
 * by FEED_RELIEF and refreshes fedAtMs, which the coupled rule reads. Moods emit
 * only when the tier CROSSES, so a steady tick does not spam the name tag.
 */

/** Gerald's mood tiers, keyed off hunger. */
type GeraldMood = "content" | "hungry" | "desperate" | "disappointed";

export interface GeraldData {
  hunger: number; // 0..100
  fedAtMs: number; // state.elapsedMs of the last feed (starts at onset time)
  murky: boolean; // water goes murky at desperation
  hungerCarryMs: number; // fractional-time carry toward the next hunger point
  mood: GeraldMood; // last emitted tier, for crossing detection
}

const TELEGRAPH_MS = 6000;
const HUNGER_START = 30;
const HUNGER_PERIOD_MS = 1800; // +1 hunger per this many ms
const FEED_RELIEF = 40;
const MURKY_AT = 85;
const FED_WINDOW_MS = 60_000;

const MOOD_TEXT: Record<GeraldMood, string> = {
  content: "Gerald - content",
  hungry: "Gerald - hungry",
  desperate: "Gerald - desperate",
  disappointed: "Gerald - disappointed",
};

/** Tier for a hunger value. Thresholds: 60 hungry, 85 desperate, 100 disappointed. */
function moodFor(hunger: number): GeraldMood {
  if (hunger >= 100) return "disappointed";
  if (hunger >= MURKY_AT) return "desperate";
  if (hunger >= 60) return "hungry";
  return "content";
}

/** Emit a mood line only when the tier changed from the last one recorded. */
function emitMoodIfCrossed(d: GeraldData, ctx: EventContext): void {
  const next = moodFor(d.hunger);
  if (next === d.mood) return;
  d.mood = next;
  ctx.emit({ kind: "mood", eventId: "gerald", text: MOOD_TEXT[next] });
}

/** Accumulate elapsed time into hunger points, carrying the fractional remainder. */
function climb(d: GeraldData, ctx: EventContext): void {
  d.hungerCarryMs += ctx.dtMs;
  while (d.hungerCarryMs >= HUNGER_PERIOD_MS && d.hunger < 100) {
    d.hunger += 1;
    d.hungerCarryMs -= HUNGER_PERIOD_MS;
  }
  if (d.hunger >= 100) {
    d.hunger = 100;
    d.hungerCarryMs = 0;
  }
  d.murky = d.hunger >= MURKY_AT;
  emitMoodIfCrossed(d, ctx);
}

/** Coupled rule: Gerald must have been fed inside the last minute at submit. */
const geraldFedRule: Pg2RuleDef = {
  id: "gerald-fed",
  act: "act3",
  create: () => ({
    id: "gerald-fed",
    act: "act3",
    description: "Gerald must have been fed in the last 60 seconds.",
    validate: (_password, state, api) => {
      const d = api.getEventData<GeraldData>("gerald");
      if (d === null) return { passed: true };
      const sinceFed = state.elapsedMs - d.fedAtMs;
      return { passed: sinceFed <= FED_WINDOW_MS, message: `${Math.max(0, sinceFed)}ms` };
    },
  }),
};

export const geraldDef: EventDef<GeraldData> = {
  id: "gerald",
  family: "inhabitant",
  telegraphMs: TELEGRAPH_MS,
  allyId: "gerald",
  coupledRule: geraldFedRule,
  init: () => ({
    hunger: HUNGER_START,
    fedAtMs: 0,
    murky: false,
    hungerCarryMs: 0,
    mood: moodFor(HUNGER_START),
  }),
  onTick(inst: EventInstance<GeraldData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        d.fedAtMs = ctx.state.elapsedMs; // rule starts satisfied
        ctx.emit({ kind: "sound", sound: "inhabitant-arrive" });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";
    climb(d, ctx);
  },
  onPointer(inst: EventInstance<GeraldData>, ctx: EventContext, target): boolean {
    if (target.kind !== "feed-button") return false;
    const d = inst.data;
    d.hunger = Math.max(0, d.hunger - FEED_RELIEF);
    d.fedAtMs = ctx.state.elapsedMs;
    d.murky = d.hunger >= MURKY_AT;
    ctx.emit({ kind: "sound", sound: "gerald-feed" });
    emitMoodIfCrossed(d, ctx); // feeding may cross a tier downward
    return true;
  },
  isResolved: (_inst, state) => state.act === "finale",
  isAlive: (inst) => inst.data.hunger < 100,
};
