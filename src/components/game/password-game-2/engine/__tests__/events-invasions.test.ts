import { describe, expect, it } from "vitest";
import { createRun, makeRuleApi } from "../engine";
import { cellsToPassword } from "../cells";
import { mulberry32 } from "../rng";
import { CORE_RULES } from "../rules/index";
import { galagaDef, type Alien, type GalagaData } from "../events/galaga";
import { snakeDef, type SnakeData } from "../events/snake";
import { tetrisDef, type TetrisData } from "../events/tetris";
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
 * Unit tests for the three invasions, driven directly through a hand-built
 * EventContext that mirrors the engine's phaseElapsedMs bookkeeping (see drive), so
 * every numeric contract is pinned frame by frame: Galaga's dive cadence, grab timing
 * and nearest/tie selection, key-shot case-insensitivity and lowest-id disambiguation,
 * pointer-downs of non-carrying aliens, wave sizes, timeout/flee and the coupled-rule
 * truth table; the snake's end-of-box pellet feed vs mid-password insertion, its last-
 * cell bite and both exit conditions; Tetris's drop cadence, landing insertion and
 * caret adjust, value inclusion, and shatter rules.
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
  state.act = "act3";
  const rng = mulberry32(seed);
  const inst: EventInstance<S> = {
    defId: def.id,
    family: def.family,
    act: "act3",
    phase: "telegraph",
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data: def.init(rng, state),
  };
  state.events = [inst as EventInstance];
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

function key<S>(h: Harness<S>, k: string): boolean {
  return h.def.onKey!(h.inst, ctx(h, 0), k);
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

const statusOf = <S>(h: Harness<S>, id: number): string =>
  h.state.cells.find((c) => c.id === id)!.status;

const soundKeys = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "sound" ? [e.sound] : []));
const toastTexts = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "toast" ? [e.text] : []));

const gData = (h: Harness<GalagaData>): GalagaData => h.inst.data;
const alien = (h: Harness<GalagaData>, id: number): Alien =>
  gData(h).aliens.find((a) => a.id === id)!;

// --- Galaga ------------------------------------------------------------------

describe("galaga", () => {
  it("telegraphs with doom, then onsets wave one of twelve with the alarm and toast", () => {
    const h = boot(galagaDef);
    plant(h, "abcdef");
    drive(h, 100); // first telegraph tick
    expect(soundKeys(h.effects)).toContain("telegraph-doom");
    expect(h.inst.phase).toBe("telegraph");

    h.effects.length = 0;
    drive(h, galagaDef.telegraphMs); // telegraph -> onset
    expect(h.inst.phase).toBe("onset");
    expect(gData(h).wave).toBe(1);
    expect(gData(h).aliens).toHaveLength(12);
    expect(gData(h).aliens.every((a) => a.state === "formation")).toBe(true);
    expect(soundKeys(h.effects)).toContain("invasion-onset");
    expect(toastTexts(h.effects)).toContain("The fleet has arrived.");
  });

  it("launches the lowest-index formation alien every 4s and grabs 2s into a dive", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    plant(h, "abcde"); // centre index 2 -> 'c' (id 3)
    h.state.stats.lettersAbducted = 0;

    drive(h, 3900); // not yet the first dive (armed 4000ms out)
    expect(gData(h).aliens.every((a) => a.state === "formation")).toBe(true);
    drive(h, 100); // 4000 -> alien 0 (lowest formationIndex) dives
    const diver = gData(h).aliens.find((a) => a.state === "diving")!;
    expect(diver.formationIndex).toBe(0);
    expect(diver.diveStartedAtMs).not.toBeNull();

    drive(h, 1900); // still short of the 2000ms grab delay
    expect(alien(h, diver.id).state).toBe("diving");
    drive(h, 100); // 2000ms in the dive -> grabs the centre letter 'c'
    expect(alien(h, diver.id).state).toBe("carrying");
    expect(alien(h, diver.id).carriedCellId).toBe(3);
    expect(statusOf(h, 3)).toBe("abducted");
    expect(h.state.stats.lettersAbducted).toBe(1);
  });

  it("grabs the nearest cell to centre, the lower index winning an equidistant tie", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    plant(h, "abcd"); // four cells, centre index 2
    // Pre-abduct the centre cell so the next grab faces a genuine tie (idx1 vs idx3).
    h.state.cells[2] = { ...h.state.cells[2]!, status: "abducted", eventTag: "galaga" };

    drive(h, 4000); // alien 0 dives
    drive(h, 2000); // grabs: idx1 ('b', id2) and idx3 ('d', id4) tie -> lower index wins
    const diver = gData(h).aliens.find((a) => a.state === "carrying")!;
    expect(diver.carriedCellId).toBe(2);
    expect(statusOf(h, 4)).toBe("normal");
  });

  it("returns to formation when there is no normal cell to grab", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    plant(h, "12"); // both cells will be abducted before the grab lands
    h.state.cells = h.state.cells.map((c) => ({ ...c, status: "abducted", eventTag: "galaga" }));

    drive(h, 4000); // alien 0 dives
    drive(h, 2000); // grab attempt finds nothing normal -> back to formation
    const diver = gData(h).aliens.find((a) => a.formationIndex === 0)!;
    expect(diver.state).toBe("formation");
    expect(diver.diveStartedAtMs).toBeNull();
  });

  it("shoots the carried letter case-insensitively, downing the LOWEST-id carrier", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    plant(h, "aa"); // two 'a' cells (ids 1,2)
    h.state.stats.lettersRescued = 0;
    h.state.stats.aliensDowned = 0;
    // Two aliens each carrying an 'a'; higher id carries the lower cell id, to prove
    // disambiguation goes by ALIEN id, not cell id.
    gData(h).aliens = [
      { id: 1000, formationIndex: 0, state: "carrying", carriedCellId: 2, diveStartedAtMs: null },
      { id: 1001, formationIndex: 1, state: "carrying", carriedCellId: 1, diveStartedAtMs: null },
    ];
    h.state.cells = h.state.cells.map((c) => ({ ...c, status: "abducted", eventTag: "galaga" }));

    expect(key(h, "A")).toBe(true); // uppercase A matches 'a' case-insensitively
    expect(alien(h, 1000).state).toBe("down"); // lowest alien id downed
    expect(alien(h, 1001).state).toBe("carrying");
    expect(statusOf(h, 2)).toBe("normal"); // its cell rained back
    expect(h.state.stats.lettersRescued).toBe(1);
    expect(h.state.stats.aliensDowned).toBe(1);
  });

  it("does not consume a key that matches no carried letter", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    plant(h, "x");
    gData(h).aliens = [
      { id: 1000, formationIndex: 0, state: "carrying", carriedCellId: 1, diveStartedAtMs: null },
    ];
    h.state.cells = [{ id: 1, ch: "x", status: "abducted", eventTag: "galaga" }];
    expect(key(h, "z")).toBe(false); // 'z' matches nothing -> falls through to typing
    expect(alien(h, 1000).state).toBe("carrying");
  });

  it("clicks down a formation or diving alien but never a carrier", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    h.state.stats.aliensDowned = 0;
    gData(h).aliens = [
      {
        id: 1000,
        formationIndex: 0,
        state: "formation",
        carriedCellId: null,
        diveStartedAtMs: null,
      },
      { id: 1001, formationIndex: 1, state: "diving", carriedCellId: null, diveStartedAtMs: 5 },
      { id: 1002, formationIndex: 2, state: "carrying", carriedCellId: 1, diveStartedAtMs: null },
    ];
    expect(pointer(h, { kind: "alien", id: 1000 })).toBe(true);
    expect(alien(h, 1000).state).toBe("down");
    expect(pointer(h, { kind: "alien", id: 1001 })).toBe(true);
    expect(alien(h, 1001).state).toBe("down");
    expect(pointer(h, { kind: "alien", id: 1002 })).toBe(false); // a carrier is not clickable
    expect(alien(h, 1002).state).toBe("carrying");
    expect(h.state.stats.aliensDowned).toBe(2);
  });

  it("ends a wave the instant all aliens are down and spawns the next (12 -> 8 -> 6)", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    expect(gData(h).aliens).toHaveLength(12);
    // Down every wave-one alien via clicks; the last click rolls into wave two. Snapshot
    // the ids first, since downing the last alien replaces the array with the next wave.
    const downAll = () => {
      for (const id of gData(h).aliens.map((a) => a.id)) pointer(h, { kind: "alien", id });
    };
    downAll();
    expect(gData(h).wave).toBe(2);
    expect(gData(h).aliens).toHaveLength(8);

    downAll();
    expect(gData(h).wave).toBe(3);
    expect(gData(h).aliens).toHaveLength(6);

    downAll();
    expect(h.inst.phase).toBe("done"); // the fleet is gone after wave three
    expect(galagaDef.isResolved(h.inst, h.state)).toBe(true);
  });

  it("times a wave out at 45s: carried letters rain back, survivors FLEE, next wave begins", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    plant(h, "abcdef");
    h.effects.length = 0;

    drive(h, 4000); // alien 0 dives
    drive(h, 2000); // and grabs a letter
    const carrier = gData(h).aliens.find((a) => a.state === "carrying")!;
    const carriedId = carrier.carriedCellId!;
    expect(statusOf(h, carriedId)).toBe("abducted");

    drive(h, 39_000); // 45_000 since wave start -> timeout
    expect(gData(h).timedOutWaves).toBe(1);
    expect(gData(h).wave).toBe(2); // rolled to the next wave
    expect(statusOf(h, carriedId)).toBe("normal"); // the letter rained back
    expect(toastTexts(h.effects)).toContain("Tractor malfunction. Your letters rain back.");
    // The timed-out aliens FLED (they were not shot), so they are not counted "down".
    // (Wave two's fresh formation is what `aliens` now holds.)
    expect(gData(h).aliens.every((a) => a.state === "formation")).toBe(true);
  });

  it("marks fled, not down, so a timed-out final wave fails the coupled rule", () => {
    const h = boot<GalagaData>(galagaDef);
    toPeak(h);
    gData(h).wave = 3;
    gData(h).aliens = [
      {
        id: 3000,
        formationIndex: 0,
        state: "formation",
        carriedCellId: null,
        diveStartedAtMs: null,
      },
    ];
    gData(h).waveStartedAtMs = h.state.elapsedMs;
    drive(h, 45_000); // final wave times out -> done, with a fled survivor
    expect(h.inst.phase).toBe("done");
    expect(gData(h).aliens[0]!.state).toBe("fled");

    const rule = galagaDef.coupledRule!.create(mulberry32(1));
    expect(
      rule.validate(
        "pw",
        h.state,
        makeRuleApi(h.state, () => HHMM),
      ).passed,
    ).toBe(false);
  });

  describe("the coupled rule truth table", () => {
    it("reports progress during waves one and two", () => {
      const h = boot<GalagaData>(galagaDef);
      toPeak(h);
      gData(h).wave = 2;
      gData(h).aliens = Array.from({ length: 8 }, (_u, i) => ({
        id: 2000 + i,
        formationIndex: i,
        state: i < 3 ? ("down" as const) : ("formation" as const),
        carriedCellId: null,
        diveStartedAtMs: null,
      }));
      const rule = galagaDef.coupledRule!.create(mulberry32(1));
      const res = rule.validate(
        "pw",
        h.state,
        makeRuleApi(h.state, () => HHMM),
      );
      expect(res.passed).toBe(false);
      expect(res.message).toBe("Wave 2 incoming - 3 of 8 down");
    });

    it("passes only when the fleet is done with the final wave shot to the last invader", () => {
      const h = boot<GalagaData>(galagaDef);
      toPeak(h);
      gData(h).wave = 3;
      gData(h).aliens = Array.from({ length: 6 }, (_u, i) => ({
        id: 3000 + i,
        formationIndex: i,
        state: "down" as const,
        carriedCellId: null,
        diveStartedAtMs: null,
      }));
      h.inst.phase = "done";
      const rule = galagaDef.coupledRule!.create(mulberry32(1));
      expect(
        rule.validate(
          "pw",
          h.state,
          makeRuleApi(h.state, () => HHMM),
        ).passed,
      ).toBe(true);
    });

    it("is a freebie when no fleet is scheduled this run", () => {
      const g = createRun({ seed: 1, daily: false, nowHHMM: () => HHMM });
      g.events = [];
      const rule = galagaDef.coupledRule!.create(mulberry32(1));
      expect(
        rule.validate(
          "pw",
          g,
          makeRuleApi(g, () => HHMM),
        ).passed,
      ).toBe(true);
    });
  });
});

// --- Snake -------------------------------------------------------------------

describe("the snake", () => {
  it("seeds its pellet from the set and bites the last normal cell every 5s", () => {
    const h = boot<SnakeData>(snakeDef);
    expect(["o", "0", "@"]).toContain(h.inst.data.pelletChar);
    toPeak(h);
    plant(h, "abcd"); // ids 1..4
    h.inst.data.nextBiteAtMs = h.state.elapsedMs + 5000;
    h.state.stats.lettersAbducted = 0;

    drive(h, 4900);
    expect(h.state.cells.every((c) => c.status === "normal")).toBe(true);
    drive(h, 100); // 5000 -> swallow the LAST normal cell ('d', id4)
    expect(statusOf(h, 4)).toBe("abducted");
    expect(h.inst.data.swallowedIds).toEqual([4]);
    expect(h.state.stats.lettersAbducted).toBe(1);

    drive(h, 5000); // next bite -> the new last normal cell ('c', id3)
    expect(statusOf(h, 3)).toBe("abducted");
  });

  it("eats a pellet typed at the very end of the box (a feed), not inserting it", () => {
    const h = boot<SnakeData>(snakeDef);
    toPeak(h);
    plant(h, "abc");
    h.state.caret = h.state.cells.length; // caret at the very end
    expect(key(h, h.inst.data.pelletChar)).toBe(true); // consumed as a feed
    expect(h.inst.data.sated).toBe(1);
    expect(soundKeys(h.effects)).toContain("snake-chomp");
  });

  it("inserts a pellet typed mid-password (caret not at end): not consumed", () => {
    const h = boot<SnakeData>(snakeDef);
    toPeak(h);
    plant(h, "abc");
    h.state.caret = 1; // not at the end
    expect(key(h, h.inst.data.pelletChar)).toBe(false); // falls through to normal typing
    expect(h.inst.data.sated).toBe(0);
  });

  it("leaves satisfied after three feeds, raining every swallowed letter back in place", () => {
    const h = boot<SnakeData>(snakeDef);
    toPeak(h);
    plant(h, "abcd");
    h.state.stats.lettersRescued = 0;
    // Two cells already swallowed, in order.
    h.state.cells = h.state.cells.map((c) =>
      c.id === 3 || c.id === 4 ? { ...c, status: "abducted", eventTag: "snake" } : c,
    );
    h.inst.data.swallowedIds = [4, 3];
    h.state.caret = h.state.cells.length;
    h.effects.length = 0;

    key(h, h.inst.data.pelletChar);
    key(h, h.inst.data.pelletChar);
    key(h, h.inst.data.pelletChar); // third feed -> it leaves
    expect(h.inst.data.gone).toBe(true);
    expect(h.inst.phase).toBe("done");
    expect(statusOf(h, 3)).toBe("normal");
    expect(statusOf(h, 4)).toBe("normal");
    expect(h.state.stats.lettersRescued).toBe(2);
    expect(toastTexts(h.effects)).toContain("The snake slithers off, satisfied.");
    // Restoration is in place: original order untouched.
    const idx3 = h.state.cells.findIndex((c) => c.id === 3);
    const idx4 = h.state.cells.findIndex((c) => c.id === 4);
    expect(idx3).toBeLessThan(idx4);
    expect(snakeDef.isResolved(h.inst, h.state)).toBe(true);
  });

  it("leaves once it has swallowed eight letters, even unfed", () => {
    const h = boot<SnakeData>(snakeDef);
    toPeak(h);
    plant(h, "abcdefgh"); // eight cells
    h.inst.data.nextBiteAtMs = h.state.elapsedMs + 5000; // first bite one period out
    h.state.stats.lettersRescued = 0;

    // One 5s bite per frame; on the eighth swallow it leaves and rains them back.
    for (let i = 0; i < 12 && !h.inst.data.gone; i++) drive(h, 5000);
    expect(h.inst.data.swallowedIds).toHaveLength(8);
    expect(h.inst.data.gone).toBe(true);
    expect(h.inst.phase).toBe("done");
    expect(h.state.cells.every((c) => c.status === "normal")).toBe(true);
    expect(h.state.stats.lettersRescued).toBe(8);
  });
});

// --- Tetris ------------------------------------------------------------------

const garbageCount = (h: Harness<TetrisData>): number =>
  h.state.cells.filter((c) => c.status === "garbage").length;

describe("tetris garbage", () => {
  it("schedules ten blocks 4s apart with cycling glyphs; each lands 2.5s after it starts", () => {
    const h = boot<TetrisData>(tetrisDef);
    plant(h, "abc");
    toPeak(h); // onset schedules the ten drops
    expect(h.inst.data.drops).toHaveLength(10);
    expect(h.inst.data.drops.map((d) => d.char)).toEqual([
      "#",
      "%",
      "&",
      "#",
      "%",
      "&",
      "#",
      "%",
      "&",
      "#",
    ]);
    const onset = h.state.elapsedMs;
    expect(h.inst.data.drops.map((d) => d.startAtMs - onset)).toEqual([
      0, 4000, 8000, 12_000, 16_000, 20_000, 24_000, 28_000, 32_000, 36_000,
    ]);

    drive(h, 2400); // first block still falling
    expect(garbageCount(h)).toBe(0);
    drive(h, 100); // 2500ms -> first block lands as a garbage cell
    expect(garbageCount(h)).toBe(1);
    expect(h.inst.data.spawned).toBe(1);
  });

  it("wedges garbage at the seeded index (clamped) and shifts the caret when at/left of it", () => {
    const h = boot<TetrisData>(tetrisDef);
    plant(h, "abcd");
    toPeak(h);
    // Force a deterministic landing index and an immediate land.
    h.inst.data.drops = [
      { char: "#", targetIndex: 1, startAtMs: h.state.elapsedMs, landed: false },
    ];
    h.state.caret = 2; // to the right of the insertion point

    drive(h, 2500); // lands at index 1
    expect(h.state.cells[1]!.status).toBe("garbage");
    expect(h.state.cells[1]!.ch).toBe("#");
    expect(h.state.caret).toBe(3); // insertion at index <= caret bumped the caret
  });

  it("clamps the landing index to the live length at land time", () => {
    const h = boot<TetrisData>(tetrisDef);
    plant(h, "ab"); // length 2
    toPeak(h);
    h.inst.data.drops = [
      { char: "&", targetIndex: 9, startAtMs: h.state.elapsedMs, landed: false },
    ];
    drive(h, 2500);
    expect(h.state.cells).toHaveLength(3);
    expect(h.state.cells[2]!.status).toBe("garbage"); // clamped to the end
  });

  it("counts in the value, so it breaks a length rule the clean box would pass", () => {
    const h = boot<TetrisData>(tetrisDef);
    plant(h, "abcdefghijkl"); // exactly 12 real characters -> passes min-length-12
    toPeak(h);
    h.inst.data.drops = [
      { char: "#", targetIndex: 0, startAtMs: h.state.elapsedMs, landed: false },
    ];
    const maxRule = CORE_RULES.find((d) => d.id === "min-length-12")!.create(mulberry32(1));
    const api = makeRuleApi(h.state, () => HHMM);
    expect(maxRule.validate(cellsToPassword(h.state.cells), h.state, api).passed).toBe(true);

    drive(h, 2500); // a garbage block lands and COUNTS
    const value = cellsToPassword(h.state.cells);
    expect([...value]).toHaveLength(13); // garbage inflates the value length
    expect(value).toContain("#");
  });

  it("shatters a garbage cell on click (adjusting the caret) but ignores a normal cell", () => {
    const h = boot<TetrisData>(tetrisDef);
    plant(h, "ab");
    toPeak(h);
    h.inst.data.drops = [
      { char: "#", targetIndex: 0, startAtMs: h.state.elapsedMs, landed: false },
    ];
    drive(h, 2500); // garbage at index 0
    const garbage = h.state.cells.find((c) => c.status === "garbage")!;
    h.state.caret = 2; // to the right of the garbage
    h.state.stats.garbageCleared = 0;

    // A normal cell click is NOT consumed (falls through to caret placement upstream).
    expect(pointer(h, { kind: "cell", id: h.state.cells.find((c) => c.ch === "a")!.id })).toBe(
      false,
    );
    // The garbage click shatters it and pulls the caret left.
    expect(pointer(h, { kind: "cell", id: garbage.id })).toBe(true);
    expect(h.state.cells.some((c) => c.status === "garbage")).toBe(false);
    expect(h.state.caret).toBe(1);
    expect(h.state.stats.garbageCleared).toBe(1);
  });

  it("resolves only once all ten have landed AND no garbage remains", () => {
    const h = boot<TetrisData>(tetrisDef);
    plant(h, "abc");
    toPeak(h);

    // Run long enough for every block to land (last starts at +36s, lands at +38.5s).
    for (let i = 0; i < 400 && h.inst.phase !== "done"; i++) {
      // Shatter garbage as it lands so nothing lingers.
      for (const c of h.state.cells.filter((c) => c.status === "garbage")) {
        pointer(h, { kind: "cell", id: c.id });
      }
      if (h.inst.data.drops.every((d) => d.landed) && garbageCount(h) === 0) {
        drive(h, 100); // one more tick to observe the resolve
        break;
      }
      drive(h, 100);
    }
    expect(h.inst.data.drops.every((d) => d.landed)).toBe(true);
    expect(garbageCount(h)).toBe(0);
    expect(h.inst.phase).toBe("done");
    expect(tetrisDef.isResolved(h.inst, h.state)).toBe(true);
  });
});
