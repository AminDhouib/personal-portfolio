import { describe, expect, it } from "vitest";
import {
  applyKey,
  applyPointer,
  applyText,
  createRun,
  makeRuleApi,
  requestSubmit,
  setRuleState,
  tick,
} from "../engine";
import { drainEffects, pushEffect } from "../effects";
import { cellsToPassword } from "../cells";
import { CORE_RULES } from "../rules/index";
import { solveAll } from "./solve";
import type { GalagaData } from "../events/galaga";
import type { SnakeData } from "../events/snake";
import type { CookieBannerData } from "../events/cookie-banner";
import type { AutocorrectData } from "../events/autocorrect";
import type { LoadingBarData } from "../events/loading-bar";
import type { ActId, CharCell, EventInstance, GameState, Pg2Rule, RuleApi } from "../types";

const HHMM = "12:00";
const boot = (seed = 42) => createRun({ seed, daily: false, nowHHMM: () => HHMM });

/** Type each key of a string in order. */
const type = (g: GameState, s: string) => {
  for (const k of s) applyKey(g, k);
};

/**
 * Replace the whole password through the public key API: clear to empty, then type.
 * The backspace loop is capped so a future input-locking event that swallows
 * Backspace surfaces as a thrown error instead of hanging the whole suite.
 */
const retype = (g: GameState, target: string) => {
  applyKey(g, "End");
  let guard = 0;
  while (g.cells.length > 0) {
    if (++guard > 500) throw new Error("retype: backspace loop exceeded 500 iterations");
    applyKey(g, "Backspace");
  }
  type(g, target);
};

/**
 * Tend the live crises so the run stays winnable: feed Gerald, stoke the campfire,
 * toss the basket whenever the bear is not away, and evict any parasite mimic. The
 * black hole is collapsed by typing its heavy word (see withHeavyWord); the
 * infection is cured by the solver (the no-infected strategy). Deterministic.
 */
const tend = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "gerald") applyPointer(g, { kind: "feed-button" });
    else if (e.defId === "campfire") applyPointer(g, { kind: "stoke-button" });
    else if (e.defId === "garden") {
      const bearState = (e.data as { bearState: string }).bearState;
      if (bearState !== "away") applyPointer(g, { kind: "basket-button" });
    } else if (e.defId === "parasite") {
      for (const c of g.cells.filter((cell) => cell.status === "parasite")) {
        applyPointer(g, { kind: "parasite", id: c.id });
      }
    }
  }
};

/**
 * Leading formation aliens left to dive so their letters are abducted then rescued;
 * the rest are clicked down so a wave clears well inside its 45s cap (no timeout).
 */
const GALAGA_DIVE_BUDGET = 8;

/**
 * Clear the invasions BEFORE the solver re-types (a retype would delete abducted
 * cells out from under the intruders): shoot every letter Galaga is carrying, click
 * down the formation aliens beyond the dive budget, feed the snake its pellet at the
 * end of the box, and shatter every Tetris block.
 */
const tendInvasions = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "galaga") {
      const d = e.data as GalagaData;
      for (const a of d.aliens) {
        if (a.state === "carrying" && a.carriedCellId !== null) {
          const cell = g.cells.find((c) => c.id === a.carriedCellId);
          if (cell) applyKey(g, cell.ch);
        }
      }
      for (const a of d.aliens) {
        if (
          (a.state === "formation" || a.state === "diving") &&
          a.formationIndex >= GALAGA_DIVE_BUDGET
        ) {
          applyPointer(g, { kind: "alien", id: a.id });
        }
      }
    } else if (e.defId === "snake") {
      const d = e.data as SnakeData;
      if (!d.gone) {
        applyKey(g, "End");
        applyKey(g, d.pelletChar);
      }
    } else if (e.defId === "tetris") {
      for (const c of g.cells.filter((cell) => cell.status === "garbage")) {
        applyPointer(g, { kind: "cell", id: c.id });
      }
    }
  }
};

/**
 * Resolve the chrome nuisances the way a player would: mash the loading bar's keyboard
 * seizure, click the cookie banner's real reject-all (declining to surface it first), and
 * flip the autocorrect demon's real off switch through its settings. Deterministic.
 */
const tendChrome = (g: GameState) => {
  for (const e of g.events) {
    if (e.data === undefined || e.phase === "telegraph" || e.phase === "done") continue;
    if (e.defId === "loading-bar") {
      applyKey(g, "x");
    } else if (e.defId === "cookie-banner") {
      const d = e.data as CookieBannerData;
      const real = d.banners.find((b) => b.hasRealReject);
      if (real) applyPointer(g, { kind: "banner-reject-all", id: real.id });
      else {
        const first = d.banners[0];
        if (first) applyPointer(g, { kind: "banner-decline", id: first.id });
      }
    } else if (e.defId === "autocorrect") {
      const d = e.data as AutocorrectData;
      if (!d.settingsOpen) applyPointer(g, { kind: "settings-gear" });
      applyPointer(g, { kind: "settings-toggle", id: d.correctToggleIndex });
    }
  }
};

/** Every non-inhabitant event scheduled for `act` has reached its terminal phase. */
const nonInhabDone = (g: GameState, act: ActId): boolean =>
  g.events
    .filter((e) => e.act === act && e.family !== "inhabitant")
    .every((e) => e.phase === "done");

/** Append the black hole's heavy word to the solve target while it is pulling. */
const withHeavyWord = (g: GameState, target: string): string => {
  const bh = g.events.find(
    (e) =>
      e.defId === "black-hole" &&
      e.data !== undefined &&
      e.phase !== "telegraph" &&
      e.phase !== "done",
  );
  if (!bh) return target;
  const d = bh.data as { heavyWord: string; collapsingSinceMs: number | null };
  if (d.collapsingSinceMs !== null) return target;
  return target.includes(d.heavyWord) ? target : target + d.heavyWord;
};

/** Core-rule count among the revealed rules (excludes coupled inhabitant rules). */
const coreRevealed = (g: GameState) =>
  g.rules.filter((r) => CORE_RULES.some((d) => d.id === r.id)).length;

/** Satisfy every currently-revealed rule (only retyping when it changed), tend, tick. */
const solveAndTick = (g: GameState, api: RuleApi, dtMs = 1000) => {
  tendChrome(g); // dismiss banners/toggles; mash the loading bar before anything else
  tendInvasions(g); // shoot/feed/shatter before the solver re-types over the box
  // Never solve or retype while the loading bar holds the keyboard: the retype's backspace
  // loop would be eaten as mash and throw on its cap. The bar releases within 12s.
  if (!g.inputLocked) {
    const target = withHeavyWord(g, solveAll(g, api));
    if (target !== cellsToPassword(g.cells)) retype(g, target);
  }
  tend(g);
  tick(g, dtMs);
};

/**
 * Walk the run to act3, solving revealed rules as they appear. Each act now holds
 * scheduled stub events that must resolve before it advances, so the walk takes
 * act-relative minutes rather than a handful of frames. Fails loudly on its own
 * if act3 is never reached, so callers can trust the post-condition.
 */
const runToAct3 = (g: GameState) => {
  const api = makeRuleApi(g, () => HHMM);
  for (let i = 0; i < 4000 && g.act !== "act3"; i++) solveAndTick(g, api);
  expect(g.act).toBe("act3");
};

/**
 * Continue in act3 until every one of the 18 rules is revealed and passing AND every
 * act3 invasion/force/chrome has resolved — the submit gate now requires both, so the
 * caretaker must fight the fleet (and the other blocking beats) to their end.
 */
const driveToAllRulesPassing = (g: GameState) => {
  const api = makeRuleApi(g, () => HHMM);
  for (let i = 0; i < 700; i++) {
    solveAndTick(g, api);
    const pw = cellsToPassword(g.cells);
    // g.rules now also holds coupled inhabitant rules, so gate on the CORE count;
    // the every-check still spans all rules (coupled included) since submit needs them.
    if (
      coreRevealed(g) === CORE_RULES.length &&
      g.rules.every((r) => r.validate(pw, g, api).passed) &&
      nonInhabDone(g, "act3")
    ) {
      return;
    }
  }
  throw new Error("never reached an all-rules-passing, invasions-cleared state in act3");
};

describe("engine", () => {
  it("clock starts on first keystroke, not on run creation", () => {
    const g = boot();
    tick(g, 500);
    expect(g.elapsedMs).toBe(0);
    expect(g.startedAtMs).toBeNull();
    applyKey(g, "a");
    tick(g, 500);
    expect(g.elapsedMs).toBe(500);
  });

  it("typing inserts at caret; backspace deletes; arrows move caret", () => {
    const g = boot();
    type(g, "abc");
    applyKey(g, "ArrowLeft");
    applyKey(g, "X");
    expect(g.cells.map((c) => c.ch).join("")).toBe("abXc");
    applyKey(g, "Backspace");
    expect(g.cells.map((c) => c.ch).join("")).toBe("abc");
  });

  it("Delete removes forward, Home/End jump the caret", () => {
    const g = boot();
    type(g, "abc");
    applyKey(g, "Home");
    expect(g.caret).toBe(0);
    applyKey(g, "Delete");
    expect(g.cells.map((c) => c.ch).join("")).toBe("bc");
    expect(g.caret).toBe(0);
    applyKey(g, "End");
    expect(g.caret).toBe(2);
    applyKey(g, "Delete"); // at end: no-op
    expect(g.cells.map((c) => c.ch).join("")).toBe("bc");
  });

  it("reveals the next rule only when all prior rules pass", () => {
    const g = boot();
    expect(g.rules.length).toBe(1); // first prologue rule visible immediately
    type(g, "abcdefghijkl"); // 12 chars, no digit -> satisfies rule 1 only
    tick(g, 100);
    expect(g.rules.length).toBe(2);
    expect(g.rules[1]!.id).toBe("include-number");
  });

  it("does not reveal past a failing rule", () => {
    const g = boot();
    type(g, "short"); // fails min-length-12
    tick(g, 100);
    expect(g.rules.length).toBe(1);
  });

  it("same seed => identical rule payloads and event schedule", () => {
    const a = boot(7);
    const b = boot(7);
    expect(a.rules[0]!.description).toBe(b.rules[0]!.description);
    expect(a.events.map((e) => `${e.defId}@${e.scheduledAtMs}`)).toEqual(
      b.events.map((e) => `${e.defId}@${e.scheduledAtMs}`),
    );
  });

  it("requestSubmit before finale act is refused with a toast effect", () => {
    const g = boot();
    requestSubmit(g);
    expect(g.finale).toBeNull();
    expect(g.act).toBe("prologue");
    expect(g.effects.some((e) => e.kind === "toast")).toBe(true);
  });

  it("advances through the acts and opens the finale on a satisfying submit", () => {
    const g = boot();
    // Each act's core rules must be revealed and passing (and its non-inhabitant
    // events resolved) before it advances, so solve the roster as it unfolds.
    runToAct3(g);
    expect(g.act).toBe("act3");
    driveToAllRulesPassing(g);
    requestSubmit(g);
    expect(g.act).toBe("finale");
    expect(g.finale).not.toBeNull();
    expect(g.finale!.phase).toBe("missiles");
    // Every scheduled inhabitant has onset by act3 and is (stub-)alive, so it is
    // granted as a finale ally. Which inhabitants depends on the seed's draw.
    const inhabitants = [
      ...new Set(g.events.filter((e) => e.family === "inhabitant").map((e) => e.defId)),
    ].sort();
    expect(inhabitants.length).toBeGreaterThan(0);
    expect([...g.finale!.allies].sort()).toEqual(inhabitants);
  });

  it("act3 does not auto-advance to the finale on time alone", () => {
    const g = boot();
    runToAct3(g);
    expect(g.act).toBe("act3");
    // Once in act3, time alone never opens the finale — only a satisfying submit does.
    for (let i = 0; i < 120; i++) tick(g, 1000);
    expect(g.act).toBe("act3");
    expect(g.finale).toBeNull();
  });

  it("refuses submit with the marquee toast when act3 rules pass but an invasion is unresolved", () => {
    const g = boot();
    g.act = "act3";
    g.rules = []; // every revealed rule trivially passes with no rules to check
    const galagaData: GalagaData = {
      wave: 1,
      aliens: [
        {
          id: 1000,
          formationIndex: 0,
          state: "carrying",
          carriedCellId: null,
          diveStartedAtMs: null,
        },
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
      scheduledAtMs: 20_000,
      data: galagaData,
    };
    g.events = [inst];

    requestSubmit(g);
    expect(g.act).toBe("act3");
    expect(g.finale).toBeNull();
    expect(
      g.effects.some((e) => e.kind === "toast" && e.text === "The form is not done with you yet."),
    ).toBe(true);

    // Resolving the invasion opens the finale on the same satisfying submit.
    inst.phase = "done";
    drainEffects(g);
    requestSubmit(g);
    expect(g.act).toBe("finale");
    expect(g.finale).not.toBeNull();
  });

  it("keeps the rules-refusal toast (not the marquee one) when a revealed rule fails in act3", () => {
    const g = boot();
    g.act = "act3";
    const failing: Pg2Rule = {
      id: "always-fails",
      act: "act3",
      description: "never satisfied",
      validate: () => ({ passed: false }),
    };
    g.rules = [failing];
    g.events = [];

    requestSubmit(g);
    expect(g.act).toBe("act3");
    const toasts = g.effects.flatMap((e) => (e.kind === "toast" ? [e.text] : []));
    expect(toasts).toContain("The form is not satisfied.");
    expect(toasts).not.toContain("The form is not done with you yet.");
  });

  it("emits one title-card per act transition", () => {
    // Tending floods the effect queue (moods, feed sounds), which is capped at 64,
    // so collect title cards by draining every frame rather than reading residue.
    const g = boot();
    const api = makeRuleApi(g, () => HHMM);
    const cards: ActId[] = [];
    for (let i = 0; i < 4000 && g.act !== "act3"; i++) {
      solveAndTick(g, api);
      for (const e of drainEffects(g)) if (e.kind === "title-card") cards.push(e.act);
    }
    expect(g.act).toBe("act3");
    expect(cards).toEqual(["act1", "act2", "act3"]); // prologue->act1, act1->act2, act2->act3
  });
});

describe("engine version bumps", () => {
  it("bumps on cell edits and rule reveals but not on caret-only moves", () => {
    const g = boot();
    const afterBoot = g.version;
    applyKey(g, "a");
    expect(g.version).toBeGreaterThan(afterBoot);

    const afterType = g.version;
    applyKey(g, "ArrowLeft");
    expect(g.version).toBe(afterType); // caret-only, no bump
    applyKey(g, "ArrowRight");
    applyKey(g, "Home");
    applyKey(g, "End");
    expect(g.version).toBe(afterType);

    applyKey(g, "Backspace");
    expect(g.version).toBeGreaterThan(afterType); // cells changed

    const before = g.version;
    type(g, "abcdefghijkl");
    tick(g, 100); // reveals include-number
    expect(g.version).toBeGreaterThan(before);
  });
});

describe("engine input locking", () => {
  it("ignores keys while inputLocked and does not start the clock", () => {
    const g = boot();
    g.inputLocked = true;
    applyKey(g, "a");
    expect(g.cells.length).toBe(0);
    expect(g.startedAtMs).toBeNull();

    g.inputLocked = false;
    applyKey(g, "a");
    expect(g.cells.length).toBe(1);
    expect(g.startedAtMs).toBe(0);
  });
});

describe("engine applyText widget channel", () => {
  it("types a whole string as keystrokes, landing at the end regardless of the caret", () => {
    const g = boot();
    type(g, "abc");
    g.caret = 1; // caret parked in the middle
    applyText(g, "XY");
    // applyText jumps to End first (same path as pressing End), so widget text lands
    // at the tail, never spliced wherever the caret happened to be.
    expect(g.cells.map((c) => c.ch).join("")).toBe("abcXY");
    expect(g.caret).toBe(5);
  });

  it("routes each char through applyKey, so an active loading-bar stun swallows it", () => {
    const g = boot();
    type(g, "abc");
    const before = g.cells.length;
    // Stand up the loading bar mid-seizure exactly as onset leaves it: locked input and
    // a live peak-phase instance whose onKey eats every key (printable or named) as a mash.
    g.inputLocked = true;
    const stun: EventInstance<LoadingBarData> = {
      defId: "loading-bar",
      family: "chrome",
      act: "act1",
      phase: "peak",
      phaseElapsedMs: 0,
      scheduledAtMs: 0,
      data: { progress: 50, startedAtMs: 0 },
    };
    g.events = [stun];

    applyText(g, "Nf3");
    // The leading End and every char were swallowed as mash: nothing typed, but the
    // bar was nudged — proof the widget cannot bypass an event by going through applyText.
    expect(g.cells.length).toBe(before);
    expect(g.cells.map((c) => c.ch).join("")).toBe("abc");
    expect(stun.data.progress).toBeGreaterThan(50);
  });

  it("iterates by code point so a surrogate pair survives as a single cell", () => {
    const g = boot();
    // U+1D400 MATHEMATICAL BOLD CAPITAL A is a non-BMP surrogate pair (not an emoji).
    applyText(g, "a\u{1D400}b");
    expect(g.cells.map((c) => c.ch)).toEqual(["a", "\u{1D400}", "b"]);
  });
});

describe("engine rule-state channel", () => {
  it("setRuleState stores the value and bumps the version", () => {
    const g = boot();
    const before = g.version;
    setRuleState(g, "chess-solved", "Qxf7#");
    expect(g.ruleStates["chess-solved"]).toBe("Qxf7#");
    expect(g.version).toBeGreaterThan(before);
  });

  it("makeRuleApi.ruleState reads a set value back and returns null for an unset id", () => {
    const g = boot();
    setRuleState(g, "captcha-passed", true);
    const api = makeRuleApi(g, () => HHMM);
    expect(api.ruleState("captcha-passed")).toBe(true);
    expect(api.ruleState("never-set")).toBeNull();
  });
});

describe("engine pointer routing", () => {
  it("a cell pointer sets the caret without bumping version", () => {
    const g = boot();
    type(g, "abc");
    const firstId = g.cells[0]!.id;
    const v = g.version;
    applyPointer(g, { kind: "cell", id: firstId });
    expect(g.caret).toBe(0);
    expect(g.version).toBe(v);
    applyKey(g, "X");
    expect(g.cells.map((c) => c.ch).join("")).toBe("Xabc");
  });

  it("caret arithmetic indexes the full cell array, parasites included", () => {
    const g = boot();
    type(g, "abc"); // caret at 3
    // Splice an excluded parasite cell after 'b', as a mimic event would.
    const parasite: CharCell = { id: g.nextCellId++, ch: "Z", status: "parasite" };
    g.cells = [...g.cells.slice(0, 2), parasite, ...g.cells.slice(2)];
    g.caret = 2; // before the parasite
    applyKey(g, "Y");
    // The parasite is skipped in the value but never corrupts the array or caret.
    expect(g.cells.map((c) => c.ch).join("")).toBe("abYZc");
    expect(cellsToPassword(g.cells)).toBe("abYc");
  });
});

describe("engine effects backlog cap", () => {
  it("caps the queue at 64, dropping the oldest so the survivors are the last 64", () => {
    const g = boot();
    for (let i = 0; i < 70; i++) {
      pushEffect(g, { kind: "toast", text: `t${i}`, tone: "info" });
    }
    expect(g.effects.length).toBe(64);
    const texts = g.effects.map((e) => (e.kind === "toast" ? e.text : ""));
    expect(texts[0]).toBe("t6"); // t0..t5 were dropped
    expect(texts[texts.length - 1]).toBe("t69");
  });
});

describe("engine caret safety net", () => {
  it("re-clamps the caret when the cell run shrinks under it during a tick", () => {
    const g = boot();
    type(g, "abc"); // caret at 3, three cells
    // Arrange the state an event would leave behind: a shorter run, stale caret.
    g.cells = g.cells.slice(0, 1);
    expect(g.caret).toBe(3);
    tick(g, 100);
    expect(g.caret).toBe(1); // clamped to cells.length
  });
});

describe("engine effects and rule api", () => {
  it("drainEffects returns and clears the queue", () => {
    const g = boot();
    requestSubmit(g); // pushes a refusing toast
    const drained = drainEffects(g);
    expect(drained.some((e) => e.kind === "toast")).toBe(true);
    expect(g.effects.length).toBe(0);
    expect(drainEffects(g)).toEqual([]);
  });

  it("makeRuleApi exposes the injected clock and reports no events at boot", () => {
    const g = boot();
    const api = makeRuleApi(g, () => "09:41");
    expect(api.nowHHMM()).toBe("09:41");
    expect(api.isEventActive("gerald")).toBe(false);
    expect(api.isEventDone("gerald")).toBe(false);
    expect(api.getEventData("gerald")).toBeNull();
  });
});

describe("engine forceEvent showcase seam", () => {
  it("schedules the forced event alone at act1@3000", () => {
    const g = createRun({ seed: 7, daily: false, nowHHMM: () => HHMM, forceEvent: "galaga" });
    expect(g.events).toHaveLength(1);
    const only = g.events[0]!;
    expect(only.defId).toBe("galaga");
    expect(only.act).toBe("act1");
    expect(only.scheduledAtMs).toBe(3000);
    expect(only.phase).toBe("telegraph");
    expect(only.data).toBeUndefined();
  });

  it("falls back to the seeded schedule for an unknown forced id", () => {
    const forced = createRun({ seed: 7, daily: false, nowHHMM: () => HHMM, forceEvent: "nope" });
    const normal = createRun({ seed: 7, daily: false, nowHHMM: () => HHMM });
    expect(forced.events.map((e) => e.defId)).toEqual(normal.events.map((e) => e.defId));
  });
});
