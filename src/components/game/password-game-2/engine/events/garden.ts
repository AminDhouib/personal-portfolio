import type { EventContext, EventDef, EventInstance, Pg2RuleDef } from "../types";
import { rangeInt } from "../rng";
import { bearSwipe as galagaBearSwipe, type GalagaData } from "./galaga";
import { bearSwipe as snakeBearSwipe, type SnakeData } from "./snake";
import { bearSwipe as tetrisBearSwipe, type TetrisData } from "./tetris";

/**
 * The garden and the bear. Flowers bloom slowly; once at least two are open the
 * hive fills with honey. Periodically a bear approaches (telegraph), then raids;
 * if the raid completes undistracted it tramples the garden — honey to zero, two
 * blooms lost. Tossing the picnic basket while the bear is telegraphed OR raiding
 * sends it away. The coupled rule wants at least MIN_HONEY in the hive at submit.
 *
 * Bear timers run against state.elapsedMs. nextBearAtMs is the next telegraph;
 * once telegraphed it is repurposed as the raid-start time (telegraph + window);
 * raidEndsAtMs is the raid's end. Intervals between raids are seeded off ctx.rng.
 */

type BearState = "away" | "telegraphed" | "raiding";

export interface GardenData {
  bloomed: number; // 0..3
  honey: number; // 0..100
  bearState: BearState;
  nextBearAtMs: number; // away: next telegraph; telegraphed: raid-start time
  raidEndsAtMs: number; // raiding: when the raid completes
  distractions: number; // baskets thrown that sent the bear off
  bloomCarryMs: number; // fractional-time carry toward the next bloom
  honeyCarryMs: number; // fractional-time carry toward the next honey tick
}

const TELEGRAPH_MS = 8000;
const MAX_BLOOM = 3;
const BLOOM_PERIOD_MS = 20_000; // +1 bloom per this many ms, up to MAX_BLOOM
const HONEY_MIN_BLOOM = 2; // honey only accrues at this many blooms
const HONEY_PER_TICK = 2;
const HONEY_PERIOD_MS = 1000;
const HONEY_MAX = 100;
const MIN_HONEY = 40; // coupled-rule / alive threshold
const FIRST_RAID_DELAY_MS = 45_000;
const BEAR_TELEGRAPH_MS = 8000; // telegraph -> raiding
const RAID_DURATION_MS = 6000;
const NEXT_RAID_MIN_S = 45;
const NEXT_RAID_MAX_S = 70;

/** Send the bear away and seed the next raid a random interval out. */
function scheduleNextRaid(d: GardenData, ctx: EventContext): void {
  d.bearState = "away";
  d.nextBearAtMs = ctx.state.elapsedMs + rangeInt(ctx.rng, NEXT_RAID_MIN_S, NEXT_RAID_MAX_S) * 1000;
}

/** Grow blooms and honey, carrying fractional time so odd ticks never drift. */
function grow(d: GardenData, ctx: EventContext): void {
  if (d.bloomed < MAX_BLOOM) {
    d.bloomCarryMs += ctx.dtMs;
    while (d.bloomCarryMs >= BLOOM_PERIOD_MS && d.bloomed < MAX_BLOOM) {
      d.bloomed += 1;
      d.bloomCarryMs -= BLOOM_PERIOD_MS;
    }
    if (d.bloomed >= MAX_BLOOM) d.bloomCarryMs = 0; // no carry once fully bloomed
  }
  if (d.bloomed >= HONEY_MIN_BLOOM && d.honey < HONEY_MAX) {
    d.honeyCarryMs += ctx.dtMs;
    while (d.honeyCarryMs >= HONEY_PERIOD_MS && d.honey < HONEY_MAX) {
      d.honey = Math.min(HONEY_MAX, d.honey + HONEY_PER_TICK);
      d.honeyCarryMs -= HONEY_PERIOD_MS;
    }
    if (d.honey >= HONEY_MAX) d.honeyCarryMs = 0; // no carry once the hive is full
  }
}

/** Advance the bear state machine against the run clock. */
function stepBear(d: GardenData, ctx: EventContext): void {
  const now = ctx.state.elapsedMs;
  switch (d.bearState) {
    case "away":
      if (now >= d.nextBearAtMs) {
        d.bearState = "telegraphed";
        d.nextBearAtMs = now + BEAR_TELEGRAPH_MS; // repurposed as raid-start time
        ctx.emit({ kind: "mood", eventId: "garden", text: "A bear approaches the hive" });
        ctx.emit({ kind: "sound", sound: "telegraph-doom" });
      }
      break;
    case "telegraphed":
      if (now >= d.nextBearAtMs) {
        d.bearState = "raiding";
        d.raidEndsAtMs = now + RAID_DURATION_MS;
      }
      break;
    case "raiding":
      if (now >= d.raidEndsAtMs) {
        d.honey = 0;
        d.bloomed = Math.max(0, d.bloomed - 2);
        ctx.emit({ kind: "mood", eventId: "garden", text: "The bear trampled the garden" });
        scheduleNextRaid(d, ctx);
      }
      break;
  }
}

/**
 * Chain 3: a bear sent packing swats an invasion on its way out. It swipes the single
 * highest-priority invasion in peak (galaga before snake before tetris) via that event's
 * bearSwipe primitive, using the sanctioned cross-event read idiom. Returns whether a
 * swipe actually landed, so the caller only moods when the bear did something.
 */
const INVASION_PRIORITY = ["galaga", "snake", "tetris"] as const;

function swipeInvaders(ctx: EventContext): boolean {
  for (const defId of INVASION_PRIORITY) {
    const inst = ctx.state.events.find((e) => e.defId === defId);
    if (!inst || inst.phase !== "peak" || inst.data === undefined) continue;
    // The first in-peak invasion is THE target — no fall-through to a lower one
    // even if its swipe finds nothing to hit.
    if (defId === "galaga") return galagaBearSwipe(inst as EventInstance<GalagaData>, ctx);
    if (defId === "snake") return snakeBearSwipe(inst as EventInstance<SnakeData>, ctx);
    return tetrisBearSwipe(inst as EventInstance<TetrisData>, ctx);
  }
  return false;
}

/** Coupled rule: the hive must hold at least MIN_HONEY at submit. */
const gardenHoneyRule: Pg2RuleDef = {
  id: "garden-honey",
  act: "act3",
  create: () => ({
    id: "garden-honey",
    act: "act3",
    description:
      "Keep the hive at 40+ honey when you submit. Throw the picnic basket when the bear comes — bears remember who feeds them.",
    validate: (_password, _state, api) => {
      const d = api.getEventData<GardenData>("garden");
      if (d === null) return { passed: true };
      return { passed: d.honey >= MIN_HONEY, message: `${d.honey} / ${MIN_HONEY}` };
    },
  }),
};

export const gardenDef: EventDef<GardenData> = {
  id: "garden",
  family: "inhabitant",
  telegraphMs: TELEGRAPH_MS,
  allyId: "garden",
  coupledRule: gardenHoneyRule,
  init: () => ({
    bloomed: 0,
    honey: 0,
    bearState: "away",
    nextBearAtMs: 0,
    raidEndsAtMs: 0,
    distractions: 0,
    bloomCarryMs: 0,
    honeyCarryMs: 0,
  }),
  onTick(inst: EventInstance<GardenData>, ctx: EventContext): void {
    const d = inst.data;
    if (inst.phase === "telegraph") {
      if (inst.phaseElapsedMs >= TELEGRAPH_MS) {
        inst.phase = "onset";
        d.nextBearAtMs = ctx.state.elapsedMs + FIRST_RAID_DELAY_MS;
        ctx.emit({ kind: "sound", sound: "inhabitant-arrive" });
      }
      return;
    }
    if (inst.phase === "onset") inst.phase = "peak";
    grow(d, ctx);
    stepBear(d, ctx);
  },
  onPointer(inst: EventInstance<GardenData>, ctx: EventContext, target): boolean {
    if (target.kind !== "basket-button") return false;
    const d = inst.data;
    if (d.bearState === "telegraphed" || d.bearState === "raiding") {
      d.distractions += 1;
      ctx.emit({ kind: "sound", sound: "paper-shred" });
      ctx.emit({ kind: "mood", eventId: "garden", text: "The bear takes the basket and leaves" });
      scheduleNextRaid(d, ctx);
      if (swipeInvaders(ctx)) {
        ctx.emit({
          kind: "mood",
          eventId: "garden",
          text: "The bear swats the invaders on its way out. It remembers this.",
        });
      }
    }
    return true;
  },
  isResolved: (_inst, state) => state.act === "finale",
  isAlive: (inst) => inst.data.honey >= MIN_HONEY,
};
