import { describe, expect, it } from "vitest";
import { pullForwardTargets } from "../pacing";
import type { EventInstance } from "../types";

const ev = (over: Partial<EventInstance>): EventInstance => ({
  defId: "x",
  family: "chrome",
  act: "act2",
  phase: "telegraph",
  phaseElapsedMs: 0,
  scheduledAtMs: 100_000,
  data: undefined,
  ...over,
});

describe("pullForwardTargets", () => {
  it("pulls only the earliest unstarted blocking event to now + beat", () => {
    const a = ev({ defId: "a", family: "force", scheduledAtMs: 12_000 });
    const b = ev({ defId: "b", family: "force", scheduledAtMs: 150_000 });
    const t = pullForwardTargets([b, a], "act2", 10_000, 4_000);
    expect(t.get(a)).toBeUndefined(); // already due before now + beat: leave it
    expect(t.get(b)).toBeUndefined(); // not the earliest, so not pulled this frame
    const t2 = pullForwardTargets([b], "act2", 10_000, 4_000);
    expect(t2.get(b)).toBe(14_000);
  });

  it("pulls nothing blocking while another blocking event is live", () => {
    const live = ev({ family: "force", scheduledAtMs: 0, data: {}, phase: "peak" });
    const later = ev({ family: "chrome", scheduledAtMs: 120_000 });
    expect(pullForwardTargets([live, later], "act2", 10_000, 4_000).size).toBe(0);
  });

  it("treats a done blocking event as not live", () => {
    const done = ev({ family: "force", scheduledAtMs: 0, data: {}, phase: "done" });
    const later = ev({ family: "chrome", scheduledAtMs: 120_000 });
    expect(pullForwardTargets([done, later], "act2", 10_000, 4_000).get(later)).toBe(14_000);
  });

  it("pulls unstarted inhabitants even while a blocking event is live", () => {
    const live = ev({ family: "force", scheduledAtMs: 0, data: {}, phase: "peak" });
    const inh = ev({ family: "inhabitant", scheduledAtMs: 60_000 });
    expect(pullForwardTargets([live, inh], "act2", 10_000, 4_000).get(inh)).toBe(14_000);
  });

  it("ignores other acts and never delays an event", () => {
    const other = ev({ act: "act3", scheduledAtMs: 90_000 });
    const soon = ev({ family: "chrome", scheduledAtMs: 11_000 });
    expect(pullForwardTargets([other, soon], "act2", 10_000, 4_000).size).toBe(0);
  });
});
