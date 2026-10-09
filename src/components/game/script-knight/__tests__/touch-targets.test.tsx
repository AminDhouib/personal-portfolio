import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { utcDayKey } from "@/lib/arcade/boards";
import { DailyBoardPanel } from "../board-panel";
import { emptyProgress, PROGRESS_KEY, recordClear } from "../progress";
import type { Runner } from "../run-floor";
import { Stage } from "../stage";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, "matchMedia");
});

// On a phone every control the game owns is at least 44 px square (min-h-11 min-w-11), as the
// other games size theirs; the classes are keyed to a coarse pointer so desktop layout is unchanged.
const TOUCH = ["pointer-coarse:min-h-11", "pointer-coarse:min-w-11"];

function expectTouch(el: Element | null) {
  expect(el).not.toBeNull();
  expect(el?.className.split(/\s+/)).toEqual(expect.arrayContaining(TOUCH));
}

function walkRunner(count: number): Runner {
  const tokens = Array.from({ length: count }, () => "w-");
  return (_req, onTurn) => {
    tokens.forEach((token, i) => onTurn(i + 1, token, []));
    return {
      done: Promise.resolve({ kind: "finished", log: `1:${tokens.join("")}`, thoughts: [] }),
      cancel: () => {},
    };
  };
}

describe("Script Knight touch targets", () => {
  it("sizes the stage controls, selects, epic toggle and credit links for a thumb", () => {
    let progress = emptyProgress();
    for (let floor = 1; floor <= 9; floor += 1) {
      progress = recordClear(progress, "narrow-path", floor, { score: 1, grade: 1, turns: 9 });
    }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    render(<Stage runner={walkRunner(0)} />);
    for (const name of ["Run", "Reset to starter"]) {
      expectTouch(screen.getByRole("button", { name }));
    }
    for (const label of ["Tower", "Floor", "Speed"]) {
      expectTouch(screen.getByLabelText(label));
    }
    expectTouch(screen.getByLabelText("Epic mode").closest("label"));
    for (const name of ["WarriorJS", "ruby-warrior"]) {
      expectTouch(screen.getByRole("link", { name }));
    }
  });

  it("sizes the transport buttons and the scrub slider", () => {
    render(<Stage runner={walkRunner(0)} />);
    const transport = screen.getByRole("group", { name: "Playback" });
    const buttons = transport.querySelectorAll("button");
    expect(buttons).toHaveLength(6);
    buttons.forEach((el) => expectTouch(el));
    expect(screen.getByLabelText("Scrub the replay").className.split(/\s+/)).toContain(
      "pointer-coarse:h-11",
    );
  });

  it("sizes Stop while a run is going and the buttons on a result card", async () => {
    let finish: () => void = () => {};
    const pending: Runner = () => ({
      done: new Promise((resolve) => {
        finish = () => resolve({ kind: "cancelled", log: "1:" });
      }),
      cancel: () => finish(),
    });
    const { unmount } = render(<Stage runner={pending} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expectTouch(screen.getByRole("button", { name: "Stop" }));
    unmount();

    render(<Stage runner={walkRunner(7)} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    const skip = await screen.findByRole("button", { name: "Skip to end" });
    await waitFor(() => expect((skip as HTMLButtonElement).disabled).toBe(false));
    act(() => {
      fireEvent.click(skip);
    });
    expectTouch(await screen.findByRole("button", { name: "Next floor" }));
    expectTouch(screen.getByRole("button", { name: "Improve this score" }));
  });
  it("sizes the play-style and mode buttons", () => {
    render(<Stage runner={walkRunner(0)} />);
    for (const name of ["Play by hand", "Write code", "Towers", "Today's floor"]) {
      expectTouch(screen.getByRole("button", { name }));
    }
  });

  it("sizes Play this floor, Exit and every pad control on a touch screen", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
    render(<Stage runner={walkRunner(0)} />);
    expectTouch(screen.getByRole("button", { name: "Play this floor" }));
    for (const button of screen
      .getByRole("region", { name: "Play by hand" })
      .querySelectorAll("button")) {
      expectTouch(button);
    }
    fireEvent.click(screen.getByRole("button", { name: "Play this floor" }));
    expectTouch(screen.getByRole("button", { name: "Exit" }));
  });

  it("sizes the board panel: tabs, name field and Submit", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ entries: [], you: null }), { status: 200 })),
    );
    render(
      <DailyBoardPanel
        result={{ dayKey: utcDayKey(new Date()), score: 100, turns: 17, log: "1:", hand: true }}
        handle=""
        streakDays={0}
        onHandle={() => {}}
      />,
    );
    // The board's tabs are 44 px tall at every pointer size; Submit adds the coarse width too.
    for (const name of ["Today", "This week", "All time"]) {
      expect((await screen.findByRole("button", { name })).className.split(/\s+/)).toContain(
        "min-h-11",
      );
    }
    expectTouch(await screen.findByRole("button", { name: "Submit" }));
    expect(screen.getByLabelText("Name for the board").className.split(/\s+/)).toContain(
      "min-h-11",
    );
  });
});
