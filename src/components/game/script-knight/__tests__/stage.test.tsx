import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emptyProgress, PROGRESS_KEY, recordClear, setAt } from "../progress";
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

  it("offers Retry when the sandbox could not start, and runs again", async () => {
    let calls = 0;
    const runner: Runner = () => {
      calls += 1;
      const outcome: RunOutcome = { kind: "timeout", log: "1:", phase: "boot", t: 1 };
      return { done: Promise.resolve(outcome), cancel: () => {} };
    };
    render(<Stage runner={runner} />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(await screen.findByText("The sandbox could not start.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls).toBe(2));
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

  it("keeps the editor empty when the player deletes everything, and saves it empty", () => {
    render(<Stage runner={fakeRunner([], finished)} />);
    const editor = screen.getByLabelText("Your Player code (JavaScript)") as HTMLTextAreaElement;
    expect(editor.value).not.toBe("");
    fireEvent.change(editor, { target: { value: "" } });
    expect(editor.value).toBe("");
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(localStorage.getItem("knight:code") ?? "{}").towers["narrow-path"]).toBe("");
  });

  it("saves the code at once when the page is hidden, without waiting for the pause", () => {
    render(<Stage runner={fakeRunner([], finished)} />);
    const editor = screen.getByLabelText("Your Player code (JavaScript)");
    fireEvent.change(editor, { target: { value: "class Player {}" } });
    expect(localStorage.getItem("knight:code")).toBeNull();
    window.dispatchEvent(new Event("pagehide"));
    expect(localStorage.getItem("knight:code")).toContain("class Player {}");
  });

  it("does not show the floor clue for code that did not run", async () => {
    seedFloor(2);
    const error = fakeRunner(["w-"], () => ({
      kind: "player-error",
      log: "1:w-",
      t: 2,
      message: "boom is not defined",
      line: 3,
    }));
    render(<Stage runner={error} />);
    await runAndSkip();
    expect(await screen.findByText(/boom is not defined/)).toBeTruthy();
    expect(screen.queryByText(/Clue/)).toBeNull();
  });

  it("shows the clue when the floor was lost by a run that did finish", async () => {
    seedFloor(2);
    render(<Stage runner={fakeRunner(["w-", "w-", "w-"], finished)} />);
    await runAndSkip();
    expect((await screen.findAllByText(/Clue/)).length).toBeGreaterThan(0);
  });
});

/** Opens floor 2 of the Narrow Path (floor 1 has no clue) and lands the stage on it. */
function seedFloor(level: number) {
  const cleared = recordClear(emptyProgress(), "narrow-path", level - 1, {
    score: 100,
    grade: 0.9,
    turns: 10,
  });
  const progress = setAt(cleared, { tower: "narrow-path", level, epic: false });
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/** Clears the Narrow Path so epic mode is offered, and lands the stage on it. */
function seedEpic(epic: boolean) {
  let progress = emptyProgress();
  for (let floor = 1; floor <= 9; floor += 1) {
    progress = recordClear(progress, "narrow-path", floor, { score: 100, grade: 0.9, turns: 10 });
  }
  progress = setAt(progress, { tower: "narrow-path", level: 1, epic });
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

/** A runner that plays one turn and then waits, so a test decides when a floor ends. */
function pendingRunner(cancelEnds = true) {
  const calls: { resolve: (outcome: RunOutcome) => void }[] = [];
  const runner: Runner = (_req, onTurn) => {
    onTurn(1, "w-", []);
    let resolve!: (outcome: RunOutcome) => void;
    const done = new Promise<RunOutcome>((r) => {
      resolve = r;
    });
    calls.push({ resolve });
    const cancel = () => {
      if (cancelEnds) resolve({ kind: "cancelled", log: "1:w-" });
    };
    return { done, cancel };
  };
  return { runner, calls };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });

function button(name: string) {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

describe("Stage runs", () => {
  it("Stop during an epic run starts no further floor", async () => {
    seedEpic(true);
    const { runner, calls } = pendingRunner();
    render(<Stage runner={runner} />);
    fireEvent.click(button("Run epic"));
    expect(calls).toHaveLength(1);
    fireEvent.click(button("Stop"));
    await settle();
    expect(calls).toHaveLength(1);
    expect(button("Run epic").disabled).toBe(false);
  });

  it("leaving the page during an epic run starts no further floor", async () => {
    seedEpic(true);
    const { runner, calls } = pendingRunner();
    const { unmount } = render(<Stage runner={runner} />);
    fireEvent.click(button("Run epic"));
    expect(calls).toHaveLength(1);
    unmount();
    await settle();
    expect(calls).toHaveLength(1);
  });

  it("changing the floor during an epic run ends it and leaves Run free", async () => {
    seedEpic(true);
    const { runner, calls } = pendingRunner();
    render(<Stage runner={runner} />);
    fireEvent.click(button("Run epic"));
    fireEvent.change(screen.getByLabelText("Floor"), { target: { value: "2" } });
    await settle();
    expect(calls).toHaveLength(1);
    expect(button("Run epic").disabled).toBe(false);
  });

  it("two Run presses before a render start one run", () => {
    const { runner, calls } = pendingRunner();
    render(<Stage runner={runner} />);
    const editor = screen.getByLabelText("Your Player code (JavaScript)");
    act(() => {
      fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
      fireEvent.keyDown(editor, { key: "Enter", ctrlKey: true });
    });
    expect(calls).toHaveLength(1);
  });

  it("drops a result that arrives after the player moved to another tower", async () => {
    seedEpic(false);
    const { runner, calls } = pendingRunner(false);
    render(<Stage runner={runner} />);
    fireEvent.click(button("Run"));
    fireEvent.change(screen.getByLabelText("Tower"), { target: { value: "powder-keep" } });
    await act(async () => {
      calls[0]?.resolve({ kind: "timeout", log: "1:w-", phase: "turn", t: 2 });
      await Promise.resolve();
    });
    await settle();
    fireEvent.click(button("Skip to end"));
    expect(screen.queryByText(/ran longer than/)).toBeNull();
    expect(screen.queryByText("Floor not passed")).toBeNull();
  });
});
