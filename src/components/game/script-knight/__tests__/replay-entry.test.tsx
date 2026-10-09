import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { utcDayKey } from "@/lib/arcade/boards";
import { ScriptKnightGame } from "../../script-knight";
import { playWithBot } from "../engine/reference-bot";
import type { LevelRef } from "../engine/level-ref";
import { configForAnyRef } from "../played";
import { emptyProgress, PROGRESS_KEY, recordClear } from "../progress";
import { buildReplayFragment } from "../replay-link";
import { LOCKED_NOTICE } from "../start-at";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, "", "/games/script-knight");
});
afterEach(cleanup);

function fragmentOf(ref: LevelRef): string {
  return buildReplayFragment(ref, playWithBot(configForAnyRef(ref)!).actions);
}

function openWith(hash: string) {
  window.history.replaceState(null, "", `/games/script-knight${hash}`);
  render(<ScriptKnightGame />);
}

const floorLabel = () => screen.getByRole("img").getAttribute("aria-label");

describe("the replay link on the game's address", () => {
  it("shows no viewer without a fragment, or with one that is not a replay", () => {
    openWith("#other");
    expect(screen.queryByRole("region", { name: "Shared replay" })).toBeNull();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("opens the viewer above the stage for a valid link", () => {
    openWith(fragmentOf({ kind: "tower", tower: "narrow-path", level: 1, epic: false }));
    expect(screen.getByRole("region", { name: "Shared replay" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("says a bad link is damaged and leaves the stage usable", () => {
    openWith("#replay=1.t.np.1.0.zz");
    expect(screen.getByRole("alert").textContent).toBe("This replay link is damaged");
    expect(screen.getByRole("button", { name: "Run" })).toBeTruthy();
  });

  it("closes the viewer and takes the fragment off the address", () => {
    openWith(fragmentOf({ kind: "tower", tower: "narrow-path", level: 1, epic: false }));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Shared replay" })).toBeNull();
    expect(window.location.hash).toBe("");
  });

  it("never writes anything: viewing a replay saves no progress", () => {
    openWith(fragmentOf({ kind: "tower", tower: "narrow-path", level: 1, epic: false }));
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it("plays a floor the player has reached", () => {
    let progress = emptyProgress();
    for (const level of [1, 2, 3]) {
      progress = recordClear(progress, "narrow-path", level, { score: 50, grade: 0.8, turns: 9 });
    }
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    openWith(fragmentOf({ kind: "tower", tower: "narrow-path", level: 3, epic: false }));
    fireEvent.click(screen.getByRole("button", { name: "Play this floor" }));
    expect(screen.queryByRole("region", { name: "Shared replay" })).toBeNull();
    expect((screen.getByLabelText("Floor") as HTMLSelectElement).value).toBe("3");
    expect(screen.queryByText(LOCKED_NOTICE)).toBeNull();
    expect(floorLabel()).toContain("floor 3");
  });

  it("puts a player who has not reached the floor on their furthest one, and says so", () => {
    openWith(fragmentOf({ kind: "tower", tower: "narrow-path", level: 5, epic: false }));
    fireEvent.click(screen.getByRole("button", { name: "Play this floor" }));
    expect((screen.getByLabelText("Floor") as HTMLSelectElement).value).toBe("1");
    expect(screen.getByRole("alert").textContent).toBe(LOCKED_NOTICE);
  });

  it("sends a link to an old daily to today's floor", () => {
    openWith(fragmentOf({ kind: "daily", day: "2026-01-02" }));
    fireEvent.click(screen.getByRole("button", { name: "Play today's floor" }));
    expect(
      screen.getByRole("heading", { name: `Today's floor, ${utcDayKey(new Date())}` }),
    ).toBeTruthy();
  });
});
