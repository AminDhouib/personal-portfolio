import { describe, expect, it } from "vitest";
import { applyKey, createRun, makeRuleApi, tick } from "../engine";
import { cellsToPassword } from "../cells";
import { mulberry32 } from "../rng";
import { solveAll } from "./solve";
import { geraldDef, type GeraldData } from "../events/gerald";
import { campfireDef, type CampfireData } from "../events/campfire";
import { gardenDef, type GardenData } from "../events/garden";
import type {
  ActId,
  CellStatus,
  CharCell,
  Effect,
  EventContext,
  EventDef,
  EventInstance,
  GameState,
  PointerTarget,
} from "../types";

/**
 * Unit tests for the three inhabitants. Each def is driven directly through a
 * hand-built EventContext that mirrors the engine's phaseElapsedMs bookkeeping
 * (see the drive helper) so the numeric contracts — climb/decay rates, mood
 * crossings, bear timing, coupled rules — are pinned in isolation, frame by frame.
 */

const HHMM = "12:00";

interface Harness<S> {
  def: EventDef<S>;
  inst: EventInstance<S>;
  state: GameState;
  rng: () => number;
  effects: Effect[];
}

/** A live instance of `def` on a real GameState, clock running, sitting in telegraph. */
function boot<S>(def: EventDef<S>, seed = 1): Harness<S> {
  const state = createRun({ seed, daily: false, nowHHMM: () => HHMM });
  state.startedAtMs = 0; // let elapsedMs advance as we drive
  const rng = mulberry32(seed);
  const inst: EventInstance<S> = {
    defId: def.id,
    family: def.family,
    act: "act1",
    phase: "telegraph",
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data: def.init(rng, state),
  };
  return { def, inst, state, rng, effects: [] };
}

function ctx<S>(h: Harness<S>, dtMs: number): EventContext {
  return { state: h.state, rng: h.rng, dtMs, emit: (e) => h.effects.push(e) };
}

/** Mirror the engine: advance the clock, accumulate phaseElapsedMs, tick, reset on flip. */
function drive<S>(h: Harness<S>, dtMs: number): void {
  h.state.elapsedMs += dtMs;
  const prev = h.inst.phase;
  h.inst.phaseElapsedMs += dtMs;
  h.def.onTick(h.inst, ctx(h, dtMs));
  if (h.inst.phase !== prev) h.inst.phaseElapsedMs = 0;
}

function pointer<S>(h: Harness<S>, target: PointerTarget): boolean {
  return h.def.onPointer!(h.inst, ctx(h, 0), target);
}

/** Advance past telegraph and the one-tick onset, landing in peak with no extra time. */
function toPeak<S>(h: Harness<S>): void {
  drive(h, h.def.telegraphMs); // telegraph -> onset
  drive(h, 0); // onset -> peak
}

const moodTexts = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "mood" ? [e.text] : []));
const soundKeys = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "sound" ? [e.sound] : []));
const toastTexts = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "toast" ? [e.text] : []));

const cell = (id: number, ch: string, status: CellStatus = "normal"): CharCell => ({
  id,
  ch,
  status,
});

// --- Gerald ------------------------------------------------------------------

describe("Gerald", () => {
  it("emits the arrive sound and starts fed at onset", () => {
    const h = boot(geraldDef);
    drive(h, geraldDef.telegraphMs); // telegraph -> onset
    expect(h.inst.phase).toBe("onset");
    expect(soundKeys(h.effects)).toContain("inhabitant-arrive");
    expect(h.inst.data.fedAtMs).toBe(h.state.elapsedMs); // rule starts satisfied
    expect(h.inst.data.hunger).toBe(30);
  });

  it("hunger climbs exactly +1 per 1800ms, carrying fractional dt across odd ticks", () => {
    const h = boot(geraldDef);
    toPeak(h);
    h.inst.data.hunger = 30;
    h.inst.data.hungerCarryMs = 0;

    drive(h, 700);
    expect(h.inst.data.hunger).toBe(30);
    drive(h, 700);
    expect(h.inst.data.hunger).toBe(30);
    drive(h, 700); // 2100ms cumulative -> one point, 300ms carried
    expect(h.inst.data.hunger).toBe(31);
    expect(h.inst.data.hungerCarryMs).toBe(300);
    drive(h, 1500); // 300 + 1500 = 1800 -> one more point, no drift
    expect(h.inst.data.hunger).toBe(32);
    expect(h.inst.data.hungerCarryMs).toBe(0);
  });

  it("feeding drops hunger by 40, refreshes fedAtMs, recomputes murky, and clamps at 0", () => {
    const h = boot(geraldDef);
    toPeak(h);
    h.inst.data.hunger = 90;
    h.inst.data.murky = true;
    h.state.elapsedMs = 50_000;
    h.effects.length = 0;

    expect(pointer(h, { kind: "feed-button" })).toBe(true);
    expect(h.inst.data.hunger).toBe(50);
    expect(h.inst.data.fedAtMs).toBe(50_000);
    expect(h.inst.data.murky).toBe(false); // 50 < 85
    expect(soundKeys(h.effects)).toContain("gerald-feed");

    h.inst.data.hunger = 30;
    pointer(h, { kind: "feed-button" });
    expect(h.inst.data.hunger).toBe(0); // max(0, 30 - 40)
  });

  it("emits a mood only when the tier crosses — content -> hungry -> desperate -> disappointed", () => {
    const h = boot(geraldDef);
    toPeak(h);
    h.inst.data.hunger = 30;
    h.inst.data.hungerCarryMs = 0;
    h.effects.length = 0;

    drive(h, 1800 * 29); // 30 -> 59: no crossing
    expect(moodTexts(h.effects)).toEqual([]);
    drive(h, 1800); // -> 60: hungry
    expect(moodTexts(h.effects)).toEqual(["Gerald - hungry"]);

    h.effects.length = 0;
    drive(h, 1800 * 24); // 60 -> 84: no crossing
    expect(moodTexts(h.effects)).toEqual([]);
    drive(h, 1800); // -> 85: desperate, water goes murky
    expect(moodTexts(h.effects)).toEqual(["Gerald - desperate"]);
    expect(h.inst.data.murky).toBe(true);

    h.effects.length = 0;
    drive(h, 1800 * 15); // -> 100: disappointed (clamped)
    expect(moodTexts(h.effects)).toEqual(["Gerald - disappointed"]);
    expect(h.inst.data.hunger).toBe(100);
  });

  it("is alive below 100 hunger and dead at 100", () => {
    const h = boot(geraldDef);
    h.inst.data.hunger = 99;
    expect(geraldDef.isAlive!(h.inst)).toBe(true);
    h.inst.data.hunger = 100;
    expect(geraldDef.isAlive!(h.inst)).toBe(false);
  });

  it("the coupled rule passes within 60s of a feed and fails past it", () => {
    const { g, rule } = coupledFixture(geraldDef, {
      hunger: 40,
      fedAtMs: 1000,
      murky: false,
      hungerCarryMs: 0,
      mood: "hungry",
    } satisfies GeraldData);
    const api = makeRuleApi(g, () => HHMM);

    g.elapsedMs = 1000 + 60_000; // exactly on the boundary
    expect(rule.validate("pw", g, api).passed).toBe(true);
    g.elapsedMs = 1000 + 60_001;
    expect(rule.validate("pw", g, api).passed).toBe(false);
  });

  it("resolves only in the finale", () => {
    const h = boot(geraldDef);
    for (const act of ["act1", "act2", "act3"] as ActId[]) {
      h.state.act = act;
      expect(geraldDef.isResolved(h.inst, h.state)).toBe(false);
    }
    h.state.act = "finale";
    expect(geraldDef.isResolved(h.inst, h.state)).toBe(true);
  });
});

// --- Campfire ----------------------------------------------------------------

describe("the campfire", () => {
  it("emits the arrive sound and is ready to stoke at onset", () => {
    const h = boot(campfireDef);
    drive(h, campfireDef.telegraphMs);
    expect(h.inst.phase).toBe("onset");
    expect(soundKeys(h.effects)).toContain("inhabitant-arrive");
    expect(h.inst.data.stokeReadyAtMs).toBe(h.state.elapsedMs);
    expect(h.inst.data.fuel).toBe(80);
    expect(h.inst.data.burning).toBe(true);
  });

  it("fuel decays exactly -1 per 1000ms, carrying fractional dt", () => {
    const h = boot(campfireDef);
    toPeak(h);
    h.inst.data.fuel = 80;
    h.inst.data.fuelCarryMs = 0;

    drive(h, 1000);
    expect(h.inst.data.fuel).toBe(79);
    drive(h, 600);
    expect(h.inst.data.fuel).toBe(79); // 600 carried, no point yet
    drive(h, 400); // 600 + 400 = 1000 -> one point
    expect(h.inst.data.fuel).toBe(78);
  });

  it("drops to embers at zero fuel, emitting the embers mood once", () => {
    const h = boot(campfireDef);
    toPeak(h);
    h.inst.data.fuel = 2;
    h.inst.data.fuelCarryMs = 0;
    h.state.cells = []; // nothing to eat, isolate the burn-out
    h.effects.length = 0;

    drive(h, 2000); // 2 -> 0
    expect(h.inst.data.fuel).toBe(0);
    expect(h.inst.data.burning).toBe(false);
    expect(moodTexts(h.effects)).toEqual(["The campfire - embers"]);

    h.effects.length = 0;
    drive(h, 2000); // already embers: no repeat mood
    expect(moodTexts(h.effects)).toEqual([]);
  });

  it("while burning low it scars the leftmost value cell every 6s, one toast per bite", () => {
    const h = boot(campfireDef);
    toPeak(h);
    h.state.cells = [cell(1, "a"), cell(2, "b"), cell(3, "c")];
    h.inst.data.fuel = 24; // below the eat threshold
    h.inst.data.burning = true;
    h.inst.data.eatCarryMs = 0;
    h.inst.data.fuelCarryMs = 0;
    h.effects.length = 0;

    drive(h, 6000); // first bite -> leftmost cell
    expect(h.state.cells.find((c) => c.id === 1)!.status).toBe("ember");
    expect(h.state.cells.find((c) => c.id === 2)!.status).toBe("normal");
    expect(toastTexts(h.effects)).toEqual(["The campfire is eating your password."]);

    drive(h, 6000); // second bite -> next leftmost non-ember
    expect(h.state.cells.find((c) => c.id === 2)!.status).toBe("ember");
  });

  it("skips value-excluded cells when choosing what to eat", () => {
    const h = boot(campfireDef);
    toPeak(h);
    h.state.cells = [cell(1, "a", "parasite"), cell(2, "b"), cell(3, "c")];
    h.inst.data.fuel = 24;
    h.inst.data.eatCarryMs = 0;
    h.inst.data.fuelCarryMs = 0;

    drive(h, 6000);
    expect(h.state.cells.find((c) => c.id === 1)!.status).toBe("parasite"); // untouched
    expect(h.state.cells.find((c) => c.id === 2)!.status).toBe("ember");
  });

  it("stoking adds 18 fuel but is refused inside the 1500ms cooldown", () => {
    const h = boot(campfireDef);
    toPeak(h);
    h.state.elapsedMs = 20_000;
    h.inst.data.fuel = 50;
    h.inst.data.stokeReadyAtMs = 20_000; // ready

    expect(pointer(h, { kind: "stoke-button" })).toBe(true);
    expect(h.inst.data.fuel).toBe(68);
    expect(h.inst.data.stokeReadyAtMs).toBe(21_500);

    pointer(h, { kind: "stoke-button" }); // still 20_000, on cooldown
    expect(h.inst.data.fuel).toBe(68);

    h.state.elapsedMs = 21_500; // cooldown elapsed
    pointer(h, { kind: "stoke-button" });
    expect(h.inst.data.fuel).toBe(86);
  });

  it("bumps the hop counter on every 4th successful stoke", () => {
    const h = boot(campfireDef);
    toPeak(h);
    h.state.elapsedMs = 0;
    h.inst.data.fuel = 0;
    for (let i = 0; i < 4; i++) {
      h.inst.data.stokeReadyAtMs = h.state.elapsedMs;
      pointer(h, { kind: "stoke-button" });
      h.state.elapsedMs += 1500;
    }
    expect(h.inst.data.stokeCount).toBe(4);
    expect(h.inst.data.buttonHops).toBe(1);
  });

  it("re-lights from embers once a stoke lifts fuel to at least 15", () => {
    const h = boot(campfireDef);
    toPeak(h);
    h.inst.data.burning = false;
    h.inst.data.fuel = 0;
    h.inst.data.mood = "embers";
    h.state.elapsedMs = 5_000;
    h.inst.data.stokeReadyAtMs = 5_000;
    h.effects.length = 0;

    pointer(h, { kind: "stoke-button" }); // 0 -> 18 >= 15
    expect(h.inst.data.burning).toBe(true);
    expect(moodTexts(h.effects)).toEqual(["The campfire - crackling"]);
  });

  it("is alive only while burning", () => {
    const h = boot(campfireDef);
    h.inst.data.burning = true;
    expect(campfireDef.isAlive!(h.inst)).toBe(true);
    h.inst.data.burning = false;
    expect(campfireDef.isAlive!(h.inst)).toBe(false);
  });

  it("the coupled rule passes while burning and fails at embers", () => {
    const { g, rule } = coupledFixture(campfireDef, {
      fuel: 80,
      burning: true,
      stokeReadyAtMs: 0,
      buttonHops: 0,
      eatCarryMs: 0,
      fuelCarryMs: 0,
      stokeCount: 0,
      mood: "crackling",
    } satisfies CampfireData);
    const api = makeRuleApi(g, () => HHMM);

    expect(rule.validate("pw", g, api).passed).toBe(true);
    (g.events[0]!.data as CampfireData).burning = false;
    expect(rule.validate("pw", g, api).passed).toBe(false);
  });

  it("resolves only in the finale", () => {
    const h = boot(campfireDef);
    h.state.act = "act3";
    expect(campfireDef.isResolved(h.inst, h.state)).toBe(false);
    h.state.act = "finale";
    expect(campfireDef.isResolved(h.inst, h.state)).toBe(true);
  });
});

// --- Garden ------------------------------------------------------------------

describe("the garden and the bear", () => {
  it("emits the arrive sound and arms the first raid 45s out at onset", () => {
    const h = boot(gardenDef);
    drive(h, gardenDef.telegraphMs);
    expect(h.inst.phase).toBe("onset");
    expect(soundKeys(h.effects)).toContain("inhabitant-arrive");
    expect(h.inst.data.nextBearAtMs).toBe(h.state.elapsedMs + 45_000);
  });

  it("blooms one flower per 20s up to three, carrying fractional dt", () => {
    const h = boot(gardenDef);
    toPeak(h);
    h.inst.data.bloomed = 0;
    h.inst.data.bloomCarryMs = 0;

    drive(h, 10_000);
    expect(h.inst.data.bloomed).toBe(0);
    drive(h, 10_000); // 20_000 -> one bloom
    expect(h.inst.data.bloomed).toBe(1);
    drive(h, 20_000);
    drive(h, 20_000);
    expect(h.inst.data.bloomed).toBe(3);
    drive(h, 20_000); // capped
    expect(h.inst.data.bloomed).toBe(3);
  });

  it("honey accrues +2/s only at two or more blooms and caps at 100", () => {
    const h = boot(gardenDef);
    toPeak(h);
    h.inst.data.bloomed = 1;
    h.inst.data.honey = 0;
    h.inst.data.honeyCarryMs = 0;
    h.inst.data.bloomCarryMs = 0;

    drive(h, 5000); // one bloom short: no honey
    expect(h.inst.data.honey).toBe(0);

    h.inst.data.bloomed = 2;
    drive(h, 1000);
    expect(h.inst.data.honey).toBe(2);
    drive(h, 1000);
    expect(h.inst.data.honey).toBe(4);

    h.inst.data.honey = 98;
    drive(h, 1000);
    expect(h.inst.data.honey).toBe(100);
    drive(h, 1000); // capped
    expect(h.inst.data.honey).toBe(100);
  });

  it("telegraphs then raids on the authored timeline; an undistracted raid tramples", () => {
    const h = boot(gardenDef);
    toPeak(h);
    h.inst.data.nextBearAtMs = h.state.elapsedMs + 1000;
    h.effects.length = 0;

    drive(h, 1000); // -> telegraphed
    expect(h.inst.data.bearState).toBe("telegraphed");
    expect(moodTexts(h.effects)).toContain("A bear approaches the hive");
    expect(soundKeys(h.effects)).toContain("telegraph-doom");
    expect(h.inst.data.nextBearAtMs).toBe(h.state.elapsedMs + 8000); // raid-start

    drive(h, 8000); // -> raiding
    expect(h.inst.data.bearState).toBe("raiding");
    expect(h.inst.data.raidEndsAtMs).toBe(h.state.elapsedMs + 6000);

    h.inst.data.honey = 50;
    h.inst.data.bloomed = 3;
    h.effects.length = 0;
    drive(h, 6000); // raid completes undistracted -> trample
    expect(h.inst.data.honey).toBe(0);
    expect(h.inst.data.bloomed).toBe(1); // max(0, 3 - 2)
    expect(moodTexts(h.effects)).toContain("The bear trampled the garden");
    expect(h.inst.data.bearState).toBe("away");
    const interval = h.inst.data.nextBearAtMs - h.state.elapsedMs;
    expect(interval).toBeGreaterThanOrEqual(45_000);
    expect(interval).toBeLessThanOrEqual(70_000);
  });

  it("the basket sends the bear off during the telegraph", () => {
    const h = boot(gardenDef);
    toPeak(h);
    h.inst.data.nextBearAtMs = h.state.elapsedMs + 1000;
    drive(h, 1000); // telegraphed
    h.effects.length = 0;

    expect(pointer(h, { kind: "basket-button" })).toBe(true);
    expect(h.inst.data.bearState).toBe("away");
    expect(h.inst.data.distractions).toBe(1);
    expect(soundKeys(h.effects)).toContain("paper-shred");
    expect(moodTexts(h.effects)).toContain("The bear takes the basket and leaves");
    const interval = h.inst.data.nextBearAtMs - h.state.elapsedMs;
    expect(interval).toBeGreaterThanOrEqual(45_000);
    expect(interval).toBeLessThanOrEqual(70_000);
  });

  it("the basket sends the bear off mid-raid too", () => {
    const h = boot(gardenDef);
    toPeak(h);
    h.inst.data.nextBearAtMs = h.state.elapsedMs + 1000;
    drive(h, 1000); // telegraphed
    drive(h, 8000); // raiding
    expect(h.inst.data.bearState).toBe("raiding");

    h.inst.data.honey = 60;
    expect(pointer(h, { kind: "basket-button" })).toBe(true);
    expect(h.inst.data.bearState).toBe("away");
    expect(h.inst.data.honey).toBe(60); // saved: no trample
    expect(h.inst.data.distractions).toBe(1);
  });

  it("seeds successive raid intervals inside the 45-70s band", () => {
    const h = boot(gardenDef);
    toPeak(h);
    for (let i = 0; i < 20; i++) {
      h.inst.data.nextBearAtMs = h.state.elapsedMs + 500;
      drive(h, 500); // telegraphed
      pointer(h, { kind: "basket-button" }); // distract -> schedules next
      const interval = h.inst.data.nextBearAtMs - h.state.elapsedMs;
      expect(interval).toBeGreaterThanOrEqual(45_000);
      expect(interval).toBeLessThanOrEqual(70_000);
    }
  });

  it("is alive at 40 honey but not at 39", () => {
    const h = boot(gardenDef);
    h.inst.data.honey = 39;
    expect(gardenDef.isAlive!(h.inst)).toBe(false);
    h.inst.data.honey = 40;
    expect(gardenDef.isAlive!(h.inst)).toBe(true);
  });

  it("the coupled rule passes at 40 honey and fails below", () => {
    const { g, rule } = coupledFixture(gardenDef, {
      bloomed: 2,
      honey: 40,
      bearState: "away",
      nextBearAtMs: 0,
      raidEndsAtMs: 0,
      distractions: 0,
      bloomCarryMs: 0,
      honeyCarryMs: 0,
    } satisfies GardenData);
    const api = makeRuleApi(g, () => HHMM);

    expect(rule.validate("pw", g, api).passed).toBe(true);
    (g.events[0]!.data as GardenData).honey = 39;
    expect(rule.validate("pw", g, api).passed).toBe(false);
  });

  it("resolves only in the finale", () => {
    const h = boot(gardenDef);
    h.state.act = "act3";
    expect(gardenDef.isResolved(h.inst, h.state)).toBe(false);
    h.state.act = "finale";
    expect(gardenDef.isResolved(h.inst, h.state)).toBe(true);
  });
});

// --- Coupled-rule null-instance freebie --------------------------------------

describe("coupled inhabitant rules pass when their event is absent", () => {
  // A run whose events were cleared: getEventData returns null, so each coupled
  // rule must fall through to passed:true rather than reading a missing instance.
  const freebie = (def: EventDef<unknown>): boolean => {
    const g = createRun({ seed: 1, daily: false, nowHHMM: () => HHMM });
    g.events = [];
    const rule = def.coupledRule!.create(mulberry32(1));
    return rule.validate(
      "pw",
      g,
      makeRuleApi(g, () => HHMM),
    ).passed;
  };

  it("gerald-fed is a freebie with no gerald", () => {
    expect(freebie(geraldDef as EventDef<unknown>)).toBe(true);
  });
  it("campfire-burning is a freebie with no campfire", () => {
    expect(freebie(campfireDef as EventDef<unknown>)).toBe(true);
  });
  it("garden-honey is a freebie with no garden", () => {
    expect(freebie(gardenDef as EventDef<unknown>)).toBe(true);
  });
});

// --- E2E: a real bite bumps the version (carried Task 2 fix) ------------------

describe("campfire cell mutation (E2E through the real engine)", () => {
  it("a bite scars a cell, bumps g.version, and keeps the caret in range", () => {
    const g = createRun({ seed: 42, daily: false, nowHHMM: () => HHMM }); // seed 42 places the campfire in act1
    const api = makeRuleApi(g, () => HHMM);

    // Drive the real run until the campfire is live (past telegraph, in peak),
    // solving the roster each frame so the acts advance normally.
    let campfire: EventInstance | undefined;
    for (let i = 0; i < 4000; i++) {
      const target = solveAll(g, api);
      if (target !== cellsToPassword(g.cells)) {
        applyKey(g, "End");
        while (g.cells.length > 0) applyKey(g, "Backspace");
        for (const k of target) applyKey(g, k);
      }
      tick(g, 100);
      campfire = g.events.find((e) => e.defId === "campfire");
      if (campfire?.phase === "peak") break;
    }
    expect(campfire?.phase).toBe("peak");

    // Arrange a low-fuel, about-to-bite state (arranging engine state is fine).
    const d = campfire!.data as CampfireData;
    d.fuel = 5;
    d.burning = true;
    d.eatCarryMs = 5999;
    if (g.cells.length === 0) applyKey(g, "x"); // guarantee a value cell to eat

    const versionBefore = g.version;
    tick(g, 100); // pushes eatCarryMs past 6000 -> one bite via setCellStatus

    expect(g.version).toBeGreaterThan(versionBefore);
    expect(g.cells.some((c) => c.status === "ember")).toBe(true);
    expect(g.caret).toBeLessThanOrEqual(g.cells.length);
  });
});

// --- shared fixtures ---------------------------------------------------------

/** A GameState carrying a single inited instance of `def`, plus its coupled rule. */
function coupledFixture<S>(def: EventDef<S>, data: S) {
  const g = createRun({ seed: 1, daily: false, nowHHMM: () => HHMM });
  const inst: EventInstance<S> = {
    defId: def.id,
    family: def.family,
    act: "act3",
    phase: "peak",
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data,
  };
  g.events = [inst as EventInstance];
  const rule = def.coupledRule!.create(mulberry32(1));
  return { g, inst, rule };
}
