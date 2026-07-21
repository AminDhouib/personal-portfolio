import { describe, expect, it } from "vitest";
import { createRun } from "../engine";
import { cellsToPassword } from "../cells";
import { mulberry32 } from "../rng";
import { autocorrectDef, type AutocorrectData } from "../events/autocorrect";
import { geraldDef } from "../events/gerald";
import { gardenDef } from "../events/garden";
import { campfireDef } from "../events/campfire";
import { infectionDef } from "../events/infection";
import { galagaDef, bearSwipe as galagaBearSwipe, type GalagaData } from "../events/galaga";
import { snakeDef, bearSwipe as snakeBearSwipe } from "../events/snake";
import { tetrisDef, bearSwipe as tetrisBearSwipe } from "../events/tetris";
import { blackHoleDef } from "../events/black-hole";
import { cookieBannerDef } from "../events/cookie-banner";
import type {
  CharCell,
  Effect,
  EventContext,
  EventDef,
  EventInstance,
  GameState,
  PointerTarget,
} from "../types";

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

/** Route a pointer target to one instance's onPointer at the current clock (no time passes). */
function pointer<S>(
  env: Env,
  def: EventDef<S>,
  inst: EventInstance<S>,
  target: PointerTarget,
): boolean {
  return def.onPointer!(inst, ctx(env, 0), target);
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

// --- bearSwipe: each invasion's counterattack primitive -----------------------

describe("bearSwipe: the invasion primitive the bear calls", () => {
  it("galaga downs one live alien and tallies it", () => {
    const env = boot();
    const galaga = addEvent(env, galagaDef, 5);
    toPeak(env, galagaDef, galaga);
    const isLive = (a: GalagaData["aliens"][number]): boolean =>
      a.state !== "down" && a.state !== "fled";
    const liveBefore = galaga.data.aliens.filter(isLive).length;
    const downedBefore = env.state.stats.aliensDowned;

    expect(galagaBearSwipe(galaga, ctx(env, 0))).toBe(true);
    expect(galaga.data.aliens.filter(isLive)).toHaveLength(liveBefore - 1);
    expect(env.state.stats.aliensDowned).toBe(downedBefore + 1);
  });

  it("galaga frees a carried glyph on the swipe, exactly like a key-shot", () => {
    const env = boot();
    const galaga = addEvent(env, galagaDef, 5);
    toPeak(env, galagaDef, galaga);
    env.state.cells = [{ id: 1, ch: "x", status: "abducted", eventTag: "galaga" }];
    galaga.data.aliens[0]!.state = "carrying"; // a carrier outranks the formation
    galaga.data.aliens[0]!.carriedCellId = 1;
    const rescuedBefore = env.state.stats.lettersRescued;
    const downedBefore = env.state.stats.aliensDowned;

    expect(galagaBearSwipe(galaga, ctx(env, 0))).toBe(true);
    expect(galaga.data.aliens[0]!.state).toBe("down");
    expect(cellById(env, 1).status).toBe("normal"); // the glyph rained back
    expect(env.state.stats.lettersRescued).toBe(rescuedBefore + 1);
    expect(env.state.stats.aliensDowned).toBe(downedBefore + 1);
  });

  it("galaga swipe is a no-op with the whole fleet already down", () => {
    const env = boot();
    const galaga = addEvent(env, galagaDef, 5);
    toPeak(env, galagaDef, galaga);
    for (const a of galaga.data.aliens) a.state = "down";
    const downedBefore = env.state.stats.aliensDowned;

    expect(galagaBearSwipe(galaga, ctx(env, 0))).toBe(false);
    expect(env.state.stats.aliensDowned).toBe(downedBefore);
  });

  it("snake swipe shoves the next bite one full interval later", () => {
    const env = boot();
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    const biteBefore = snake.data.nextBiteAtMs;

    expect(snakeBearSwipe(snake, ctx(env, 0))).toBe(true);
    expect(snake.data.nextBiteAtMs).toBe(biteBefore + 5000); // one BITE_PERIOD_MS out
  });

  it("snake swipe is a no-op once the snake has slithered off", () => {
    const env = boot();
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    snake.data.gone = true;
    const biteBefore = snake.data.nextBiteAtMs;

    expect(snakeBearSwipe(snake, ctx(env, 0))).toBe(false);
    expect(snake.data.nextBiteAtMs).toBe(biteBefore);
  });

  it("tetris swipe shatters the leftmost garbage block, caret and all", () => {
    const env = boot();
    const tetris = addEvent(env, tetrisDef, 6);
    env.state.cells = [
      cell(1, "a"),
      { id: 2, ch: "#", status: "garbage", eventTag: "tetris" },
      cell(3, "b"),
    ];
    env.state.caret = 3; // to the right of the garbage
    const clearedBefore = env.state.stats.garbageCleared;

    expect(tetrisBearSwipe(tetris, ctx(env, 0))).toBe(true);
    expect(valueOf(env)).toBe("ab"); // the junk was spliced out
    expect(env.state.cells.some((c) => c.status === "garbage")).toBe(false);
    expect(env.state.caret).toBe(2); // caret to the right of the removal slid left
    expect(env.state.stats.garbageCleared).toBe(clearedBefore + 1);
    expect(tetris.data.hasShattered).toBe(true);
  });

  it("tetris swipe is a no-op when no garbage remains", () => {
    const env = boot();
    const tetris = addEvent(env, tetrisDef, 6);
    env.state.cells = [cell(1, "a"), cell(2, "b")];
    env.state.caret = 2;
    const clearedBefore = env.state.stats.garbageCleared;

    expect(tetrisBearSwipe(tetris, ctx(env, 0))).toBe(false);
    expect(valueOf(env)).toBe("ab");
    expect(env.state.caret).toBe(2);
    expect(env.state.stats.garbageCleared).toBe(clearedBefore);
  });
});

// --- Chain 3: the bear swats the invaders on its way out ----------------------

describe("chain 3: a fed bear turns on the invaders", () => {
  it("a basket toss with the bear present downs a galaga alien and moods /remember/", () => {
    const env = boot();
    const garden = addEvent(env, gardenDef, 2);
    toPeak(env, gardenDef, garden);
    garden.data.bearState = "telegraphed";
    const galaga = addEvent(env, galagaDef, 5);
    toPeak(env, galagaDef, galaga);
    const downedBefore = env.state.stats.aliensDowned;
    env.effects.length = 0;

    expect(pointer(env, gardenDef, garden, { kind: "basket-button" })).toBe(true);
    expect(garden.data.distractions).toBe(1); // the base distraction beat still fires
    expect(env.state.stats.aliensDowned).toBe(downedBefore + 1); // the bear downed one
    expect(moods(env.effects).some((m) => m.eventId === "garden" && /remember/i.test(m.text))).toBe(
      true,
    );
  });

  it("prefers galaga over a live snake when several invasions are up", () => {
    const env = boot();
    const garden = addEvent(env, gardenDef, 2);
    toPeak(env, gardenDef, garden);
    garden.data.bearState = "raiding";
    const galaga = addEvent(env, galagaDef, 5);
    toPeak(env, galagaDef, galaga);
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    const snakeBiteBefore = snake.data.nextBiteAtMs;
    const downedBefore = env.state.stats.aliensDowned;

    expect(pointer(env, gardenDef, garden, { kind: "basket-button" })).toBe(true);
    expect(env.state.stats.aliensDowned).toBe(downedBefore + 1); // galaga took the hit
    expect(snake.data.nextBiteAtMs).toBe(snakeBiteBefore); // lower-priority snake untouched
  });

  it("with no live invasion the toss behaves exactly as today", () => {
    const env = boot();
    const garden = addEvent(env, gardenDef, 2);
    toPeak(env, gardenDef, garden);
    garden.data.bearState = "telegraphed";
    env.effects.length = 0;

    expect(pointer(env, gardenDef, garden, { kind: "basket-button" })).toBe(true);
    expect(garden.data.distractions).toBe(1);
    expect(garden.data.bearState).toBe("away"); // scheduleNextRaid still ran
    expect(moods(env.effects)).toEqual([
      { eventId: "garden", text: "The bear takes the basket and leaves" },
    ]); // only the base beat, no swipe mood
  });

  it("does not swipe when the basket is tossed while the bear is away", () => {
    const env = boot();
    const garden = addEvent(env, gardenDef, 2);
    toPeak(env, gardenDef, garden); // bear away by default
    const galaga = addEvent(env, galagaDef, 5);
    toPeak(env, galagaDef, galaga);
    const downedBefore = env.state.stats.aliensDowned;
    env.effects.length = 0;

    expect(pointer(env, gardenDef, garden, { kind: "basket-button" })).toBe(true);
    expect(garden.data.distractions).toBe(0); // away path is the existing no-op
    expect(env.state.stats.aliensDowned).toBe(downedBefore); // no swipe fired
    expect(moods(env.effects)).toEqual([]);
  });
});

// --- Chain 4: the storage compactor eats garbage -----------------------------

describe("chain 4: the compactor eats garbage first", () => {
  const garbage = (id: number, ch: string): CharCell => ({
    id,
    ch,
    status: "garbage",
    eventTag: "tetris",
  });

  it("prefers a garbage cell over a nearer normal one and moods on the first capture", () => {
    const env = boot();
    const bh = addEvent(env, blackHoleDef, 5);
    toPeak(env, blackHoleDef, bh);
    env.state.cells = [cell(1, "a"), garbage(2, "#"), cell(3, "b"), cell(4, "c")];
    bh.data.anchorIndex = 3; // nearest normal is idx3 (id4); the junk sits far off at idx1
    bh.data.nextPullAtMs = env.state.elapsedMs; // a pull is due now
    env.effects.length = 0;

    driveInst(env, blackHoleDef, bh, 0);
    expect(cellById(env, 2).status).toBe("orbiting"); // the junk got compacted first
    expect(cellById(env, 4).status).toBe("normal"); // the nearer normal cell was spared
    expect(
      moods(env.effects).some((m) => m.eventId === "black-hole" && /compact/i.test(m.text)),
    ).toBe(true);
  });

  it("washes a captured garbage cell back to a normal, value-bearing cell on collapse", () => {
    const env = boot();
    const bh = addEvent(env, blackHoleDef, 5);
    toPeak(env, blackHoleDef, bh);
    env.state.cells = [cell(1, "a"), garbage(2, "#")];
    bh.data.anchorIndex = 1;
    bh.data.nextPullAtMs = env.state.elapsedMs;

    driveInst(env, blackHoleDef, bh, 0); // capture the garbage
    expect(cellById(env, 2).status).toBe("orbiting");

    bh.data.collapsingSinceMs = env.state.elapsedMs;
    driveInst(env, blackHoleDef, bh, 2000); // grace elapses -> collapse
    expect(cellById(env, 2).status).toBe("normal"); // the compactor cleaned it
    expect(valueOf(env)).toContain("#"); // it now counts in the value
  });

  it("emits the compaction mood only on the first garbage capture", () => {
    const env = boot();
    const bh = addEvent(env, blackHoleDef, 5);
    toPeak(env, blackHoleDef, bh);
    env.state.cells = [garbage(1, "#"), garbage(2, "%"), cell(3, "a")];
    bh.data.anchorIndex = 0;
    bh.data.nextPullAtMs = env.state.elapsedMs;

    driveInst(env, blackHoleDef, bh, 0); // first garbage capture -> mood
    expect(moods(env.effects).filter((m) => /compact/i.test(m.text))).toHaveLength(1);

    env.effects.length = 0;
    bh.data.nextPullAtMs = env.state.elapsedMs;
    driveInst(env, blackHoleDef, bh, 0); // second garbage capture -> silent
    expect(moods(env.effects).filter((m) => /compact/i.test(m.text))).toHaveLength(0);
  });

  it("with no garbage present, capture order is identical to today and stays silent", () => {
    const env = boot();
    const bh = addEvent(env, blackHoleDef, 5);
    toPeak(env, blackHoleDef, bh);
    env.state.cells = [cell(1, "a"), cell(2, "b"), cell(3, "c"), cell(4, "d"), cell(5, "e")];
    bh.data.anchorIndex = 2; // nearest normal is idx2 (id3)
    bh.data.nextPullAtMs = env.state.elapsedMs;
    env.effects.length = 0;

    driveInst(env, blackHoleDef, bh, 0);
    expect(cellById(env, 3).status).toBe("orbiting"); // nearest normal, exactly as before
    expect(bh.data.compactedGarbage).toBe(false);
    expect(moods(env.effects).filter((m) => /compact/i.test(m.text))).toHaveLength(0);
  });
});

// --- Chain 5: a well-fed campfire ignites a consent banner --------------------

describe("chain 5: the campfire burns one banner in a live swarm", () => {
  /** A live cookie swarm of three banners: onset spawns one, a decline breeds two more. */
  function swarmOfThree(env: Env) {
    const cookie = addEvent(env, cookieBannerDef, 3);
    toPeak(env, cookieBannerDef, cookie); // banner ordinal 0
    pointer(env, cookieBannerDef, cookie, { kind: "banner-decline" }); // breeds two more
    return cookie;
  }

  it("burns exactly one banner, costs 15 fuel, and moods /burn|ignit/ once per swarm", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 2);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 80; // burning, well above the ignite floor
    const cookie = swarmOfThree(env);
    expect(cookie.data.banners.length).toBe(3);
    env.effects.length = 0;

    driveInst(env, cookieBannerDef, cookie, 0); // ignite tick, no time passes
    expect(cookie.data.banners.length).toBe(2); // one banner burned away
    expect(campfire.data.fuel).toBe(65); // 80 - 15
    expect(cookie.data.fireUsedThisSwarm).toBe(true);
    expect(
      moods(env.effects).some((m) => m.eventId === "cookie-banner" && /burn|ignit/i.test(m.text)),
    ).toBe(true);

    // Once per swarm: a second tick with the fire still hot changes nothing.
    env.effects.length = 0;
    driveInst(env, cookieBannerDef, cookie, 0);
    expect(cookie.data.banners.length).toBe(2);
    expect(campfire.data.fuel).toBe(65);
    expect(moods(env.effects)).toEqual([]);
  });

  it("does nothing while the fire's fuel is below 50", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 2);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 40; // burning but under the ignite floor
    const cookie = swarmOfThree(env);
    env.effects.length = 0;

    driveInst(env, cookieBannerDef, cookie, 0);
    expect(cookie.data.banners.length).toBe(3); // no burn
    expect(campfire.data.fuel).toBe(40);
    expect(cookie.data.fireUsedThisSwarm).toBe(false);
    expect(moods(env.effects)).toEqual([]);
  });

  it("does nothing with only one banner up (a swarm is at least two deep)", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 2);
    toPeak(env, campfireDef, campfire);
    campfire.data.fuel = 80;
    const cookie = addEvent(env, cookieBannerDef, 3);
    toPeak(env, cookieBannerDef, cookie); // just banner ordinal 0
    expect(cookie.data.banners.length).toBe(1);
    env.effects.length = 0;

    driveInst(env, cookieBannerDef, cookie, 0);
    expect(cookie.data.banners.length).toBe(1);
    expect(campfire.data.fuel).toBe(80);
    expect(cookie.data.fireUsedThisSwarm).toBe(false);
    expect(moods(env.effects)).toEqual([]);
  });

  it("with no campfire present the swarm behaves exactly as today", () => {
    const env = boot();
    const cookie = swarmOfThree(env);
    env.effects.length = 0;

    driveInst(env, cookieBannerDef, cookie, 0);
    expect(cookie.data.banners.length).toBe(3);
    expect(cookie.data.fireUsedThisSwarm).toBe(false);
    expect(moods(env.effects)).toEqual([]);
  });

  it("does not ignite off a campfire still in telegraph (not yet a live fire)", () => {
    const env = boot();
    const campfire = addEvent(env, campfireDef, 2); // left in telegraph, never brought to peak
    campfire.data.fuel = 80;
    expect(campfire.phase).toBe("telegraph");
    const cookie = swarmOfThree(env);
    env.effects.length = 0;

    driveInst(env, cookieBannerDef, cookie, 0);
    expect(cookie.data.banners.length).toBe(3); // untouched: the phase guard rejects it
    expect(campfire.data.fuel).toBe(80);
    expect(moods(env.effects)).toEqual([]);
  });
});

// --- Chain 6: a well-fed Gerald calms the snake ------------------------------

describe("chain 6: a fed fish keeps the snake at bay", () => {
  /** Plant a row of normal cells so biteLast always has something to swallow. */
  function plantRow(env: Env, text: string): void {
    env.state.cells = [...text].map((ch, i) => cell(i + 1, ch));
  }

  it("schedules the next bite 1.5x further out and moods once when Gerald is fed", () => {
    const env = boot();
    const gerald = addEvent(env, geraldDef, 2);
    toPeak(env, geraldDef, gerald);
    expect(gerald.data.hunger).toBe(30); // well fed (<= 40)
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    plantRow(env, "abcdef");
    const firstBite = snake.data.nextBiteAtMs;
    env.effects.length = 0;

    driveInst(env, snakeDef, snake, firstBite - env.state.elapsedMs); // land on the first bite
    expect(snake.data.nextBiteAtMs).toBe(firstBite + 7500); // 5000 * 1.5, calm cadence
    expect(moods(env.effects)).toContainEqual({
      eventId: "snake",
      text: "The snake keeps its distance from a fed fish.",
    });
  });

  it("leaves the base cadence when Gerald is hungry (> 40)", () => {
    const env = boot();
    const gerald = addEvent(env, geraldDef, 2);
    toPeak(env, geraldDef, gerald);
    gerald.data.hunger = 41; // just over the calm threshold
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    plantRow(env, "abcdef");
    const firstBite = snake.data.nextBiteAtMs;
    env.effects.length = 0;

    driveInst(env, snakeDef, snake, firstBite - env.state.elapsedMs);
    expect(snake.data.nextBiteAtMs).toBe(firstBite + 5000); // base BITE_PERIOD_MS, no slowdown
    expect(moods(env.effects)).toEqual([]);
  });

  it("keeps the base cadence with no Gerald in the run", () => {
    const env = boot();
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    plantRow(env, "abcdef");
    const firstBite = snake.data.nextBiteAtMs;
    env.effects.length = 0;

    driveInst(env, snakeDef, snake, firstBite - env.state.elapsedMs);
    expect(snake.data.nextBiteAtMs).toBe(firstBite + 5000);
    expect(moods(env.effects)).toEqual([]);
  });

  it("moods once per snake instance across successive slowed bites", () => {
    const env = boot();
    const gerald = addEvent(env, geraldDef, 2);
    toPeak(env, geraldDef, gerald); // calm
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    plantRow(env, "abcdefghij");
    env.effects.length = 0;

    driveInst(env, snakeDef, snake, 20_000); // several calm bites in one long tick
    const calm = moods(env.effects).filter(
      (m) => m.eventId === "snake" && /keeps its distance/i.test(m.text),
    );
    expect(calm).toHaveLength(1);
  });

  it("does not slow off a Gerald still in telegraph (not yet a live calmer)", () => {
    const env = boot();
    const gerald = addEvent(env, geraldDef, 2); // left in telegraph
    expect(gerald.phase).toBe("telegraph");
    const snake = addEvent(env, snakeDef, 4);
    toPeak(env, snakeDef, snake);
    plantRow(env, "abcdef");
    const firstBite = snake.data.nextBiteAtMs;
    env.effects.length = 0;

    driveInst(env, snakeDef, snake, firstBite - env.state.elapsedMs);
    expect(snake.data.nextBiteAtMs).toBe(firstBite + 5000); // base cadence, guard rejects it
    expect(moods(env.effects)).toEqual([]);
  });
});
