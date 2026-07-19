import { describe, expect, it } from "vitest";
import { applyPointer, createRun, tick } from "../engine";
import {
  createFinale,
  effectiveCheckboxPara,
  survivingParagraphs,
  type EulaData,
  type MissilesData,
  type RunawayData,
} from "../events/finale";
import { drainEffects } from "../effects";
import { mulberry32 } from "../rng";
import { campfireDef } from "../events/campfire";
import { geraldDef } from "../events/gerald";
import type { AllyId, EventInstance, GameState } from "../types";

/**
 * Unit tests for the three-phase finale. The phase mechanics are driven through the
 * public engine tick (which routes to tickFinale while act === "finale") and the
 * public applyPointer (which routes to finalePointer once the finale is open), with a
 * few direct data pokes to place a phase in a precise state cheaply. Every numeric
 * contract is pinned: missile cadence/fall/knockback, Gerald's auto-intercept, the
 * EULA burn + deadline, the runaway decay curve and bear bond, ally collection,
 * the world freeze, biggest-crisis selection, and a full zero-ally clear.
 */

const HHMM = "12:00";
const REJECTION = "The form rejects your energy. Again.";

const boot = (seed = 7): GameState => {
  const g = createRun({ seed, daily: false, nowHHMM: () => HHMM });
  g.startedAtMs = 0;
  return g;
};

/** A run sitting in a freshly opened finale, with the given allies + garden snapshot. */
function bootFinale(allies: AllyId[] = [], gardenDistractions = 0, seed = 7): GameState {
  const g = boot(seed);
  g.act = "finale";
  g.finale = createFinale(g);
  g.finale.allies = allies;
  (g.finale.data as { gardenDistractions: number }).gardenDistractions = gardenDistractions;
  return g;
}

const missilesOf = (g: GameState): MissilesData =>
  (g.finale!.data as { missiles: MissilesData }).missiles;
const eulaOf = (g: GameState): EulaData => (g.finale!.data as { eula: EulaData }).eula;
const runawayOf = (g: GameState): RunawayData =>
  (g.finale!.data as { runaway: RunawayData }).runaway;

/** Force the missile phase to resolve cleanly and land in the EULA phase. */
function toEula(g: GameState): void {
  const md = missilesOf(g);
  md.launched = 12;
  md.missiles = [];
  tick(g, 100); // the clear check fires: all launched, none falling
  drainEffects(g);
}

/** Advance through the EULA phase to the runaway phase via the real checkbox. */
function toRunaway(g: GameState): void {
  toEula(g);
  applyPointer(g, { kind: "eula-checkbox" });
  drainEffects(g);
}

// --- Ally collection + world freeze -----------------------------------------

describe("finale — allies and freeze", () => {
  it("collects only the inhabitants alive at finale start", () => {
    const g = boot();
    const rng = mulberry32(1);
    const campfire: EventInstance = {
      defId: "campfire",
      family: "inhabitant",
      act: "act3",
      phase: "peak",
      phaseElapsedMs: 0,
      scheduledAtMs: 0,
      data: { ...campfireDef.init(rng, g), burning: true }, // alive
    };
    const gerald: EventInstance = {
      defId: "gerald",
      family: "inhabitant",
      act: "act3",
      phase: "peak",
      phaseElapsedMs: 0,
      scheduledAtMs: 0,
      data: { ...geraldDef.init(rng, g), hunger: 100 }, // dead
    };
    g.events = [campfire, gerald];
    g.act = "finale";
    const f = createFinale(g);

    expect(f.allies).toEqual(["campfire"]);
    expect(g.stats.creaturesSaved).toBe(1);
  });

  it("freezes the world so a starving campfire cannot bite during the finale", () => {
    const g = boot();
    const rng = mulberry32(1);
    const campfire: EventInstance = {
      defId: "campfire",
      family: "inhabitant",
      act: "act3",
      phase: "peak",
      phaseElapsedMs: 0,
      scheduledAtMs: 0,
      // Burning, nearly out of fuel and one carry-tick from a bite.
      data: { ...campfireDef.init(rng, g), burning: true, fuel: 5, eatCarryMs: 5999 },
    };
    g.cells = [{ id: 1, ch: "a", status: "normal" }];
    g.nextCellId = 2;
    g.events = [campfire];
    g.act = "finale";
    g.finale = createFinale(g);

    expect(campfire.phase).toBe("done");
    expect(g.inputLocked).toBe(false);

    let bit = false;
    for (let i = 0; i < 40; i++) {
      tick(g, 100);
      for (const e of drainEffects(g)) {
        if (e.kind === "toast" && e.text.includes("eating")) bit = true;
      }
    }
    expect(bit).toBe(false);
    expect(g.cells.every((c) => c.status !== "ember")).toBe(true);
  });

  it("names the biggest crisis as the event with the most accumulated peak time", () => {
    const g = boot();
    g.stats.peakMsByEvent = { infection: 12_000, galaga: 30_000, snake: 5_000 };
    g.act = "finale";
    createFinale(g);
    expect(g.stats.biggestCrisis).toBe("galaga");
  });

  it('reports no biggest crisis ("") when nothing spent time in peak', () => {
    const g = boot();
    g.act = "finale";
    createFinale(g);
    expect(g.stats.biggestCrisis).toBe("");
  });
});

// --- Phase 1: Missile Command -----------------------------------------------

describe("finale — missiles", () => {
  it("launches one missile every 3200ms, twelve in all", () => {
    const launchedAfter = (ms: number): number => {
      const g = bootFinale();
      tick(g, ms);
      return missilesOf(g).launched;
    };
    expect(launchedAfter(100)).toBe(1);
    expect(launchedAfter(3100)).toBe(1);
    expect(launchedAfter(3200)).toBe(2);
    expect(launchedAfter(6400)).toBe(3);
    expect(launchedAfter(35_200)).toBe(12);
    expect(launchedAfter(60_000)).toBe(12); // capped at twelve
    // Every launched missile has a horizontal position in [0, 1).
    const g = bootFinale();
    tick(g, 60_000);
    for (const m of missilesOf(g).missiles) {
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x).toBeLessThan(1);
    }
  });

  it("a falling missile lands after 4000ms in the air", () => {
    const g = bootFinale();
    tick(g, 100); // launch missile 0 at phase time 100
    drainEffects(g);
    expect(missilesOf(g).missiles[0]!.state).toBe("falling");
    tick(g, 3800); // fall 3800ms — still short
    drainEffects(g);
    expect(missilesOf(g).missiles[0]!.state).toBe("falling");
    tick(g, 200); // fall crosses 4000ms
    drainEffects(g);
    expect(missilesOf(g).missiles[0]!.state).toBe("landed");
  });

  it("intercepts a falling missile on a pointer, crediting the stat", () => {
    const g = bootFinale();
    tick(g, 100);
    drainEffects(g);
    const m = missilesOf(g).missiles[0]!;
    expect(m.state).toBe("falling");
    const before = g.stats.missilesIntercepted;
    applyPointer(g, { kind: "missile", id: m.id });
    expect(m.state).toBe("intercepted");
    expect(g.stats.missilesIntercepted).toBe(before + 1);
  });

  it("Gerald auto-intercepts the longest-falling missile on a 2500ms cadence", () => {
    const g = bootFinale(["gerald"]);
    const md = missilesOf(g);
    md.missiles = [
      { id: 0, x: 0.1, launchedAtMs: 100, state: "falling" }, // fallen longest
      { id: 1, x: 0.2, launchedAtMs: 2000, state: "falling" },
    ];
    md.launched = 12; // suppress new launches for a clean read
    md.nextGeraldAtMs = 2500;
    g.finale!.phaseElapsedMs = 2450;
    const before = g.stats.missilesIntercepted;

    tick(g, 100); // phase time 2550 — Gerald fires once
    drainEffects(g);

    expect(md.missiles[0]!.state).toBe("intercepted"); // the longest-falling one
    expect(md.missiles[1]!.state).toBe("falling");
    expect(g.stats.missilesIntercepted).toBe(before + 1);
    expect(md.nextGeraldAtMs).toBe(5000); // cadence advanced exactly one step
  });

  it("stuns input for 1500ms on a landing, then auto-releases the lock", () => {
    const g = bootFinale();
    const md = missilesOf(g);
    md.missiles = [
      { id: 0, x: 0.1, launchedAtMs: 0, state: "falling" }, // lands at 4000
      { id: 1, x: 0.2, launchedAtMs: 4000, state: "falling" }, // keeps the phase open
    ];
    md.launched = 12;
    g.finale!.phaseElapsedMs = 3990;

    tick(g, 20); // phase time 4010 — missile 0 lands
    drainEffects(g);
    expect(md.missiles[0]!.state).toBe("landed");
    expect(g.inputLocked).toBe(true);
    expect(md.lockUntilMs).toBe(4010 + 1500);

    tick(g, 1500); // reaches the release time
    drainEffects(g);
    expect(g.inputLocked).toBe(false);
    expect(md.lockUntilMs).toBe(0);
  });

  it("knocks the phase back to scratch on the fourth landing", () => {
    const g = bootFinale();
    const md = missilesOf(g);
    md.missiles = [0, 1, 2, 3].map((id) => ({
      id,
      x: 0.1 * id,
      launchedAtMs: 0,
      state: "falling" as const,
    }));
    md.launched = 8;
    g.finale!.phaseElapsedMs = 3990;
    const knockbacksBefore = g.stats.knockbacks;

    tick(g, 20); // all four land — the fourth triggers the knockback
    const drained = drainEffects(g);

    expect(g.finale!.phase).toBe("missiles");
    expect(g.finale!.attempts).toBe(1);
    expect(g.stats.knockbacks).toBe(knockbacksBefore + 1);
    expect(g.finale!.phaseElapsedMs).toBe(0);
    expect(g.inputLocked).toBe(false);
    const fresh = missilesOf(g);
    expect(fresh.missiles).toHaveLength(0);
    expect(fresh.launched).toBe(0);
    expect(fresh.landedThisAttempt).toBe(0);
    expect(
      drained.some((e) => e.kind === "toast" && e.text === REJECTION && e.tone === "danger"),
    ).toBe(true);
    expect(drained.some((e) => e.kind === "sound" && e.sound === "knockback")).toBe(true);
  });

  it("clears to the EULA phase when all twelve resolve with fewer than four landings", () => {
    const g = bootFinale();
    let guard = 0;
    while (g.finale!.phase === "missiles" && guard++ < 1000) {
      for (const m of missilesOf(g).missiles) {
        if (m.state === "falling") applyPointer(g, { kind: "missile", id: m.id });
      }
      tick(g, 100);
      drainEffects(g);
    }
    expect(g.finale!.phase).toBe("eula");
    expect(g.stats.knockbacks).toBe(0);
  });

  it("clears to EULA without leaking the landing stun when the phase-completing missile lands", () => {
    const g = bootFinale();
    const md = missilesOf(g);
    // Eleven already intercepted; the twelfth is a beat from landing and COMPLETES the
    // phase as a landing (the first this attempt, so no knockback). The landing stun is
    // set the same tick the phase clears — it must not bleed into the EULA phase.
    md.missiles = [
      ...Array.from({ length: 11 }, (_v, id) => ({
        id,
        x: 0.05 * id,
        launchedAtMs: 0,
        state: "intercepted" as const,
      })),
      { id: 11, x: 0.9, launchedAtMs: 0, state: "falling" as const }, // lands at 4000
    ];
    md.launched = 12;
    md.landedThisAttempt = 0;
    g.finale!.phaseElapsedMs = 3990;

    tick(g, 20); // phase time 4010 — the last missile lands and completes the phase
    drainEffects(g);

    expect(g.finale!.phase).toBe("eula");
    expect(g.inputLocked).toBe(false); // the landing stun did not survive the transition
    expect(missilesOf(g).lockUntilMs).toBe(0);

    // Nothing re-locks it once inside the EULA phase — it stays released seconds later.
    tick(g, 3000);
    drainEffects(g);
    expect(g.inputLocked).toBe(false);
  });

  it("clears a live landing stun when the LAST intercept completes the phase on a click", () => {
    const g = bootFinale();
    const md = missilesOf(g);
    // A prior landing left the stun live; ten are intercepted and one still falls. The
    // click that intercepts it completes the phase via missilePointer -> enterEula.
    md.missiles = [
      { id: 0, x: 0.1, launchedAtMs: 0, state: "landed" as const },
      ...Array.from({ length: 10 }, (_v, i) => ({
        id: i + 1,
        x: 0.05 * i,
        launchedAtMs: 0,
        state: "intercepted" as const,
      })),
      { id: 11, x: 0.9, launchedAtMs: 2000, state: "falling" as const },
    ];
    md.launched = 12;
    md.landedThisAttempt = 1;
    md.lockUntilMs = 5000; // a prior landing's stun, still live
    g.inputLocked = true;
    g.finale!.phaseElapsedMs = 3000;

    applyPointer(g, { kind: "missile", id: 11 }); // the final intercept ends the phase
    drainEffects(g);

    expect(g.finale!.phase).toBe("eula");
    expect(g.inputLocked).toBe(false);
    expect(missilesOf(g).lockUntilMs).toBe(0);
  });
});

// --- Phase 2: The EULA Final Form -------------------------------------------

describe("finale — EULA", () => {
  it("survivingParagraphs is the first six indices", () => {
    expect(survivingParagraphs()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("seeds the checkbox in paragraphs 8..23 across seeds", () => {
    for (const seed of [1, 2, 3, 7, 42, 99]) {
      const g = bootFinale([], 0, seed);
      toEula(g);
      const eula = eulaOf(g);
      expect(eula.paragraphs).toBe(24);
      expect(eula.checkboxPara).toBeGreaterThanOrEqual(8);
      expect(eula.checkboxPara).toBeLessThanOrEqual(23);
    }
  });

  it("the campfire ally burns the scroll at 6s, relocating the checkbox among survivors", () => {
    const g = bootFinale(["campfire"]);
    toEula(g);
    const eula = eulaOf(g);
    expect(eula.burned).toBe(false);
    expect(effectiveCheckboxPara(eula)).toBe(eula.checkboxPara); // unburned: its seeded slot

    g.finale!.phaseElapsedMs = 5900;
    const drained: string[] = [];
    tick(g, 200); // crosses 6000ms
    for (const e of drainEffects(g)) if (e.kind === "sound") drained.push(e.sound);

    expect(eula.burned).toBe(true);
    expect(drained).toContain("eula-burn");
    const eff = effectiveCheckboxPara(eula);
    expect(eff).toBe(eula.checkboxPara % 6);
    expect(survivingParagraphs()).toContain(eff);
  });

  it("scolds a decoy checkbox click without advancing", () => {
    const g = bootFinale();
    toEula(g);
    applyPointer(g, { kind: "eula-decoy" });
    const drained = drainEffects(g);
    expect(
      drained.some(
        (e) => e.kind === "toast" && e.text === "You agreed to agree. It means nothing.",
      ),
    ).toBe(true);
    expect(g.finale!.phase).toBe("eula");
  });

  it("advances to the runaway phase on the real checkbox", () => {
    const g = bootFinale();
    toEula(g);
    applyPointer(g, { kind: "eula-checkbox" });
    expect(g.finale!.phase).toBe("runaway");
  });

  it("knocks back on the 90s deadline, re-rolling the checkbox but keeping the burn", () => {
    const g = bootFinale(["campfire"]);
    toEula(g);
    g.finale!.phaseElapsedMs = 6000;
    tick(g, 100); // burn the scroll
    drainEffects(g);
    const eula = eulaOf(g);
    expect(eula.burned).toBe(true);
    const knockbacksBefore = g.stats.knockbacks;

    g.finale!.phaseElapsedMs = 89_950;
    tick(g, 100); // crosses the 90s deadline
    const drained = drainEffects(g);

    expect(g.finale!.phase).toBe("eula");
    expect(g.finale!.phaseElapsedMs).toBe(0);
    expect(g.finale!.attempts).toBe(1);
    expect(g.stats.knockbacks).toBe(knockbacksBefore + 1);
    expect(eula.burned).toBe(true); // the ally power persists across the knockback
    expect(eula.checkboxPara).toBeGreaterThanOrEqual(8);
    expect(eula.checkboxPara).toBeLessThanOrEqual(23);
    expect(
      drained.some((e) => e.kind === "toast" && e.text === REJECTION && e.tone === "danger"),
    ).toBe(true);
  });
});

// --- Phase 3: The Runaway Button --------------------------------------------

describe("finale — runaway", () => {
  it("starts at speed 1.0 with no garden and 0.5 with it", () => {
    const g1 = bootFinale();
    toRunaway(g1);
    expect(runawayOf(g1).speedScale).toBe(1.0);

    const g2 = bootFinale(["garden"]);
    toRunaway(g2);
    expect(runawayOf(g2).speedScale).toBe(0.5);
  });

  it("only slows after 25s, then decays ~4% per second", () => {
    const g = bootFinale();
    toRunaway(g);
    for (let t = 0; t < 250; t++) {
      tick(g, 100); // advance to 25000ms
      drainEffects(g);
    }
    expect(runawayOf(g).speedScale).toBeCloseTo(1.0, 5); // no decay through 25s
    for (let t = 0; t < 100; t++) {
      tick(g, 100); // advance to 35000ms
      drainEffects(g);
    }
    // ~10s of 0.96/s decay.
    expect(runawayOf(g).speedScale).toBeCloseTo(Math.pow(0.96, 10), 1);
  });

  it("a bonded bear auto-catches the button at 10s", () => {
    const g = bootFinale(["garden"], 2); // garden ally + two distractions -> bond
    toRunaway(g);
    expect(runawayOf(g).bearBond).toBe(true);
    for (let t = 0; t < 200 && g.outcome !== "victory"; t++) {
      tick(g, 100);
      drainEffects(g);
    }
    expect(g.outcome).toBe("victory");
    expect(runawayOf(g).caughtAtMs).not.toBeNull();
    expect(g.finale!.phaseElapsedMs).toBeGreaterThanOrEqual(10_000);
  });

  it("does not bond a garden that was defended fewer than twice", () => {
    const g = bootFinale(["garden"], 1);
    toRunaway(g);
    expect(runawayOf(g).bearBond).toBe(false);
  });

  it("catches the button on a submit-button pointer: victory, sound, closing card", () => {
    const g = bootFinale();
    toRunaway(g);
    applyPointer(g, { kind: "submit-button" });
    const drained = drainEffects(g);
    expect(g.outcome).toBe("victory");
    expect(runawayOf(g).caughtAtMs).not.toBeNull();
    expect(drained.some((e) => e.kind === "sound" && e.sound === "victory")).toBe(true);
    expect(drained.some((e) => e.kind === "title-card" && e.act === "finale")).toBe(true);
  });
});

// --- Zero-ally full clear ----------------------------------------------------

describe("finale — beatable alone", () => {
  it("is fully beatable with zero allies, using pointers alone", () => {
    const g = bootFinale([]);
    let guard = 0;
    while (g.outcome !== "victory" && guard++ < 5000) {
      const phase = g.finale!.phase;
      if (phase === "missiles") {
        for (const m of missilesOf(g).missiles) {
          if (m.state === "falling") applyPointer(g, { kind: "missile", id: m.id });
        }
      } else if (phase === "eula") {
        applyPointer(g, { kind: "eula-checkbox" });
      } else {
        applyPointer(g, { kind: "submit-button" });
      }
      tick(g, 100);
      drainEffects(g);
    }
    expect(g.outcome).toBe("victory");
    expect(g.stats.knockbacks).toBe(0);
    expect(g.stats.missilesIntercepted).toBeGreaterThanOrEqual(12);
  });
});
