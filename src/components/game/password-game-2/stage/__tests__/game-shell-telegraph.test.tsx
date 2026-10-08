import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { EventInstance, GameState } from "../../engine/types";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// Capture the live GameState so a test can put an event into its telegraph beat.
let live: GameState | null = null;
vi.mock("../../engine/engine", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../engine/engine")>();
  return {
    ...actual,
    createRun: (opts: Parameters<typeof actual.createRun>[0]): GameState => {
      live = actual.createRun(opts);
      return live;
    },
  };
});

// Record every cue the shell asks for; the gates inside playCue are sound.test's business.
const cues: string[] = [];
vi.mock("../../sound/motifs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../sound/motifs")>();
  return { ...actual, playCue: (name: string) => cues.push(name) };
});

import { GameShell } from "../game-shell";
import { FAMILY_TINT } from "../telegraph";

function telegraphing(defId: string, family: EventInstance["family"]): EventInstance {
  return {
    defId,
    family,
    act: "prologue",
    phase: "telegraph",
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data: {},
  };
}

function startRun() {
  const utils = render(<GameShell />);
  fireEvent.click(utils.getByRole("button", { name: /random seed/i }));
  return utils;
}

/** Add an instance to the live run and let the 250ms heartbeat re-render the shell. */
function inject(inst: EventInstance) {
  act(() => {
    live!.events = [...live!.events, inst];
    vi.advanceTimersByTime(300);
  });
}

describe("GameShell telegraph beat", () => {
  beforeEach(() => {
    live = null;
    cues.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("tints the stage card edge in the family colour while an event winds up", () => {
    const { getByTestId } = startRun();
    const card = getByTestId("pg2-stage-card");
    expect(card.hasAttribute("data-telegraph")).toBe(false);
    inject(telegraphing("galaga", "invasion"));
    expect(card.getAttribute("data-telegraph")).toBe("invasion");
    expect(card.style.getPropertyValue("--pg2-tg")).toBe(FAMILY_TINT.invasion);
    act(() => {
      live!.events = live!.events.filter((e) => e.defId !== "galaga");
      vi.advanceTimersByTime(300);
    });
    expect(card.hasAttribute("data-telegraph")).toBe(false);
  });

  it("mounts the banner in the reserved band under the password, never in the box", () => {
    const { getByTestId, container } = startRun();
    inject(telegraphing("infection", "force"));
    const banner = getByTestId("pg2-telegraph");
    const band = container.querySelector("[data-pg2-hud-bottom]")!;
    expect(band.contains(banner)).toBe(true);
    expect(getByTestId("pg2-stage-card").contains(banner)).toBe(true);
    expect(container.querySelector("[data-pg2-box]")!.contains(banner)).toBe(false);
    // The band reserves its height whether or not a banner is up, so nothing moves.
    expect((band as HTMLElement).style.height).toBe("48px");
  });

  it("plays the family's telegraph cue once when an event starts, not on every heartbeat", () => {
    startRun();
    inject(telegraphing("infection", "force"));
    act(() => {
      vi.advanceTimersByTime(1_000); // four more heartbeats
    });
    expect(cues.filter((c) => c.startsWith("telegraph-"))).toEqual(["telegraph-force"]);
  });

  it("leaves an invasion's cue to the engine, so its start is heard once", () => {
    startRun();
    inject(telegraphing("galaga", "invasion"));
    expect(cues.filter((c) => c.startsWith("telegraph-"))).toEqual([]);
  });
});
