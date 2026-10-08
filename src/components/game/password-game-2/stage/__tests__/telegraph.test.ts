import { describe, expect, it } from "vitest";
import { EVENT_DEFS } from "../../engine/events/index";
import { FAMILY_TINT, activeTelegraphs, telegraphLabel } from "../telegraph";
import type { EventInstance } from "../../engine/types";

const inst = (over: Partial<EventInstance>): EventInstance => ({
  defId: "galaga",
  family: "invasion",
  act: "act3",
  phase: "telegraph",
  phaseElapsedMs: 2_000,
  scheduledAtMs: 0,
  data: {},
  ...over,
});

describe("activeTelegraphs", () => {
  it("lists telegraphing instances with remaining ms, soonest first", () => {
    const a = inst({ defId: "galaga", phaseElapsedMs: 2_000 });
    const b = inst({ defId: "cookie-banner", family: "chrome", phaseElapsedMs: 1_000 });
    const t = activeTelegraphs([a, b]);
    expect(t.map((x) => x.defId)).toEqual(["cookie-banner", "galaga"]);
    expect(t[0]!.remainingMs).toBe(2_000); // 3000 - 1000
    expect(t[1]!.remainingMs).toBe(8_000); // 10000 - 2000
    expect(t[0]!.family).toBe("chrome");
  });

  it("ignores unstarted, peaking and finished instances", () => {
    expect(
      activeTelegraphs([
        inst({ data: undefined }),
        inst({ phase: "peak" }),
        inst({ phase: "done" }),
      ]),
    ).toEqual([]);
  });

  it("never reports a negative remaining time", () => {
    const [t] = activeTelegraphs([inst({ phaseElapsedMs: 60_000 })]);
    expect(t!.remainingMs).toBe(0);
  });

  it("skips an instance whose def is unknown", () => {
    expect(activeTelegraphs([inst({ defId: "no-such-event" })])).toEqual([]);
  });
});

describe("telegraphLabel", () => {
  it("has a label for every event def (no silent telegraph)", () => {
    for (const def of EVENT_DEFS) expect(telegraphLabel(def.id).length, def.id).toBeGreaterThan(3);
  });

  it("labels are plain ASCII and distinct", () => {
    const labels = EVENT_DEFS.map((d) => telegraphLabel(d.id));
    for (const l of labels) expect(l).toMatch(/^[\x20-\x7e]+$/);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe("FAMILY_TINT", () => {
  it("covers every event family", () => {
    for (const def of EVENT_DEFS) expect(FAMILY_TINT[def.family]).toMatch(/^#|^rgb/);
  });
});
