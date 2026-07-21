import { describe, expect, it } from "vitest";
import { createRun } from "../engine";
import { cellsToPassword } from "../cells";
import { mulberry32 } from "../rng";
import { autocorrectDef, type AutocorrectData } from "../events/autocorrect";
import { geraldDef } from "../events/gerald";
import { gardenDef } from "../events/garden";
import { campfireDef } from "../events/campfire";
import { infectionDef } from "../events/infection";
import type { CharCell, Effect, EventContext, EventDef, EventInstance, GameState } from "../types";

/**
 * Cross-event chains (Workstream B). Each chain is a deterministic side effect of an
 * already-deterministic event, with a visible beat (a mood line minimum) so the player
 * sees the connection.
 *
 * Chain 1: the autocorrect demon becomes the ecosystem's antagonist — mangling an
 * inhabitant's word also strikes that inhabitant (Gerald hungrier, the hive drained,
 * the fire damped). Chain 2: a well-fed campfire quarantines infection, curing one
 * infected cell every 5s as a fuel-earned perk.
 *
 * The harness drives multiple real instances on ONE GameState: every event's data comes
 * from its own init() (never a hand-built data object), cells are arranged directly, and
 * only the instance under test is ticked so the shared clock stays honest.
 */

const HHMM = "12:00";

interface Env {
  state: GameState;
  rng: () => number;
  effects: Effect[];
}

/** A fresh act3 run with a running clock and an empty effect log. */
function boot(seed = 1): Env {
  const state = createRun({ seed, daily: false, nowHHMM: () => HHMM });
  state.startedAtMs = 0; // let elapsedMs advance as we drive
  state.act = "act3";
  state.events = []; // drop the Director's scheduled roster; this suite adds only what it drives
  return { state, rng: mulberry32(seed), effects: [] };
}

/** Init a real instance of `def` (via def.init) sitting in telegraph, and add it to the run. */
function addEvent<S>(env: Env, def: EventDef<S>, seed = 1): EventInstance<S> {
  const inst: EventInstance<S> = {
    defId: def.id,
    family: def.family,
    act: "act3",
    phase: "telegraph",
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data: def.init(mulberry32(seed), env.state),
  };
  env.state.events.push(inst as EventInstance);
  return inst;
}

function ctx(env: Env, dtMs: number): EventContext {
  return { state: env.state, rng: env.rng, dtMs, emit: (e) => env.effects.push(e) };
}

/** Mirror the engine for ONE instance: advance the clock, accumulate phaseElapsedMs, tick, reset on flip. */
function driveInst<S>(env: Env, def: EventDef<S>, inst: EventInstance<S>, dtMs: number): void {
  env.state.elapsedMs += dtMs;
  const prev = inst.phase;
  inst.phaseElapsedMs += dtMs;
  def.onTick(inst, ctx(env, dtMs));
  if (inst.phase !== prev) inst.phaseElapsedMs = 0;
}

/** Advance one instance past telegraph and its one-tick onset, landing in peak with no extra time. */
function toPeak<S>(env: Env, def: EventDef<S>, inst: EventInstance<S>): void {
  driveInst(env, def, inst, def.telegraphMs); // telegraph -> onset
  driveInst(env, def, inst, 0); // onset -> peak
}

/** Replace the box with a fresh run of normal cells, ids 1..n, caret at the end. */
function plant(env: Env, text: string): void {
  env.state.cells = [...text].map((ch, i) => ({ id: i + 1, ch, status: "normal" }) as CharCell);
  env.state.nextCellId = [...text].length + 1;
  env.state.caret = env.state.cells.length;
}

const cell = (id: number, ch: string): CharCell => ({ id, ch, status: "normal" });
/** An infection-tagged infected cell — the only shape campfire quarantine may cure. */
const infected = (id: number, ch: string): CharCell => ({
  id,
  ch,
  status: "infected",
  eventTag: "infection",
});

const moods = (effects: Effect[]): Array<{ eventId: string; text: string }> =>
  effects.flatMap((e) => (e.kind === "mood" ? [{ eventId: e.eventId, text: e.text }] : []));
const cellById = (env: Env, id: number): CharCell => env.state.cells.find((c) => c.id === id)!;
const valueOf = (env: Env): string => cellsToPassword(env.state.cells);

/** Drive autocorrect to peak, plant `word`, and advance to its first scan (onset + 8000ms). */
function scanWord(env: Env, word: string): EventInstance<AutocorrectData> {
  const auto = addEvent(env, autocorrectDef, 3);
  toPeak(env, autocorrectDef, auto);
  plant(env, word);
  env.effects.length = 0;
  driveInst(env, autocorrectDef, auto, 8000); // first scan lands at onset + 8000
  return auto;
}

// --- Chain 1: autocorrect sabotages the inhabitants --------------------------

describe("chain 1: the autocorrect demon strikes the inhabitant it names", () => {
  it("mangling 'gerald' spikes an active Gerald's hunger by 25 and moods on him", () => {
    const env = boot();
    const gerald = addEvent(env, geraldDef, 2);
    toPeak(env, geraldDef, gerald);
    expect(gerald.data.hunger).toBe(30); // onset default, untouched by the wait

    const auto = scanWord(env, "gerald");
    expect(auto.data.corrections).toBe(1);
    expect(valueOf(env)).toBe("gerard"); // the rewrite still lands
    expect(gerald.data.hunger).toBe(55); // 30 + 25
    expect(moods(env.effects)).toContainEqual({
      eventId: "gerald",
      text: "The autocorrect demon ate Gerald's dinner",
    });
  });

  it("clamps Gerald's sabotaged hunger at 100", () => {
    const env = boot();
    const gerald = addEvent(env, geraldDef, 2);
    toPeak(env, geraldDef, gerald);
    gerald.data.hunger = 90;

    scanWord(env, "gerald");
    expect(gerald.data.hunger).toBe(100); // min(100, 90 + 25)
  });

  it("mangling 'honey' drains an active garden's honey by 15 and moods on the garden", () => {
    const env = boot();
    const garden = addEvent(env, gardenDef, 2);
    toPeak(env, gardenDef, garden);
    garden.data.honey = 50;

    const auto = scanWord(env, "honey");
    expect(auto.data.corrections).toBe(1);
    expect(valueOf(env)).toBe("hone"); // honey -> hone
    expect(garden.data.honey).toBe(35); // 50 - 15
    expect(moods(env.effects)).toContainEqual({
      eventId: "garden",
      text: "The autocorrect demon drained the hive",
    });
  });

  it("floors the garden's sabotaged honey at 0", () => {
    const env = boot();
    const garden = addEvent(env, gardenDef, 2);
    toPeak(env, gardenDef, garden);
    garden.data.honey = 10;

    scanWord(env, "honey");
    expect(garden.data.honey).toBe(0); // max(0, 10 - 15)
  });

  it("mangling 'fire' knocks 20 fuel off an active campfire and moods on it", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 2);
    toPeak(env, campfireDef, campfire);
    expect(campfire.data.fuel).toBe(80); // onset default

    const auto = scanWord(env, "fire");
    expect(auto.data.corrections).toBe(1);
    expect(valueOf(env)).toBe("fira"); // fire -> fira
    expect(campfire.data.fuel).toBe(60); // 80 - 20
    expect(moods(env.effects)).toContainEqual({
      eventId: "campfire",
      text: "The autocorrect demon damped the fire",
    });
  });

  it("floors the campfire's sabotaged fuel at 0", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 2);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 10;

    scanWord(env, "fire");
    expect(campfire.data.fuel).toBe(0); // max(0, 10 - 20)
  });

  it("with no inhabitant present the rewrite behaves exactly as before: same cells, no mood", () => {
    const env = boot();
    const auto = scanWord(env, "gerald"); // autocorrect alone
    expect(auto.data.corrections).toBe(1);
    expect(valueOf(env)).toBe("gerard"); // the rewrite is unchanged
    expect(moods(env.effects)).toEqual([]); // nothing to strike, nothing to say
  });

  it("does not strike an inhabitant still in telegraph (not yet a live victim)", () => {
    const env = boot();
    const gerald = addEvent(env, geraldDef, 2); // left in telegraph, never brought to peak
    expect(gerald.phase).toBe("telegraph");

    scanWord(env, "gerald");
    expect(gerald.data.hunger).toBe(30); // untouched: the phase guard rejects a telegraphing victim
    expect(moods(env.effects)).toEqual([]);
  });
});

// --- Chain 2: a well-fed campfire quarantines infection ----------------------

describe("chain 2: a well-fed campfire quarantines infection", () => {
  it("cures the leftmost infected cell after 5s when fuel is at least 60", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 1);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 80;
    campfire.data.quarantineCarryMs = 0;
    env.state.cells = [cell(1, "a"), infected(2, "b"), infected(3, "c")];
    const curedBefore = env.state.stats.infectionsCured;
    env.effects.length = 0;

    driveInst(env, campfireDef, campfire, 5000);
    expect(cellById(env, 2).status).toBe("normal"); // leftmost infected cured
    expect(cellById(env, 3).status).toBe("infected"); // the next one waits its turn
    expect(env.state.stats.infectionsCured).toBe(curedBefore + 1);
    expect(moods(env.effects)).toContainEqual({
      eventId: "campfire",
      text: "The fire seared the corruption away",
    });
  });

  it("does not cure while fuel is below 60", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 1);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 50; // under the quarantine threshold
    campfire.data.quarantineCarryMs = 0;
    env.state.cells = [infected(1, "a")];
    const curedBefore = env.state.stats.infectionsCured;
    env.effects.length = 0;

    driveInst(env, campfireDef, campfire, 5000);
    expect(cellById(env, 1).status).toBe("infected"); // still corrupt
    expect(env.state.stats.infectionsCured).toBe(curedBefore);
    expect(moods(env.effects)).toEqual([]);
  });

  it("holds a cadence of one cure per 5s: two infected cells take ~10s", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 1);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 100; // stays well above 60 across the whole window
    campfire.data.quarantineCarryMs = 0;
    env.state.cells = [infected(1, "a"), infected(2, "b")];
    const curedBefore = env.state.stats.infectionsCured;

    driveInst(env, campfireDef, campfire, 5000);
    expect(cellById(env, 1).status).toBe("normal");
    expect(cellById(env, 2).status).toBe("infected"); // not yet: cadence gates it
    expect(env.state.stats.infectionsCured).toBe(curedBefore + 1);

    driveInst(env, campfireDef, campfire, 5000); // ~10s total
    expect(cellById(env, 2).status).toBe("normal");
    expect(env.state.stats.infectionsCured).toBe(curedBefore + 2);
  });

  it("is a perk, not a cost: curing never consumes campfire fuel", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 1);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 80;
    campfire.data.fuelCarryMs = 0;
    campfire.data.quarantineCarryMs = 0;
    env.state.cells = [infected(1, "a")];

    driveInst(env, campfireDef, campfire, 5000);
    expect(cellById(env, 1).status).toBe("normal"); // it did cure
    expect(campfire.data.fuel).toBe(75); // only the -1/s burn decay, nothing extra for the cure
  });

  it("touches only infection-tagged infected cells, never mutated/parasite/garbage", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 1);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 80;
    campfire.data.quarantineCarryMs = 0;
    env.state.cells = [
      { id: 1, ch: "a", status: "mutated", eventTag: "infection" },
      { id: 2, ch: "b", status: "parasite", eventTag: "galaga" },
      { id: 3, ch: "c", status: "garbage", eventTag: "tetris" },
    ];
    const curedBefore = env.state.stats.infectionsCured;
    env.effects.length = 0;

    driveInst(env, campfireDef, campfire, 5000);
    expect(cellById(env, 1).status).toBe("mutated"); // out of scope
    expect(cellById(env, 2).status).toBe("parasite");
    expect(cellById(env, 3).status).toBe("garbage");
    expect(env.state.stats.infectionsCured).toBe(curedBefore);
    expect(moods(env.effects)).toEqual([]);
  });

  it("cures a real infection the infection event seeded, without touching its spread cadence", () => {
    const env = boot(7);
    env.state.cells = [..."abcdefgh"].map((ch, i) => cell(i + 1, ch));
    env.state.nextCellId = 9;

    // Run infection through its telegraph so its onset corrupts exactly one real cell.
    const infection = addEvent(env, infectionDef, 7);
    driveInst(env, infectionDef, infection, infectionDef.telegraphMs); // telegraph -> onset
    const seeded = env.state.cells.find((c) => c.status === "infected");
    expect(seeded).toBeDefined();
    const spreadAtBefore = infection.data.nextSpreadAtMs;

    // A well-fed campfire, ticked alone, sears that cell clean.
    const campfire = addEvent(env, campfireDef, 7);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 80;
    campfire.data.quarantineCarryMs = 0;
    const curedBefore = env.state.stats.infectionsCured;
    env.effects.length = 0;

    driveInst(env, campfireDef, campfire, 5000);
    expect(cellById(env, seeded!.id).status).toBe("normal");
    expect(env.state.stats.infectionsCured).toBe(curedBefore + 1);
    expect(moods(env.effects)).toContainEqual({
      eventId: "campfire",
      text: "The fire seared the corruption away",
    });
    // Infection's own mechanics are untouched: spread clock unchanged, and its private
    // infectedSinceMs bookkeeping is left exactly as its own cure would leave it (in place).
    expect(infection.data.nextSpreadAtMs).toBe(spreadAtBefore);
    expect(infection.data.infectedSinceMs[seeded!.id]).toBeDefined();
  });
});
