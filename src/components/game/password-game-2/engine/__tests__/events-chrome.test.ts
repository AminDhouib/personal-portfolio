import { describe, expect, it } from "vitest";
import { applyKey, createRun, makeRuleApi, tick } from "../engine";
import { cellsToPassword } from "../cells";
import { mulberry32 } from "../rng";
import { CORE_RULES } from "../rules/index";
import { MONTHS } from "../rules/act1";
import { cookieBannerDef, type CookieBannerData } from "../events/cookie-banner";
import {
  CORRECTION_PAIRS,
  TOGGLE_LABELS,
  autocorrectDef,
  toggleLabelsFor,
  type AutocorrectData,
} from "../events/autocorrect";
import { loadingBarDef, type LoadingBarData } from "../events/loading-bar";
import type { GalagaData } from "../events/galaga";
import { solveRule } from "./solve";
import type {
  CharCell,
  Effect,
  EventContext,
  EventDef,
  EventInstance,
  PointerTarget,
} from "../types";

/**
 * Unit tests for the three chrome events (the form's own UI turning hostile), driven
 * through a hand-built EventContext that mirrors the engine's phaseElapsedMs bookkeeping.
 * Every numeric contract is pinned: the cookie banner's spawn/cap/ordinal-reject rules and
 * 60s expiry; the autocorrect demon's 8s scan cadence, first-pair precedence, case-insensitive
 * match, cell-replacement mechanics, toggle reorder, and 75s boredom; the loading bar's input
 * lock, 97% stick, mash math, and 12s cap. Two engine-level tests exercise the real key routing.
 */

const HHMM = "12:00";

interface Harness<S> {
  def: EventDef<S>;
  inst: EventInstance<S>;
  state: ReturnType<typeof createRun>;
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

/** Replace the box with a fresh run of normal cells, ids 1..n, caret at the end. */
function plant<S>(h: Harness<S>, text: string): void {
  h.state.cells = [...text].map((ch, i) => ({ id: i + 1, ch, status: "normal" }) as CharCell);
  h.state.nextCellId = [...text].length + 1;
  h.state.caret = h.state.cells.length;
}

const soundKeys = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "sound" ? [e.sound] : []));
const toastTexts = (effects: Effect[]): string[] =>
  effects.flatMap((e) => (e.kind === "toast" ? [e.text] : []));
const toasts = (effects: Effect[]): Array<{ text: string; tone: string }> =>
  effects.flatMap((e) => (e.kind === "toast" ? [{ text: e.text, tone: e.tone }] : []));
const valueOf = <S>(h: Harness<S>): string => cellsToPassword(h.state.cells);

// --- Cookie banner -----------------------------------------------------------

const cData = (h: Harness<CookieBannerData>): CookieBannerData => h.inst.data;

describe("the cookie banner", () => {
  it("telegraphs silently, then onsets one banner with the chrome sound and a 60s deadline", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 0;
    drive(h, 100); // mid-telegraph: nothing yet
    expect(h.inst.phase).toBe("telegraph");
    expect(cData(h).banners).toHaveLength(0);

    drive(h, cookieBannerDef.telegraphMs); // telegraph -> onset
    expect(h.inst.phase).toBe("onset");
    expect(cData(h).banners).toHaveLength(1);
    expect(cData(h).banners[0]).toEqual({ id: 0, hasRealReject: true });
    expect(cData(h).deadlineAtMs).toBe(h.state.elapsedMs + 60_000);
    expect(soundKeys(h.effects)).toContain("chrome-onset");
    expect(h.state.inputLocked).toBe(false); // typing is never locked
  });

  it("breeds two more banners on each decline, capping at five", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 4;
    toPeak(h);
    expect(cData(h).banners).toHaveLength(1);
    expect(pointer(h, { kind: "banner-decline", id: 0 })).toBe(true);
    expect(cData(h).banners).toHaveLength(3);
    pointer(h, { kind: "banner-decline", id: 0 });
    expect(cData(h).banners).toHaveLength(5);
    pointer(h, { kind: "banner-decline", id: 0 }); // capped: no more spawn
    expect(cData(h).banners).toHaveLength(5);
    expect(cData(h).banners.map((b) => b.id)).toEqual([0, 1, 2, 3, 4]);
  });

  it("places the real reject on the seeded ordinal as banners spawn", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 3;
    toPeak(h); // banner 0 (fake)
    expect(cData(h).banners[0]!.hasRealReject).toBe(false);
    pointer(h, { kind: "banner-decline", id: 0 }); // banners 1, 2 (fake)
    pointer(h, { kind: "banner-decline", id: 0 }); // banners 3, 4
    const real = cData(h).banners.filter((b) => b.hasRealReject);
    expect(real).toHaveLength(1);
    expect(real[0]!.id).toBe(3);
  });

  it("clamps the real reject onto the last banner when the seeded ordinal exceeds the cap", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 7; // defensive: rangeInt(0,4) never produces this
    toPeak(h);
    pointer(h, { kind: "banner-decline", id: 0 });
    pointer(h, { kind: "banner-decline", id: 0 }); // fill to the cap of five
    expect(cData(h).banners).toHaveLength(5);
    const real = cData(h).banners.filter((b) => b.hasRealReject);
    expect(real).toHaveLength(1);
    expect(real[0]!.id).toBe(4); // the fifth (last) banner carries it
  });

  it("consumes a reject-all on a fake banner as decorative, without resolving", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 3;
    toPeak(h); // banner 0 is fake
    expect(pointer(h, { kind: "banner-reject-all", id: 0 })).toBe(true);
    expect(toastTexts(h.effects)).toContain("That button is decorative.");
    expect(cData(h).dismissed).toBe(false);
    expect(h.inst.phase).toBe("peak");
    expect(cookieBannerDef.isResolved(h.inst, h.state)).toBe(false);
  });

  it("dismisses the swarm on the real reject-all, with a shred and a success toast", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 0;
    toPeak(h); // banner 0 is real
    expect(pointer(h, { kind: "banner-reject-all", id: 0 })).toBe(true);
    expect(cData(h).dismissed).toBe(true);
    expect(h.inst.phase).toBe("done");
    expect(soundKeys(h.effects)).toContain("paper-shred");
    expect(toasts(h.effects)).toContainEqual({
      text: "Preferences saved. All 847 of them.",
      tone: "success",
    });
    expect(cookieBannerDef.isResolved(h.inst, h.state)).toBe(true);
  });

  it("auto-resolves at the 60s deadline, the banners slinking away", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 2;
    toPeak(h);
    const deadline = cData(h).deadlineAtMs;
    while (h.state.elapsedMs + 100 < deadline) drive(h, 100);
    expect(h.inst.phase).toBe("peak"); // not yet
    drive(h, 100); // crosses the deadline
    expect(h.inst.phase).toBe("done");
    expect(cData(h).banners).toHaveLength(0);
    expect(cData(h).dismissed).toBe(false); // it expired, was not dismissed
    expect(toasts(h.effects)).toContainEqual({
      text: "Session expired. The banners slink away.",
      tone: "info",
    });
  });

  it("never locks typing", () => {
    const h = boot(cookieBannerDef);
    cData(h).realRejectAt = 2;
    toPeak(h);
    expect(h.state.inputLocked).toBe(false);
    pointer(h, { kind: "banner-decline", id: 0 });
    expect(h.state.inputLocked).toBe(false);
  });
});

// --- Autocorrect demon -------------------------------------------------------

const aData = (h: Harness<AutocorrectData>): AutocorrectData => h.inst.data;

describe("autocorrect exports", () => {
  it("ships fourteen correction pairs, the first five mapping month to month", () => {
    expect(CORRECTION_PAIRS).toHaveLength(14);
    const monthPairs = CORRECTION_PAIRS.slice(0, 5);
    expect(monthPairs.every(([a, b]) => MONTHS.includes(a) && MONTHS.includes(b))).toBe(true);
  });

  it("ships exactly six toggle labels including the real off switch", () => {
    expect(TOGGLE_LABELS).toHaveLength(6);
    expect(TOGGLE_LABELS).toContain("Helpful corrections");
  });

  it("toggleLabelsFor deterministically relocates the off switch by swapping index 1", () => {
    for (let i = 0; i < 6; i++) {
      const labels = toggleLabelsFor(i);
      expect(labels).toHaveLength(6);
      expect(labels[i]).toBe("Helpful corrections"); // the real switch sits at the seeded slot
      expect(labels[1]).toBe(TOGGLE_LABELS[i]); // index 1 took what was at the slot
      expect(toggleLabelsFor(i)).toEqual(labels); // deterministic
    }
    expect(toggleLabelsFor(1)).toEqual([...TOGGLE_LABELS]); // slot 1 is the identity
  });
});

describe("the autocorrect demon", () => {
  it("scans on the 8s cadence and corrects the first matching pair with a toast", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    plant(h, "dragon");
    drive(h, 7900); // short of the first scan at onset + 8000
    expect(aData(h).corrections).toBe(0);
    drive(h, 100); // 8000ms since onset -> the demon strikes
    expect(aData(h).corrections).toBe(1);
    expect(valueOf(h)).toBe("dargon");
    expect(toastTexts(h.effects)).toContain("Corrected for you.");
  });

  it("records the rewritten cell ids and a timestamp for the flash tell", () => {
    const h = boot(autocorrectDef);
    expect(aData(h).lastRewriteAtMs).toBe(0); // init default
    expect(aData(h).lastRewriteCellIds).toEqual([]); // init default
    toPeak(h);
    plant(h, "dragon"); // ids 1..6, fresh ids start at 7
    drive(h, 8000); // the demon strikes at onset + 8000
    const d = aData(h);
    // dragon -> dargon: six freshly minted cells replaced the match; the tell carries them.
    expect(d.lastRewriteCellIds).toEqual(h.state.cells.map((c) => c.id));
    expect(d.lastRewriteCellIds.every((id) => id > 6)).toBe(true);
    expect(d.lastRewriteAtMs).toBe(h.state.elapsedMs);
  });

  it("matches case-insensitively, writing the lowercase correction", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    plant(h, "DRAGON");
    drive(h, 8000);
    expect(valueOf(h)).toBe("dargon");
  });

  it("honours pair order, not string position, when several words match", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    plant(h, "humandragon"); // "human" appears first, but "dragon" is the earlier pair
    drive(h, 8000);
    expect(valueOf(h)).toBe("humandargon");
    expect(aData(h).corrections).toBe(1);
  });

  it("replaces the matched run with fresh normal cells and holds the caret at the end", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    plant(h, "dragon"); // ids 1..6, caret at 6
    drive(h, 8000);
    const cells = h.state.cells;
    expect(cells.map((c) => c.ch).join("")).toBe("dargon");
    expect(cells.every((c) => c.status === "normal")).toBe(true);
    expect(cells.every((c) => c.id > 6)).toBe(true); // all six cells are freshly minted
    expect(h.state.caret).toBe(6); // an equal-length edit left the caret at the end
  });

  it("keeps an excluded cell interleaved with a match, sliding it past the replacement (M1)", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    // "dra" + [abducted] + "gon": the abducted cell drops out of the value, so the value
    // reads "dragon" and corrects to "dargon". The excluded cell is not part of the match,
    // so it survives by id and slides to just past the freshly minted replacement block.
    h.state.cells = [
      { id: 1, ch: "d", status: "normal" },
      { id: 2, ch: "r", status: "normal" },
      { id: 3, ch: "a", status: "normal" },
      { id: 99, ch: "Z", status: "abducted", eventTag: "galaga" },
      { id: 4, ch: "g", status: "normal" },
      { id: 5, ch: "o", status: "normal" },
      { id: 6, ch: "n", status: "normal" },
    ] as CharCell[];
    h.state.nextCellId = 100;
    h.state.caret = h.state.cells.length;

    drive(h, 8000);

    expect(valueOf(h)).toBe("dargon"); // the abducted cell never counted toward the value
    const excluded = h.state.cells.find((c) => c.id === 99);
    expect(excluded).toBeDefined();
    expect(excluded!.status).toBe("abducted"); // survived by id, untouched
    expect(h.state.caret).toBeGreaterThanOrEqual(0);
    expect(h.state.caret).toBeLessThanOrEqual(h.state.cells.length);
  });

  it("shifts the caret left when the correction shrinks the word", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    plant(h, "honey"); // 5 cells, caret at 5
    drive(h, 8000);
    expect(valueOf(h)).toBe("hone"); // honey -> hone drops a cell
    expect(h.state.caret).toBe(4);
  });

  it("cannot break the month rule: a month is always corrected into another month", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    plant(h, "march");
    const includeMonth = CORE_RULES.find((d) => d.id === "include-month")!.create(mulberry32(1));
    const api = makeRuleApi(h.state, () => HHMM);
    expect(includeMonth.validate(valueOf(h), h.state, api).passed).toBe(true);
    drive(h, 8000);
    expect(valueOf(h)).toBe("april");
    expect(includeMonth.validate(valueOf(h), h.state, api).passed).toBe(true);
  });

  it("can break a length rule, which the solver then repairs", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    plant(h, "1234567honey"); // exactly 12 chars -> passes min-length-12
    const minLength = CORE_RULES.find((d) => d.id === "min-length-12")!.create(mulberry32(1));
    const api = makeRuleApi(h.state, () => HHMM);
    expect(minLength.validate(valueOf(h), h.state, api).passed).toBe(true);

    drive(h, 8000); // honey -> hone: now 11 chars
    const broken = valueOf(h);
    expect(broken).toBe("1234567hone");
    expect(minLength.validate(broken, h.state, api).passed).toBe(false);

    const repaired = solveRule(minLength, broken, api);
    expect([...repaired].length).toBeGreaterThanOrEqual(12);
    expect(minLength.validate(repaired, h.state, api).passed).toBe(true);
  });

  it("toggles the settings modal open and shut on the gear", () => {
    const h = boot(autocorrectDef);
    toPeak(h);
    expect(aData(h).settingsOpen).toBe(false);
    expect(pointer(h, { kind: "settings-gear" })).toBe(true);
    expect(aData(h).settingsOpen).toBe(true);
    pointer(h, { kind: "settings-gear" });
    expect(aData(h).settingsOpen).toBe(false);
  });

  it("disables the demon and resolves on the real off switch", () => {
    const h = boot(autocorrectDef);
    aData(h).correctToggleIndex = 3;
    toPeak(h);
    expect(pointer(h, { kind: "settings-toggle", id: 3 })).toBe(true);
    expect(aData(h).disabled).toBe(true);
    expect(aData(h).settingsOpen).toBe(false);
    expect(h.inst.phase).toBe("done");
    expect(toasts(h.effects)).toContainEqual({
      text: "Helpful corrections disabled. The demon sulks.",
      tone: "success",
    });
    expect(autocorrectDef.isResolved(h.inst, h.state)).toBe(true);
  });

  it("does nothing on a wrong toggle", () => {
    const h = boot(autocorrectDef);
    aData(h).correctToggleIndex = 3;
    toPeak(h);
    expect(pointer(h, { kind: "settings-toggle", id: 2 })).toBe(true);
    expect(toastTexts(h.effects)).toContain("That setting does nothing.");
    expect(aData(h).disabled).toBe(false);
    expect(h.inst.phase).toBe("peak");
  });

  it("gets bored and resolves after 75s untouched", () => {
    const h = boot(autocorrectDef); // empty box: no word to correct
    toPeak(h);
    drive(h, 74_900);
    expect(h.inst.phase).toBe("peak");
    drive(h, 100); // 75_000ms in peak
    expect(h.inst.phase).toBe("done");
    expect(aData(h).disabled).toBe(true);
    expect(toastTexts(h.effects)).toContain("The demon gets bored.");
  });
});

// --- Loading bar -------------------------------------------------------------

const lData = (h: Harness<LoadingBarData>): LoadingBarData => h.inst.data;

describe("the loading bar", () => {
  it("seizes the keyboard at onset with the sound and the upload toast", () => {
    const h = boot(loadingBarDef);
    drive(h, loadingBarDef.telegraphMs); // telegraph -> onset
    expect(h.inst.phase).toBe("onset");
    expect(h.state.inputLocked).toBe(true);
    expect(lData(h).startedAtMs).toBe(h.state.elapsedMs);
    expect(soundKeys(h.effects)).toContain("chrome-onset");
    expect(toasts(h.effects)).toContainEqual({ text: "Uploading password...", tone: "danger" });
  });

  it("crawls to 97 over five seconds and sticks", () => {
    const h = boot(loadingBarDef);
    toPeak(h);
    drive(h, 5000); // full crawl window
    expect(lData(h).progress).toBe(97);
    drive(h, 3000); // still short of the 12s cap; the crawl sticks
    expect(lData(h).progress).toBe(97);
    expect(h.state.inputLocked).toBe(true);
  });

  it("mashes 97 to 100 in nine keys, then resolves and unlocks", () => {
    const h = boot(loadingBarDef);
    toPeak(h);
    drive(h, 5000); // progress exactly 97
    expect(lData(h).progress).toBe(97);

    for (let i = 0; i < 8; i++) expect(key(h, "x")).toBe(true); // 97 -> 99.8
    drive(h, 0);
    expect(h.inst.phase).toBe("peak"); // eight is not enough
    expect(h.state.inputLocked).toBe(true);

    key(h, "x"); // the ninth key crosses 100
    drive(h, 0);
    expect(h.inst.phase).toBe("done");
    expect(h.state.inputLocked).toBe(false);
    expect(toastTexts(h.effects)).toContain("Just kidding.");
  });

  it("swallows any key as a mash while it holds the lock", () => {
    const h = boot(loadingBarDef);
    toPeak(h);
    const before = lData(h).progress;
    expect(key(h, "Backspace")).toBe(true);
    expect(key(h, "ArrowLeft")).toBe(true);
    expect(key(h, "a")).toBe(true);
    expect(lData(h).progress).toBeCloseTo(before + 3 * 0.35, 5);
  });

  it("releases at the 12s cap even if the player never touches a key", () => {
    const h = boot(loadingBarDef);
    toPeak(h);
    drive(h, 11_900);
    expect(h.inst.phase).toBe("peak");
    expect(h.state.inputLocked).toBe(true);
    drive(h, 100); // 12_000ms since onset
    expect(h.inst.phase).toBe("done");
    expect(h.state.inputLocked).toBe(false);
    expect(toastTexts(h.effects)).toContain("Just kidding.");
  });
});

// --- Engine-level key routing ------------------------------------------------

describe("loading bar through the engine", () => {
  it("routes keys to the bar while locked, then resumes typing after it resolves", () => {
    const g = createRun({ seed: 3, daily: false, nowHHMM: () => HHMM });
    g.startedAtMs = 0;
    g.act = "act3";
    const inst: EventInstance<LoadingBarData> = {
      defId: "loading-bar",
      family: "chrome",
      act: "act3",
      phase: "telegraph",
      phaseElapsedMs: 0,
      scheduledAtMs: 0,
      data: loadingBarDef.init(mulberry32(3), g),
    };
    g.events = [inst as EventInstance];

    tick(g, 3000); // telegraph -> onset: the keyboard is seized
    expect(g.inputLocked).toBe(true);

    applyKey(g, "a"); // swallowed as a mash, not inserted
    expect(g.cells).toHaveLength(0);
    expect(inst.data.progress).toBeGreaterThan(0);

    tick(g, 12_000); // the 12s cap releases the lock no matter what
    expect(g.inputLocked).toBe(false);
    expect(inst.phase).toBe("done");

    applyKey(g, "b"); // typing resumes
    expect(g.cells.map((c) => c.ch).join("")).toBe("b");
  });
});

describe("engine applyKey settle (M1 backport)", () => {
  it("bumps the version and re-clamps the caret when a consumed key mutates the cell run", () => {
    // No real def mutates cells while RETURNING FALSE, so the non-consuming branch of the
    // hoisted settle has no live exercise; this pins the consuming branch (a galaga shot
    // raining its letter back) end to end through the public engine key API, which the
    // backport must keep bumping the version and re-clamping the caret.
    const g = createRun({ seed: 5, daily: false, nowHHMM: () => HHMM });
    g.startedAtMs = 0;
    g.act = "act3";
    g.cells = [{ id: 1, ch: "a", status: "abducted", eventTag: "galaga" }];
    g.nextCellId = 2;
    g.caret = 5; // deliberately stale / out of range, to prove the re-clamp
    const galaga: GalagaData = {
      wave: 1,
      aliens: [
        { id: 1000, formationIndex: 0, state: "carrying", carriedCellId: 1, diveStartedAtMs: null },
      ],
      waveStartedAtMs: 0,
      nextDiveAtMs: 0,
      timedOutWaves: 0,
    };
    const inst: EventInstance<GalagaData> = {
      defId: "galaga",
      family: "invasion",
      act: "act3",
      phase: "peak",
      phaseElapsedMs: 0,
      scheduledAtMs: 0,
      data: galaga,
    };
    g.events = [inst as EventInstance];
    const before = g.version;

    applyKey(g, "a"); // galaga shoots the carrier: the cell rains back as a new array

    expect(g.version).toBeGreaterThan(before); // settle bumped after a consumed mutation
    expect(g.caret).toBe(1); // re-clamped to the new length
    expect(g.cells[0]!.status).toBe("normal");
  });
});
