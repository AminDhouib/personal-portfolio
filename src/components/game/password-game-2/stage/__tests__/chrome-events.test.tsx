import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { EventInstance, EventPhase, GameState } from "../../engine/types";
import type { AutocorrectData } from "../../engine/events/autocorrect";
import { ChromeEvents } from "../chrome-events";

afterEach(() => cleanup());

function autocorrectState(phase: EventPhase, settingsOpen = false): GameState {
  const data: AutocorrectData = {
    corrections: 0,
    nextScanAtMs: 0,
    disabled: false,
    settingsOpen,
    correctToggleIndex: 0,
    lastRewriteAtMs: 0,
    lastRewriteCellIds: [],
  };
  const inst: EventInstance<AutocorrectData> = {
    defId: "autocorrect",
    family: "chrome",
    act: "act1",
    phase,
    phaseElapsedMs: 0,
    scheduledAtMs: 0,
    data,
  };
  return { events: [inst], elapsedMs: 0 } as unknown as GameState;
}

const root = (c: HTMLElement) => c.querySelector<HTMLElement>(".pg2-chrome")!;

describe("autocorrect tell", () => {
  it("warns while the demon is warming up, before it strikes", () => {
    const { container, getByText } = render(
      <ChromeEvents g={autocorrectState("telegraph")} onPointer={vi.fn()} />,
    );
    expect(root(container).getAttribute("data-autocorrect")).toBe("armed");
    expect(getByText("Autocorrect is warming up")).toBeTruthy();
    // The gear is not out yet: the event has not onset.
    expect(container.querySelector(".pg2-gear")).toBeNull();
  });

  it("drops the warning once the event is live", () => {
    const { container, queryByText } = render(
      <ChromeEvents g={autocorrectState("peak")} onPointer={vi.fn()} />,
    );
    expect(root(container).getAttribute("data-autocorrect")).toBeNull();
    expect(queryByText("Autocorrect is warming up")).toBeNull();
    expect(container.querySelector(".pg2-gear")).not.toBeNull();
  });

  it("shows nothing for an event that is done", () => {
    const { container, queryByText } = render(
      <ChromeEvents g={autocorrectState("done")} onPointer={vi.fn()} />,
    );
    expect(root(container).getAttribute("data-autocorrect")).toBeNull();
    expect(queryByText("Autocorrect is warming up")).toBeNull();
  });
});

describe("autocorrect settings modal", () => {
  it("is bounded to its container and scrolls instead of clipping", () => {
    const { getByRole } = render(
      <ChromeEvents g={autocorrectState("peak", true)} onPointer={vi.fn()} />,
    );
    const dialog = getByRole("dialog");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toMatch(/max-h-/);
    expect(dialog.className).toMatch(/max-w-/);
  });
});
