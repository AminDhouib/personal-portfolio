import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROGRESS_KEY } from "../progress";
import type { Runner } from "../run-floor";
import type { RunOutcome } from "../sandbox/run-client";
import { Stage } from "../stage";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

/** A runner that plays `tokens` as if a worker sent them, then ends with `outcome`. */
function fakeRunner(tokens: string[], outcome: (log: string) => RunOutcome): Runner {
  return (_req, onTurn) => {
    tokens.forEach((token, i) => onTurn(i + 1, token, []));
    const log = `1:${tokens.join("")}`;
    return { done: Promise.resolve(outcome(log)), cancel: () => {} };
  };
}

const finished = (log: string): RunOutcome => ({ kind: "finished", log, thoughts: [] });

async function runAndSkip() {
  fireEvent.click(screen.getByRole("button", { name: "Run" }));
  const skip = await screen.findByRole("button", { name: "Skip to end" });
  await waitFor(() => expect((skip as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(skip);
}

describe("Stage", () => {
  it("passes Narrow Path 1 with the starter code and walking, and saves the next floor", async () => {
    const walks = Array.from({ length: 7 }, () => "w-");
    render(<Stage runner={fakeRunner(walks, finished)} />);
    await runAndSkip();
    expect(await screen.findByText("Floor passed")).toBeTruthy();
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "{}");
    expect(saved.towers["narrow-path"].reached).toBe(2);
    expect(saved.towers["narrow-path"].best["1"].turns).toBe(7);
  });

  it("shows the timeout text and replays the turns played so far", async () => {
    const runner = fakeRunner(["w-", "w-"], () => ({
      kind: "timeout",
      log: "1:w-w-",
      phase: "turn",
      t: 3,
    }));
    render(<Stage runner={runner} />);
    await runAndSkip();
    expect(await screen.findByText(/ran longer than 0\.25 s/)).toBeTruthy();
    const log = screen.getByRole("log");
    expect(log.textContent).toContain("Turn 2:");
    expect(log.textContent).not.toContain("Turn 3:");
    expect(localStorage.getItem(PROGRESS_KEY)).toBeNull();
  });

  it("keeps Powder Keep locked until the Narrow Path is cleared", () => {
    render(<Stage runner={fakeRunner([], finished)} />);
    const keep = screen.getByRole("option", { name: /Powder Keep/ }) as HTMLOptionElement;
    expect(keep.disabled).toBe(true);
  });

  it("lets a space be typed in the editor and uses it elsewhere to play and pause", () => {
    render(<Stage runner={fakeRunner([], finished)} />);
    const editor = screen.getByLabelText("Your Player code (JavaScript)");
    expect(fireEvent.keyDown(editor, { key: " " })).toBe(true);
    const speed = screen.getByLabelText("Speed");
    expect(fireEvent.keyDown(speed, { key: " " })).toBe(true);
    let notPrevented = true;
    act(() => {
      notPrevented = fireEvent.keyDown(document.body, { key: " " });
    });
    expect(notPrevented).toBe(false);
  });

  it("saves the code after a pause and refuses code over the cap", async () => {
    render(<Stage runner={fakeRunner([], finished)} />);
    const editor = screen.getByLabelText("Your Player code (JavaScript)");
    fireEvent.change(editor, { target: { value: "class Player {}" } });
    await waitFor(() => expect(localStorage.getItem("knight:code")).toContain("class Player {}"), {
      timeout: 2000,
    });
    fireEvent.change(editor, { target: { value: "x".repeat(20_001) } });
    expect((await screen.findByRole("alert")).textContent).toContain("20,000");
  });
});
