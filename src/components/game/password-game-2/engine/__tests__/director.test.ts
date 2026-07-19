import { describe, expect, it } from "vitest";
import { ACT_SCRIPTS, buildSchedule } from "../director";
import { EVENT_DEFS } from "../events/index";
import type { SlotSpec } from "../director";
import type { EventInstance } from "../types";

const serialize = (s: EventInstance[]) => s.map((e) => `${e.act}:${e.defId}@${e.scheduledAtMs}`);

const SEEDS = [1, 2, 3, 99, 4242];

/** Slots of one act, earliest onset first. */
const byOnset = (slots: SlotSpec[]): SlotSpec[] => [...slots].sort((a, b) => a.atMs - b.atMs);

describe("director", () => {
  it("is deterministic per seed", () => {
    expect(serialize(buildSchedule(123))).toEqual(serialize(buildSchedule(123)));
    expect(serialize(buildSchedule(123))).not.toEqual(serialize(buildSchedule(124)));
  });

  it("always pins galaga in act3 and guarantees at least one inhabitant", () => {
    for (const seed of SEEDS) {
      const s = buildSchedule(seed);
      const galaga = s.find((e) => e.defId === "galaga");
      expect(galaga).toBeDefined();
      expect(galaga?.act).toBe("act3");
      expect(galaga?.scheduledAtMs).toBe(20_000);
      expect(s.some((e) => e.family === "inhabitant")).toBe(true);
    }
  });

  it("schedules 8 to 10 events with no duplicate defIds", () => {
    for (const seed of SEEDS) {
      const s = buildSchedule(seed);
      expect(s.length).toBeGreaterThanOrEqual(8);
      expect(s.length).toBeLessThanOrEqual(10);
      expect(new Set(s.map((e) => e.defId)).size).toBe(s.length);
    }
  });

  it("every instance starts in telegraph phase with data undefined and a real defId from the manifest", () => {
    const ids = new Set(EVENT_DEFS.map((d) => d.id));
    for (const seed of SEEDS) {
      const s = buildSchedule(seed);
      expect(s.length).toBeGreaterThan(0);
      for (const inst of s) {
        expect(inst.phase).toBe("telegraph");
        expect(inst.phaseElapsedMs).toBe(0);
        expect(inst.data).toBeUndefined();
        expect(ids.has(inst.defId)).toBe(true);
        // The instance's family must match its def's family in the manifest.
        expect(EVENT_DEFS.find((d) => d.id === inst.defId)?.family).toBe(inst.family);
      }
    }
  });

  it("enforces valleys: within an act, non-overlap slot onsets are >= 20s apart", () => {
    for (const slots of Object.values(ACT_SCRIPTS)) {
      const sorted = byOnset(slots);
      for (let i = 1; i < sorted.length; i++) {
        const cur = sorted[i]!;
        const prev = sorted[i - 1]!;
        if (cur.overlap) continue; // sanctioned two-crisis slot: exempt from the valley rule
        expect(cur.atMs - prev.atMs).toBeGreaterThanOrEqual(20_000);
      }
    }
  });

  it("inhabitant slots onset before the last blocking (non-inhabitant) slot of their act", () => {
    for (const slots of Object.values(ACT_SCRIPTS)) {
      const blocking = slots.filter((s) => s.family !== "inhabitant");
      const inhabitants = slots.filter((s) => s.family === "inhabitant");
      if (blocking.length === 0 || inhabitants.length === 0) continue;
      const lastBlocking = Math.max(...blocking.map((s) => s.atMs));
      for (const inh of inhabitants) {
        expect(inh.atMs).toBeLessThan(lastBlocking);
      }
    }
  });
});
