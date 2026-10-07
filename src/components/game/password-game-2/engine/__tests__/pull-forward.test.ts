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

  it("staggers pulled events in authored order, each a beat after the previous", () => {
    const i1 = ev({ defId: "i1", family: "inhabitant", scheduledAtMs: 40_000 });
    const i2 = ev({ defId: "i2", family: "inhabitant", scheduledAtMs: 60_000 });
    const c = ev({ defId: "c", family: "chrome", scheduledAtMs: 150_000 });
    const t = pullForwardTargets([c, i2, i1], "act2", 10_000, 4_000);
    expect(t.get(i1)).toBe(14_000);
    expect(t.get(i2)).toBe(18_000);
    expect(t.get(c)).toBe(22_000);
  });

  it("keeps the chain stable on the next frame (a pulled event holds its slot)", () => {
    const i1 = ev({ defId: "i1", family: "inhabitant", scheduledAtMs: 14_000 });
    const i2 = ev({ defId: "i2", family: "inhabitant", scheduledAtMs: 18_000 });
    const c = ev({ defId: "c", family: "chrome", scheduledAtMs: 22_000 });
    expect(pullForwardTargets([c, i2, i1], "act2", 10_100, 4_000).size).toBe(0);
  });

  it("starts the chain a beat after an event that is already due soon", () => {
    const soon = ev({ defId: "s", family: "inhabitant", scheduledAtMs: 13_000 });
    const later = ev({ defId: "l", family: "inhabitant", scheduledAtMs: 90_000 });
    const t = pullForwardTargets([soon, later], "act2", 10_000, 4_000);
    expect(t.get(soon)).toBeUndefined();
    expect(t.get(later)).toBe(17_000);
  });
});
