import { describe, expect, it } from "vitest";
import { applyKey, createRun, makeRuleApi, requestSubmit, tick } from "../engine";
import { drainEffects } from "../effects";
import { cellsToPassword } from "../cells";
import { CORE_RULES } from "../rules/index";
import { PULL_FORWARD_BEAT_MS } from "../pacing";
import { ACT_SCRIPTS } from "../director";
import { solveAll } from "./solve";

const boot = (seed = 7) => createRun({ seed, daily: false, nowHHMM: () => "12:00" });

describe("act gate characterization", () => {
  it("never inits an event of a later act while an earlier act is current", () => {
    const g = boot();
    tick(g, 100_000);
    expect(g.act).toBe("prologue");
    expect(g.events.filter((e) => e.act !== "prologue").every((e) => e.data === undefined)).toBe(
      true,
    );
  });

  it("a premature submit is refused with a toast and stays in the prologue", () => {
    const g = boot();
    requestSubmit(g);
    expect(drainEffects(g).some((e) => e.kind === "toast")).toBe(true);
    expect(g.act).toBe("prologue");
    expect(g.finale).toBeNull();
  });

  it("typing into an unsolved prologue never advances the act", () => {
    const g = boot();
    for (const k of "hello") applyKey(g, k);
    tick(g, 1_000);
    expect(g.act).toBe("prologue");
  });
});

describe("engine wiring of pull-forward", () => {
  it("starts the next act-1 event a beat after the act's rules are solved, long before its authored onset", () => {
    const g = boot();
    const api = makeRuleApi(g, () => "12:00");
    const retype = (target: string) => {
      applyKey(g, "End");
      while (g.cells.length > 0) applyKey(g, "Backspace");
      for (const k of target) applyKey(g, k);
    };
    const act1Core = CORE_RULES.filter((d) => d.act === "act1");
    const solved = () =>
      act1Core.every((d) => g.rules.some((r) => r.id === d.id)) &&
      g.rules.every((r) => r.validate(cellsToPassword(g.cells), g, api).passed);

    for (let i = 0; i < 600 && !(g.act === "act1" && solved()); i++) {
      const target = solveAll(g, api);
      if (target !== cellsToPassword(g.cells)) retype(target);
      tick(g, 100);
    }
    expect(g.act).toBe("act1");
    expect(solved()).toBe(true);

    const inhabitant = g.events.find((e) => e.act === "act1" && e.family === "inhabitant")!;
    const authoredOnset = ACT_SCRIPTS.act1.find((s) => s.family === "inhabitant")!.atMs;
    expect(inhabitant.data).toBeUndefined();
    const solvedAt = g.actElapsedMs;

    tick(g, PULL_FORWARD_BEAT_MS + 500);

    expect(inhabitant.data).toBeDefined();
    expect(g.actElapsedMs - solvedAt).toBeLessThan(authoredOnset - solvedAt);
    expect(g.actElapsedMs).toBeLessThan(authoredOnset);
  });
});
