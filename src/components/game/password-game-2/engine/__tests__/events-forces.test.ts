import { describe, expect, it } from "vitest";
import { createRun, makeRuleApi } from "../engine";
import { cellsToPassword, setCellStatus } from "../cells";
import { mulberry32, subSeed } from "../rng";
import { CORE_RULES } from "../rules/index";
import { infectionDef, type InfectionData } from "../events/infection";
import { blackHoleDef, type BlackHoleData } from "../events/black-hole";
import { parasiteDef, type ParasiteData } from "../events/parasite";
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
 * Unit tests for the three forces. Each def is driven directly through a hand-built
 * EventContext that mirrors the engine's phaseElapsedMs bookkeeping (see drive), so
 * every numeric contract — spread cadence and the space wall, mutation timing, the
 * cure cascade, pull cadence and nearest-cell selection, heavy-word collapse and its
 * grace, the six-capture auto-collapse, mimic value-exclusion and eviction — is
 * pinned in isolation, frame by frame.
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
  state.startedAtMs = 0;
  const rng = mulberry32(seed);
  const inst: EventInstance<S> = {
    defId: def.id,
    family: def.family,
    act: "act2",
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

/** Replace the box with a fresh run of normal cells, ids 1..n. */
function plant<S>(h: Harness<S>, text: string): void {
  h.state.cells = [...text].map((ch, i) => ({ id: i + 1, ch, status: "normal" }) as CharCell);
  h.state.nextCellId = [...text].length + 1;
}

/** Append normal cells at the end (as if the player typed them). */
function append<S>(h: Harness<S>, text: string): void {
  for (const ch of text) {
    h.state.cells = [...h.state.cells, { id: h.state.nextCellId++, ch, status: "normal" }];
  }
}

const statusOf = <S>(h: Harness<S>, id: number): string =>
  h.state.cells.find((c) => c.id === id)!.status;

const soundKeys = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "sound" ? [e.sound] : []));
const toastTexts = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "toast" ? [e.text] : []));

// --- Infection ---------------------------------------------------------------

describe("the infection", () => {
  it("onsets by making one random non-space cell ill, sounding the alarm and warning", () => {
    const h = boot(infectionDef);
    plant(h, "a b c"); // a1 sp2 b3 sp4 c5
    drive(h, infectionDef.telegraphMs); // telegraph -> onset
    expect(h.inst.phase).toBe("onset");
    const sick = h.state.cells.filter((c) => c.status === "infected");
    expect(sick).toHaveLength(1);
    expect(sick[0]!.ch).not.toBe(" "); // spaces are never infected
    expect(soundKeys(h.effects)).toContain("force-onset");
    expect(toastTexts(h.effects)).toContain("One of your characters looks unwell.");
  });

  it("spreads every 7s to an adjacent normal cell but never crosses a space wall", () => {
    const h = boot<InfectionData>(infectionDef);
    toPeak(h); // onset ran on the empty box (nothing to infect) but armed the clock
    plant(h, "ab cd"); // a1 b2 sp3 c4 d5
    h.state.cells = setCellStatus(h.state.cells, 2, "infected", "infection");
    h.inst.data.infectedIds = [2];
    h.inst.data.infectedSinceMs = { 2: h.state.elapsedMs };
    h.inst.data.nextSpreadAtMs = h.state.elapsedMs + 7000;

    drive(h, 6000); // not yet
    expect(statusOf(h, 1)).toBe("normal");
    drive(h, 1000); // 7000 -> one pulse: b infects its left neighbour a
    expect(statusOf(h, 1)).toBe("infected");
    expect(statusOf(h, 3)).toBe("normal"); // the space is a wall

    drive(h, 7000); // another pulse: nothing crosses the space
    expect(statusOf(h, 3)).toBe("normal");
    expect(statusOf(h, 4)).toBe("normal"); // c stays healthy
    expect(statusOf(h, 5)).toBe("normal"); // d stays healthy
  });

  it("mutates a cell that has been sick for 45s; a mutated cell still counts as infected", () => {
    const h = boot(infectionDef);
    toPeak(h);
    plant(h, "1234"); // digits: the value can never contain a lowercase antidote
    h.state.cells = setCellStatus(h.state.cells, 1, "infected", "infection");
    h.inst.data.infectedIds = [1];
    h.inst.data.infectedSinceMs = { 1: h.state.elapsedMs };
    h.inst.data.nextSpreadAtMs = h.state.elapsedMs + 10_000_000; // suppress spread

    drive(h, 44_000);
    expect(statusOf(h, 1)).toBe("infected");
    drive(h, 1000); // 45_000 sick -> mutated
    expect(statusOf(h, 1)).toBe("mutated");

    // The coupled rule counts a mutated cell as still-infected.
    const rule = infectionDef.coupledRule!.create(mulberry32(1));
    const res = rule.validate(
      cellsToPassword(h.state.cells),
      h.state,
      makeRuleApi(h.state, () => HHMM),
    );
    expect(res.passed).toBe(false);
    expect(res.message).toBe("1 infected");
  });

  it("cures every sick cell when the antidote reaches the value, tallies it, and resolves", () => {
    const h = boot(infectionDef);
    toPeak(h);
    const antidote = h.inst.data.antidote;
    plant(h, "xy" + antidote); // x1 y2 then the antidote letters
    h.state.cells = setCellStatus(h.state.cells, 1, "infected", "infection");
    h.state.cells = setCellStatus(h.state.cells, 2, "mutated", "infection");
    h.inst.data.infectedIds = [1, 2];
    h.inst.data.infectedSinceMs = { 1: 0, 2: 0 };
    h.inst.data.nextSpreadAtMs = h.state.elapsedMs + 10_000_000;
    h.state.stats.infectionsCured = 0;
    h.effects.length = 0;

    drive(h, 100); // the antidote is present -> cure cascade
    expect(statusOf(h, 1)).toBe("normal");
    expect(statusOf(h, 2)).toBe("normal");
    expect(h.inst.data.cured).toBe(true);
    expect(h.inst.phase).toBe("done");
    expect(h.state.stats.infectionsCured).toBe(2);
    expect(toastTexts(h.effects)).toContain("Outbreak contained.");
    expect(infectionDef.isResolved(h.inst, h.state)).toBe(true);
  });

  it("derives its antidote from the same stream the coupled rule publishes", () => {
    const seed = 9;
    const h = boot(infectionDef, seed);
    expect(h.inst.data.antidote).toHaveLength(4);
    expect(new Set(h.inst.data.antidote).size).toBe(4); // distinct
    expect(/^[a-z]{4}$/.test(h.inst.data.antidote)).toBe(true);
    // The engine reveals the coupled rule off subSeed(seed, "rule-no-infected"); the
    // event derives its antidote from that same stream, so card and cure always agree.
    const rule = infectionDef.coupledRule!.create(mulberry32(subSeed(seed, "rule-no-infected")));
    expect(rule.payload!["antidote"]).toBe(h.inst.data.antidote);
  });

  it("the coupled rule is a freebie when no infection instance is live", () => {
    const g = createRun({ seed: 1, daily: false, nowHHMM: () => HHMM });
    g.events = [];
    const rule = infectionDef.coupledRule!.create(mulberry32(1));
    expect(
      rule.validate(
        "pw",
        g,
        makeRuleApi(g, () => HHMM),
      ).passed,
    ).toBe(true);
  });
});

// --- Black hole --------------------------------------------------------------

describe("the black hole", () => {
  it("seeds an in-bounds anchor and a heavy word from the set", () => {
    const state = createRun({ seed: 5, daily: false, nowHHMM: () => HHMM });
    state.cells = [..."abcdef"].map((ch, i) => ({ id: i + 1, ch, status: "normal" }) as CharCell);
    const data = blackHoleDef.init(mulberry32(5), state);
    expect(data.anchorIndex).toBeGreaterThanOrEqual(0);
    expect(data.anchorIndex).toBeLessThan(state.cells.length);
    expect(["lead", "anvil", "neutron", "brick"]).toContain(data.heavyWord);
  });

  it("onset arms the first pull 5s out and sounds the alarm", () => {
    const h = boot(blackHoleDef);
    plant(h, "abc");
    drive(h, blackHoleDef.telegraphMs);
    expect(h.inst.phase).toBe("onset");
    expect(soundKeys(h.effects)).toContain("force-onset");
    expect(h.inst.data.nextPullAtMs).toBe(h.state.elapsedMs + 5000);
  });

  it("pulls the nearest normal cell every 5s, the lower index winning an equidistant tie", () => {
    const h = boot<BlackHoleData>(blackHoleDef);
    toPeak(h);
    plant(h, "abcde"); // idx 0..4
    h.inst.data.anchorIndex = 2; // 'c'
    h.inst.data.capturedIds = [];
    h.inst.data.nextPullAtMs = h.state.elapsedMs + 5000;
    h.state.stats.lettersAbducted = 0;

    drive(h, 4000);
    expect(h.inst.data.capturedIds).toHaveLength(0);
    drive(h, 1000); // 5000 -> nearest is c (distance 0)
    expect(statusOf(h, 3)).toBe("orbiting");
    expect(h.state.stats.lettersAbducted).toBe(1);

    drive(h, 5000); // b (idx1) and d (idx3) tie at distance 1 -> lower index b wins
    expect(statusOf(h, 2)).toBe("orbiting");
    expect(statusOf(h, 4)).toBe("normal");

    drive(h, 5000); // now d (distance 1) beats a (distance 2)
    expect(statusOf(h, 4)).toBe("orbiting");
  });

  it("collapses 2s after the heavy word appears anywhere, restoring cells in place", () => {
    const h = boot(blackHoleDef);
    toPeak(h);
    plant(h, "abcdef");
    h.inst.data.anchorIndex = 0;
    h.inst.data.capturedIds = [];
    h.inst.data.nextPullAtMs = h.state.elapsedMs + 5000;
    h.state.stats.lettersRescued = 0;

    drive(h, 5000); // capture a (id1)
    drive(h, 5000); // capture b (id2)
    expect(h.inst.data.capturedIds).toEqual([1, 2]);

    append(h, h.inst.data.heavyWord); // type the heavy word into the value
    h.effects.length = 0;
    drive(h, 100); // detected -> collapse begins, but the grace has not elapsed
    expect(h.inst.data.collapsingSinceMs).not.toBeNull();
    expect(h.inst.phase).toBe("peak");
    expect(statusOf(h, 1)).toBe("orbiting");

    drive(h, 1999); // still inside the 2000ms grace
    expect(h.inst.phase).toBe("peak");
    drive(h, 1); // grace elapsed -> collapse
    expect(h.inst.phase).toBe("done");
    expect(statusOf(h, 1)).toBe("normal");
    expect(statusOf(h, 2)).toBe("normal");
    expect(h.state.stats.lettersRescued).toBe(2);
    expect(toastTexts(h.effects)).toContain("The singularity collapses. Letters rain back.");

    // Restoration is in place: a stayed ahead of b, order untouched.
    const idxA = h.state.cells.findIndex((c) => c.id === 1);
    const idxB = h.state.cells.findIndex((c) => c.id === 2);
    expect(idxA).toBeLessThan(idxB);
    expect(blackHoleDef.isResolved(h.inst, h.state)).toBe(true);
  });

  it("auto-collapses on the same grace once six cells are captured", () => {
    const h = boot(blackHoleDef);
    toPeak(h);
    plant(h, "abcdefghij"); // ten cells
    h.inst.data.anchorIndex = 0;
    h.inst.data.capturedIds = [];
    h.inst.data.nextPullAtMs = h.state.elapsedMs + 5000;
    h.state.stats.lettersRescued = 0;

    for (let i = 0; i < 6; i++) drive(h, 5000);
    expect(h.inst.data.capturedIds).toHaveLength(6);
    expect(h.inst.data.collapsingSinceMs).not.toBeNull();
    expect(h.inst.phase).toBe("peak"); // grace not yet elapsed

    drive(h, 2000); // grace -> collapse restores all six
    expect(h.inst.phase).toBe("done");
    expect(h.state.stats.lettersRescued).toBe(6);
    expect(h.state.cells.every((c) => c.status === "normal")).toBe(true);
  });
});

// --- Parasite ----------------------------------------------------------------

const parasiteCount = (h: Harness<ParasiteData>): number =>
  h.state.cells.filter((c) => c.status === "parasite").length;

describe("the parasite", () => {
  it("onsets silently with a mimic that clones its neighbour and is excluded from the value", () => {
    const h = boot(parasiteDef);
    plant(h, "hello");
    h.effects.length = 0;
    drive(h, parasiteDef.telegraphMs); // telegraph -> onset
    expect(h.inst.phase).toBe("onset");
    expect(h.effects).toEqual([]); // onset is silent — dramatic irony

    const mimic = h.state.cells.find((c) => c.status === "parasite")!;
    expect([..."hello"]).toContain(mimic.ch); // glyph cloned from a neighbour
    expect(h.state.cells).toHaveLength(6);
    expect([...cellsToPassword(h.state.cells)]).toHaveLength(5); // value reads one short
  });

  it("clones 'x' into an empty box", () => {
    const h = boot(parasiteDef);
    h.state.cells = [];
    h.state.nextCellId = 1;
    drive(h, parasiteDef.telegraphMs);
    expect(h.state.cells.find((c) => c.status === "parasite")!.ch).toBe("x");
  });

  it("makes a twelve-glyph box fail min-length-12 while the mimic sits in it", () => {
    const h = boot(parasiteDef);
    plant(h, "abcdefghijk"); // eleven real characters
    drive(h, parasiteDef.telegraphMs); // + one mimic = twelve visible glyphs
    expect(h.state.cells).toHaveLength(12);

    const value = cellsToPassword(h.state.cells);
    expect([...value]).toHaveLength(11); // the mimic is not counted
    const rule = CORE_RULES.find((d) => d.id === "min-length-12")!.create(mulberry32(1));
    expect(
      rule.validate(
        value,
        h.state,
        makeRuleApi(h.state, () => HHMM),
      ).passed,
    ).toBe(false);
  });

  it("emits the wiggle cue once every 6s in peak", () => {
    const h = boot(parasiteDef);
    plant(h, "hello");
    toPeak(h);
    h.effects.length = 0;

    for (let i = 0; i < 59; i++) drive(h, 100); // 5900ms
    expect(soundKeys(h.effects).filter((s) => s === "parasite-wiggle")).toHaveLength(0);
    drive(h, 100); // 6000ms -> first wiggle
    expect(soundKeys(h.effects).filter((s) => s === "parasite-wiggle")).toHaveLength(1);
    for (let i = 0; i < 60; i++) drive(h, 100); // 12000ms -> second wiggle
    expect(soundKeys(h.effects).filter((s) => s === "parasite-wiggle")).toHaveLength(2);
  });

  it("clicking the mimic evicts it and resolves the force", () => {
    const h = boot(parasiteDef);
    plant(h, "hello");
    toPeak(h);
    const mimic = h.state.cells.find((c) => c.status === "parasite")!;

    expect(pointer(h, { kind: "parasite", id: mimic.id })).toBe(true);
    expect(h.state.cells.some((c) => c.status === "parasite")).toBe(false);
    expect(h.inst.phase).toBe("done");
    expect(parasiteDef.isResolved(h.inst, h.state)).toBe(true);
  });

  it("ignores a pointer whose id is not one of its mimics", () => {
    const h = boot(parasiteDef);
    plant(h, "hello");
    toPeak(h);
    expect(pointer(h, { kind: "parasite", id: 999 })).toBe(false);
    expect(parasiteCount(h)).toBe(1); // still there
  });

  it("spawns a second mimic after 90s untended, and never a third", () => {
    const h = boot(parasiteDef);
    plant(h, "hello");
    toPeak(h);
    expect(parasiteCount(h)).toBe(1);

    drive(h, 89_000);
    expect(parasiteCount(h)).toBe(1);
    drive(h, 1000); // 90_000 in peak -> the second mimic
    expect(parasiteCount(h)).toBe(2);
    expect(h.inst.data.spawnedSecondAtMs).not.toBeNull();

    drive(h, 120_000); // long after -> capped at two
    expect(parasiteCount(h)).toBe(2);
  });

  it("resolves if its mimic is removed by anything but its own click", () => {
    const h = boot(parasiteDef);
    plant(h, "hello");
    toPeak(h);
    // Simulate the box being retyped out from under it (mimic cell gone).
    h.state.cells = h.state.cells.filter((c) => c.status !== "parasite");
    drive(h, 100);
    expect(h.inst.phase).toBe("done");
    expect(parasiteDef.isResolved(h.inst, h.state)).toBe(true);
  });
});
