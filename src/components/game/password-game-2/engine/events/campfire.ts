import type { EventContext, EventDef, EventInstance, Pg2RuleDef } from "../types";
import { VALUE_EXCLUDED, setCellStatus } from "../cells";

/**
 * The campfire. It burns down from FUEL_START, losing a point per second (with a
 * fractional carry so odd ticks never drift). Stoking adds fuel on a cooldown.
 * When the fuel runs out it drops to embers and stops burning; the coupled rule
 * wants it burning at submit. While it is burning low it EATS the password: it
 * scars the leftmost value-bearing cell to an ember, shrinking the value — a
 * deliberate hazard, so keep it fed.
 */

/** Two-state mood: crackling while burning, embers once the fuel is gone. */
type CampfireMood = "crackling" | "embers";

export interface CampfireData {
  fuel: number; // 0..100
  burning: boolean;
  stokeReadyAtMs: number; // earliest state.elapsedMs a stoke takes effect
  buttonHops: number; // cosmetic: bumped every 4th successful stoke
  eatCarryMs: number; // fractional-time carry toward the next bite
  fuelCarryMs: number; // fractional-time carry toward the next fuel point lost
  stokeCount: number; // successful stokes, for the every-4th hop
  mood: CampfireMood; // last emitted mood, for crossing detection
}

const TELEGRAPH_MS = 6000;
const FUEL_START = 80;
const DECAY_PERIOD_MS = 1000; // -1 fuel per this many ms
const STOKE_GAIN = 18;
const STOKE_COOLDOWN_MS = 1500;
const HOP_EVERY = 4;
const EAT_BELOW_FUEL = 25; // eats only while burning under this
const EAT_PERIOD_MS = 6000;
const RELIGHT_AT_FUEL = 15;

const MOOD_TEXT: Record<CampfireMood, string> = {
  crackling: "The campfire - crackling",
  embers: "The campfire - embers",
};

function emitMood(d: CampfireData, ctx: EventContext, mood: CampfireMood): void {
  if (mood === d.mood) return;
  d.mood = mood;
  ctx.emit({ kind: "mood", eventId: "campfire", text: MOOD_TEXT[mood] });
}

/** Scar the leftmost value-bearing cell to an ember; return whether one was eaten. */
function biteLeftmostCell(ctx: EventContext): boolean {
  const target = ctx.state.cells.find((c) => !VALUE_EXCLUDED.has(c.status));
  if (target === undefined) return false;
  ctx.state.cells = setCellStatus(ctx.state.cells, target.id, "ember", "campfire");
  return true;
}

/** Per-tick burn: decay fuel, drop to embers at zero, and eat while burning low. */
function burn(d: CampfireData, ctx: EventContext): void {
  d.fuelCarryMs += ctx.dtMs;
  while (d.fuelCarryMs >= DECAY_PERIOD_MS && d.fuel > 0) {
    d.fuel -= 1;
    d.fuelCarryMs -= DECAY_PERIOD_MS;
  }
  if (d.fuel <= 0) {
    d.fuel = 0;
    d.fuelCarryMs = 0;
    if (d.burning) {
      d.burning = false;
      emitMood(d, ctx, "embers");
    }
  }

  if (d.burning && d.fuel < EAT_BELOW_FUEL) {
    d.eatCarryMs += ctx.dtMs;
    while (d.eatCarryMs >= EAT_PERIOD_MS) {
      d.eatCarryMs -= EAT_PERIOD_MS;
      if (biteLeftmostCell(ctx)) {
        ctx.emit({ kind: "toast", text: "The campfire is eating your password.", tone: "danger" });
      }
    }
  } else {
    d.eatCarryMs = 0;
  }
}

/** Coupled rule: the campfire must be burning at submit. */
const campfireBurningRule: Pg2RuleDef = {
  id: "campfire-burning",
  act: "act3",
  create: () => ({
    id: "campfire-burning",
    act: "act3",
    description: "The campfire must be burning when you submit.",
    validate: (_password, _state, api) => {
      const d = api.getEventData<CampfireData>("campfire");
      if (d === null) return { passed: true };
      return { passed: d.burning };
    },
  }),
};

export const campfireDef: EventDef<CampfireData> = {
  id: "campfire",
  family: "inhabitant",
  telegraphMs: TELEGRAPH_MS,
  allyId: "campfire",
  coupledRule: campfireBurningRule,
  init: () => ({
    fuel: FUEL_START,
    burning: true,
    stokeReadyAtMs: 0,
    buttonHops: 0,
    eatCarryMs: 0,
    fuelCarryMs: 0,
    stokeCount: 0,
    mood: "crackling",
  }),
  onTick(inst: EventInstance<CampfireData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        d.stokeReadyAtMs = ctx.state.elapsedMs; // ready to stoke immediately
        ctx.emit({ kind: "sound", sound: "inhabitant-arrive" });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";
    burn(d, ctx);
  },
  onPointer(inst: EventInstance<CampfireData>, ctx: EventContext, target): boolean {
    if (target.kind !== "stoke-button") return false;
    const d = inst.data;
    if (ctx.state.elapsedMs < d.stokeReadyAtMs) return true; // consumed, still on cooldown
    d.fuel = Math.min(100, d.fuel + STOKE_GAIN);
    d.stokeReadyAtMs = ctx.state.elapsedMs + STOKE_COOLDOWN_MS;
    d.stokeCount += 1;
    if (d.stokeCount % HOP_EVERY === 0) d.buttonHops += 1;
    if (!d.burning && d.fuel >= RELIGHT_AT_FUEL) {
      d.burning = true;
      emitMood(d, ctx, "crackling");
    }
    return true;
  },
  isResolved: (_inst, state) => state.act === "finale",
  isAlive: (inst) => inst.data.burning,
};
