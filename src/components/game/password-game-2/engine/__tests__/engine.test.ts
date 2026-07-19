import { describe, expect, it } from "vitest";
import { applyKey, applyPointer, createRun, makeRuleApi, requestSubmit, tick } from "../engine";
import { drainEffects, pushEffect } from "../effects";
import { cellsToPassword } from "../cells";
import { CORE_RULES } from "../rules/index";
import { solveAll } from "./solve";
import type { CharCell, GameState, RuleApi } from "../types";

const HHMM = "12:00";
const boot = (seed = 42) => createRun({ seed, daily: false, nowHHMM: () => HHMM });

/** Type each key of a string in order. */
const type = (g: GameState, s: string) => {
  for (const k of s) applyKey(g, k);
};

/** Replace the whole password through the public key API: clear to empty, then type. */
const retype = (g: GameState, target: string) => {
  applyKey(g, "End");
  while (g.cells.length > 0) applyKey(g, "Backspace");
  type(g, target);
};

/** Satisfy every currently-revealed rule (only retyping when it changed), then tick once. */
const solveAndTick = (g: GameState, api: RuleApi, dtMs = 1000) => {
  const target = solveAll(g, api);
  if (target !== cellsToPassword(g.cells)) retype(g, target);
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

/** Continue in act3 until every one of the 17 rules is revealed and passing. */
const driveToAllRulesPassing = (g: GameState) => {
  const api = makeRuleApi(g, () => HHMM);
  for (let i = 0; i < 400; i++) {
    solveAndTick(g, api);
    const pw = cellsToPassword(g.cells);
    if (
      g.rules.length === CORE_RULES.length &&
      g.rules.every((r) => r.validate(pw, g, api).passed)
    ) {
      return;
    }
  }
  throw new Error("never reached an all-rules-passing state in act3");
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

  it("emits one title-card per act transition", () => {
    const g = boot();
    runToAct3(g);
    const cards = g.effects.filter((e) => e.kind === "title-card");
    // prologue->act1, act1->act2, act2->act3
    expect(cards.length).toBe(3);
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
