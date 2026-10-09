import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { playWithBot } from "../engine/reference-bot";
import type { LevelRef } from "../engine/level-ref";
import { configForAnyRef } from "../played";
import { buildReplayFragment } from "../replay-link";
import { DAMAGED_MESSAGE, ReplayViewer } from "../replay-view";

afterEach(cleanup);

const TODAY = "2026-10-15";
const NP2: LevelRef = { kind: "tower", tower: "narrow-path", level: 2, epic: false };

function fragmentOf(ref: LevelRef): string {
  return buildReplayFragment(ref, playWithBot(configForAnyRef(ref)!).actions);
}

function view(hash: string, over: { onPlay?: () => void; onClose?: () => void } = {}) {
  const onPlay = over.onPlay ?? vi.fn();
  const onClose = over.onClose ?? vi.fn();
  render(<ReplayViewer hash={hash} today={TODAY} onPlay={onPlay} onClose={onClose} />);
  return { onPlay, onClose };
}

describe("ReplayViewer", () => {
  it("replays a tower link: the floor, the result, the controls and no sound toggle", () => {
    view(fragmentOf(NP2));
    expect(screen.getByRole("heading", { name: /The Narrow Path, floor 2/ })).toBeTruthy();
    expect(screen.getByText(/Passed in \d+ turns for \d+ points/)).toBeTruthy();
    expect(screen.getByRole("img", { name: /The Narrow Path, floor 2/ })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Playback" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sound/ })).toBeNull();
    expect(screen.queryByText(DAMAGED_MESSAGE)).toBeNull();
  });

  it("offers to play the same floor", () => {
    const { onPlay } = view(fragmentOf(NP2));
    fireEvent.click(screen.getByRole("button", { name: "Play this floor" }));
    expect(onPlay).toHaveBeenCalledWith(NP2);
  });

  it("replays today's daily link and says it is not ranked", () => {
    const ref: LevelRef = { kind: "daily", day: TODAY };
    const { onPlay } = view(fragmentOf(ref));
    expect(screen.getByText(/not ranked and nothing is saved/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Play this floor" }));
    expect(onPlay).toHaveBeenCalledWith(ref);
  });

  it("replays the daily of another day, and says Play goes to today's floor", () => {
    const ref: LevelRef = { kind: "daily", day: "2026-09-01" };
    const { onPlay } = view(fragmentOf(ref));
    expect(screen.getByRole("heading", { name: /daily floor of 2026-09-01/ })).toBeTruthy();
    expect(screen.getByText(/from 2026-09-01/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Play this floor" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Play today's floor" }));
    expect(onPlay).toHaveBeenCalledWith(ref);
  });

  it("closes", () => {
    const { onClose } = view(fragmentOf(NP2));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls a link that does not parse damaged", () => {
    for (const hash of [
      "#replay=",
      "#replay=2.d.20261015.w-",
      "#replay=1.d.20261315.w-",
      "#replay=1.t.np.1.0.zz",
    ]) {
      cleanup();
      view(hash);
      expect(screen.getByRole("alert").textContent).toBe(DAMAGED_MESSAGE);
      expect(screen.queryByRole("button", { name: /Play/ })).toBeNull();
    }
  });

  it("calls a link damaged when its log does not play on its floor", () => {
    // Narrow Path 1 grants no bow.
    view("#replay=1.t.np.1.0.h0");
    expect(screen.getByRole("alert").textContent).toBe(DAMAGED_MESSAGE);
  });

  it("calls a link damaged when actions are left after the floor ended", () => {
    view(`${fragmentOf(NP2)}w0`);
    expect(screen.getByRole("alert").textContent).toBe(DAMAGED_MESSAGE);
  });
});
