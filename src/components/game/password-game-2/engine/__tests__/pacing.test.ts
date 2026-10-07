import { describe, expect, it } from "vitest";
import { applyKey, createRun, requestSubmit, tick } from "../engine";
import { drainEffects } from "../effects";

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
