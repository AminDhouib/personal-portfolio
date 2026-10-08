import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, renderHook } from "@testing-library/react";
import { EVENT_DEFS } from "../../engine/events/index";
import { applyKey, createRun, tick } from "../../engine/engine";
import { drainEffects } from "../../engine/effects";
import type { EventInstance, GameState } from "../../engine/types";
import { MOTIFS } from "../../sound/motifs";
import { ENGINE_EMITS_TELEGRAPH, cueFor, takeTelegraphCues } from "../telegraph";
import { useTelegraphCue } from "../use-telegraph-cue";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const FAMILY = new Map(EVENT_DEFS.map((d) => [d.id, d.family]));

function telegraphing(defId: string, over: Partial<EventInstance> = {}): EventInstance {
  return {
    defId,
    family: FAMILY.get(defId)!,
    act: "act1",
    phase: "telegraph",
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data: {},
    ...over,
  };
}

/**
 * A real run with `id` forced, driven headlessly into the first half second of its
 * telegraph. Returns every sound effect the engine emitted on the way.
 */
function telegraphStart(id: string): { g: GameState; sounds: string[] } {
  const g = createRun({ seed: 1, daily: false, forceEvent: id });
  applyKey(g, "a"); // the first key starts the run clock
  g.act = "act1";
  g.actElapsedMs = 0;
  drainEffects(g);
  const inst = g.events.find((e) => e.defId === id)!;
  const sounds: string[] = [];
  for (let i = 0; i < 60 && (inst.data === undefined || inst.phaseElapsedMs < 500); i++) {
    tick(g, 100);
    for (const e of drainEffects(g)) if (e.kind === "sound") sounds.push(e.sound);
  }
  expect(inst.data, id).toBeDefined();
  expect(inst.phase, id).toBe("telegraph");
  return { g, sounds };
}

describe.each(EVENT_DEFS.map((d) => d.id))("%s telegraph cue", (id) => {
  it("names a cue that exists in the registry", () => {
    expect(MOTIFS[cueFor(id)], cueFor(id)).toBeTypeOf("function");
  });

  it("plays exactly one telegraph cue at its start: the engine's or the stage's, never both", () => {
    const { g, sounds } = telegraphStart(id);
    const fromEngine = sounds.filter((s) => s.startsWith("telegraph-"));
    const fromStage = takeTelegraphCues(g.events, new WeakSet());
    expect(fromEngine.length + fromStage.length).toBe(1);
    // The skip list is the truth about the engine, not a guess.
    expect(ENGINE_EMITS_TELEGRAPH.has(id)).toBe(fromEngine.length > 0);
  });
});

describe("cueFor", () => {
  it("gives each family its own voice", () => {
    const byFamily = new Map(EVENT_DEFS.map((d) => [d.family, cueFor(d.id)]));
    expect(new Set(byFamily.values()).size).toBe(byFamily.size);
  });
});

describe("takeTelegraphCues", () => {
  it("plays once per event start, not on every heartbeat", () => {
    const seen = new WeakSet<EventInstance>();
    const events = [telegraphing("infection")];
    expect(takeTelegraphCues(events, seen)).toEqual(["telegraph-force"]);
    events[0]!.phaseElapsedMs = 250;
    expect(takeTelegraphCues(events, seen)).toEqual([]);
    events[0]!.phaseElapsedMs = 500;
    expect(takeTelegraphCues(events, seen)).toEqual([]);
  });

  it("a fresh instance of the same event telegraphs again", () => {
    const seen = new WeakSet<EventInstance>();
    expect(takeTelegraphCues([telegraphing("gerald")], seen)).toHaveLength(1);
    expect(takeTelegraphCues([telegraphing("gerald")], seen)).toHaveLength(1);
  });

  it("two events of one family starting together make one cue", () => {
    const seen = new WeakSet<EventInstance>();
    const cues = takeTelegraphCues(
      [telegraphing("cookie-banner"), telegraphing("autocorrect")],
      seen,
    );
    expect(cues).toEqual(["telegraph-chrome"]);
  });

  it("leaves the engine's own telegraph cue alone", () => {
    const seen = new WeakSet<EventInstance>();
    expect(takeTelegraphCues([telegraphing("galaga")], seen)).toEqual([]);
  });

  it("says nothing for an event that has not started or is past its telegraph", () => {
    const seen = new WeakSet<EventInstance>();
    const cues = takeTelegraphCues(
      [telegraphing("infection", { data: undefined }), telegraphing("parasite", { phase: "peak" })],
      seen,
    );
    expect(cues).toEqual([]);
  });
});

describe("useTelegraphCue", () => {
  it("plays the cue once across heartbeat re-renders, and nothing without a run", () => {
    const play = vi.fn();
    const g = { events: [telegraphing("campfire")] } as unknown as GameState;
    const { rerender } = renderHook(({ run }) => useTelegraphCue(run, play), {
      initialProps: { run: null as GameState | null },
    });
    expect(play).not.toHaveBeenCalled();
    rerender({ run: g });
    rerender({ run: g });
    rerender({ run: g });
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith("telegraph-inhabitant");
  });
});
