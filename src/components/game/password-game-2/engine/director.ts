import type { EventFamily, EventInstance } from "./types";
import { mulberry32, subSeed } from "./rng";
import { EVENT_DEFS } from "./events/index";

/** One scripted event slot within an act; onset time is act-relative. */
export interface SlotSpec {
  atMs: number; // act-relative onset
  family: EventFamily;
  pin?: string; // exact event id to place here
  overlap?: boolean; // sanctioned two-crisis slot (exempt from the valley rule)
}

/** Acts the Director scripts. The prologue and finale carry no scheduled events. */
type ScriptedAct = "act1" | "act2" | "act3";

/**
 * The authored slot map. Onsets keep a >= 20s valley between blocking beats except
 * where `overlap` marks the engineered two-crisis moment. Inhabitant slots sit
 * EARLY in their act — an inhabitant scheduled past the act's last blocking beat
 * could be skipped by a fast player, since events only init while their act is
 * current (see engine.tick). act3's force and chrome slots are coin-flipped away.
 */
export const ACT_SCRIPTS: Record<ScriptedAct, SlotSpec[]> = {
  act1: [
    { atMs: 40_000, family: "inhabitant" },
    { atMs: 150_000, family: "chrome" },
  ],
  act2: [
    { atMs: 30_000, family: "force" },
    { atMs: 60_000, family: "inhabitant" },
    { atMs: 120_000, family: "chrome" },
    { atMs: 150_000, family: "force", overlap: true },
  ],
  act3: [
    { atMs: 20_000, family: "invasion", pin: "galaga" },
    { atMs: 120_000, family: "invasion" },
    { atMs: 200_000, family: "force" },
    { atMs: 280_000, family: "chrome" },
  ],
};

const SCRIPTED_ACTS: ScriptedAct[] = ["act1", "act2", "act3"];

/**
 * Slots the Director may drop on a coin flip, keeping the run's event count in the
 * 8..10 band (10 base slots minus 0, 1, or 2 of these two).
 */
function isDroppable(act: ScriptedAct, slot: SlotSpec): boolean {
  return (
    act === "act3" &&
    slot.pin === undefined &&
    (slot.family === "force" || slot.family === "chrome")
  );
}

/**
 * Resolve a run's seeded event schedule. Each family draws without replacement from
 * a single per-run pool (so a def used in an early act cannot recur later); each
 * act's draws come off `mulberry32(subSeed(seed, "director-" + act))`. Pinned slots
 * take their exact id; droppable slots are decided by a coin flip on the same
 * stream. A dry pool skips the slot rather than throwing (cannot happen with the
 * current 12-def manifest, but the guard keeps a shrunken manifest safe).
 */
export function buildSchedule(seed: number): EventInstance[] {
  const pools: Record<EventFamily, string[]> = {
    inhabitant: idsOfFamily("inhabitant"),
    force: idsOfFamily("force"),
    invasion: idsOfFamily("invasion"),
    chrome: idsOfFamily("chrome"),
  };

  const schedule: EventInstance[] = [];
  for (const act of SCRIPTED_ACTS) {
    const rng = mulberry32(subSeed(seed, "director-" + act));
    for (const slot of ACT_SCRIPTS[act]) {
      if (isDroppable(act, slot) && rng() < 0.5) continue;

      const pool = pools[slot.family];
      let defId: string;
      if (slot.pin !== undefined) {
        const idx = pool.indexOf(slot.pin);
        if (idx === -1) continue; // pinned def already drawn or absent: skip the slot
        pool.splice(idx, 1);
        defId = slot.pin;
      } else {
        if (pool.length === 0) continue; // family exhausted: skip the slot
        const idx = Math.floor(rng() * pool.length);
        const picked = pool[idx];
        if (picked === undefined) continue;
        pool.splice(idx, 1);
        defId = picked;
      }

      schedule.push({
        defId,
        family: slot.family,
        act,
        phase: "telegraph",
        phaseElapsedMs: 0,
        scheduledAtMs: slot.atMs,
        data: undefined,
      });
    }
  }
  return schedule;
}

/** Ids of every manifest def in a family, in manifest order. */
function idsOfFamily(family: EventFamily): string[] {
  return EVENT_DEFS.filter((d) => d.family === family).map((d) => d.id);
}
