import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Runner } from "../run-floor";
import type { RunOutcome } from "../sandbox/run-client";
import { CUES } from "../sound-cues";
import { Stage } from "../stage";

const audio = vi.hoisted(() => ({
  unlock: vi.fn(),
  play: vi.fn(),
  isMuted: () => false,
  setMuted: vi.fn(),
  stop: vi.fn(),
  close: vi.fn(),
}));
vi.mock("../audio", () => ({ createKnightAudio: () => audio }));

beforeEach(() => {
  localStorage.clear();
  audio.play.mockClear();
});
afterEach(cleanup);

function runnerOf(tokens: string[], outcome: RunOutcome): Runner {
  return (_req, onTurn) => {
    tokens.forEach((token, i) => onTurn(i + 1, token, []));
    return { done: Promise.resolve(outcome), cancel: () => {} };
  };
}

async function runToTheEnd() {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  const skip = await screen.findByRole("button", { name: "Skip to end" });
  await waitFor(() => expect((skip as HTMLButtonElement).disabled).toBe(false));
  act(() => {
    fireEvent.click(skip);
  });
}

describe("Stage sound", () => {
  it("plays the stairs cue when a replay ends on a pass", async () => {
    const walks = Array.from({ length: 7 }, () => "w-");
    const outcome: RunOutcome = { kind: "finished", log: `1:${walks.join("")}`, thoughts: [] };
    render(<Stage runner={runnerOf(walks, outcome)} />);
    await runToTheEnd();
    expect(audio.play).toHaveBeenCalledWith(CUES.stairs);
    expect(audio.play).not.toHaveBeenCalledWith(CUES.fail);
  });

  it("plays the fail cue when a replay ends without a pass", async () => {
    const outcome: RunOutcome = { kind: "finished", log: "1:w-w-w-", thoughts: [] };
    render(<Stage runner={runnerOf(["w-", "w-", "w-"], outcome)} />);
    await runToTheEnd();
    expect(audio.play).toHaveBeenCalledWith(CUES.fail);
    expect(audio.play).not.toHaveBeenCalledWith(CUES.stairs);
  });
});
