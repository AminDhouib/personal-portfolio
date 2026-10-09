import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ActionName, TurnAction } from "../engine/codec";
import type { AbilitySpec } from "../engine/core/ability";
import { commandForKey, HandPad, type HandPadProps, relativeToward } from "../hand-pad";

afterEach(cleanup);

const spec = (name: string, isAction: boolean): AbilitySpec => ({
  name,
  description: "",
  meta: { params: [], returns: "void" },
  isAction,
});
const ABILITIES = [
  spec("walk", true),
  spec("attack", true),
  spec("rest", true),
  spec("feel", false),
  spec("health", false),
];

function setup(overrides: Partial<HandPadProps> = {}) {
  const onAct = vi.fn<(action: TurnAction) => void>();
  const onUndo = vi.fn();
  const onRestart = vi.fn();
  const props: HandPadProps = {
    abilities: ABILITIES,
    facing: "east",
    live: true,
    canUndo: true,
    onAct,
    onUndo,
    onRestart,
    keyboard: true,
    ...overrides,
  };
  const view = render(<HandPad {...props} />);
  return { ...view, onAct, onUndo, onRestart, props };
}

describe("relativeToward", () => {
  it("turns a screen direction into the direction relative to the facing", () => {
    expect(relativeToward("east", "east")).toBe("forward");
    expect(relativeToward("east", "south")).toBe("right");
    expect(relativeToward("east", "west")).toBe("backward");
    expect(relativeToward("east", "north")).toBe("left");
    expect(relativeToward("west", "west")).toBe("forward");
    expect(relativeToward("west", "north")).toBe("right");
    expect(relativeToward("north", "east")).toBe("right");
    expect(relativeToward("south", "east")).toBe("left");
  });
});

describe("HandPad chips", () => {
  it("has one chip per granted action and none for the senses", () => {
    setup();
    const group = screen.getByRole("group", { name: "Actions" });
    expect(Array.from(group.querySelectorAll("button")).map((b) => b.textContent)).toEqual([
      "Walk",
      "Attack",
      "Rest",
    ]);
  });

  it("starts with walk armed and arms another action on a tap", () => {
    setup();
    expect(screen.getByRole("button", { name: "Walk" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Attack" }));
    expect(screen.getByRole("button", { name: "Attack" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(screen.getByRole("button", { name: "Walk" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("acts at once on rest, with no direction", () => {
    const { onAct } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Rest" }));
    expect(onAct).toHaveBeenCalledWith({ name: "rest", direction: null });
  });

  it("arms the first action when walk is not granted", () => {
    setup({ abilities: [spec("attack", true), spec("rest", true)] });
    expect(screen.getByRole("button", { name: "Attack" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("HandPad arrows", () => {
  it("plays the armed action in the direction each arrow means for the facing", () => {
    const { onAct } = setup({ facing: "east" });
    fireEvent.click(screen.getByRole("button", { name: "Walk forward" }));
    fireEvent.click(screen.getByRole("button", { name: "Walk right" }));
    fireEvent.click(screen.getByRole("button", { name: "Walk backward" }));
    fireEvent.click(screen.getByRole("button", { name: "Walk left" }));
    expect(onAct.mock.calls.map(([action]) => action?.direction)).toEqual([
      "forward",
      "right",
      "backward",
      "left",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Attack" }));
    fireEvent.click(screen.getByRole("button", { name: "Attack forward" }));
    expect(onAct).toHaveBeenLastCalledWith({ name: "attack", direction: "forward" });
  });

  it("lays the arrows out as they point on screen: forward is on the right when facing east", () => {
    setup({ facing: "east" });
    const forward = screen.getByRole("button", { name: "Walk forward" });
    expect(forward.className).toContain("col-start-3");
    expect(screen.getByRole("button", { name: "Walk backward" }).className).toContain(
      "col-start-1",
    );
  });

  it("turns with the knight: facing west puts forward on the left", () => {
    setup({ facing: "west" });
    expect(screen.getByRole("button", { name: "Walk forward" }).className).toContain("col-start-1");
    expect(screen.getByRole("button", { name: "Walk right" }).className).toContain("row-start-1");
  });

  it("disables the arrows while rest is the only choice, and everything when the run is over", () => {
    const { rerender, props } = setup({ abilities: [spec("rest", true)] });
    for (const name of ["Rest forward", "Rest right"]) {
      expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    }
    rerender(<HandPad {...props} live={false} />);
    for (const button of screen.getAllByRole("button")) {
      if (button.textContent === "Undo" || button.textContent === "Start over") continue;
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("has Undo and Start over, and Undo is off when there is nothing to take back", () => {
    const { onUndo, onRestart, rerender, props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onRestart).toHaveBeenCalledTimes(1);
    rerender(<HandPad {...props} canUndo={false} />);
    expect((screen.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("HandPad touch targets", () => {
  it("sizes every control for a thumb", () => {
    setup();
    for (const button of screen.getAllByRole("button")) {
      expect(button.className.split(/\s+/)).toEqual(
        expect.arrayContaining(["pointer-coarse:min-h-11", "pointer-coarse:min-w-11"]),
      );
    }
  });
});

describe("commandForKey", () => {
  const granted: ActionName[] = ["walk", "attack", "rest"];

  it("steers with WASD and the arrow keys, by what they point at on screen", () => {
    expect(commandForKey("d", "east", granted, "walk")).toEqual({
      kind: "act",
      action: { name: "walk", direction: "forward" },
    });
    expect(commandForKey("ArrowLeft", "east", granted, "attack")).toEqual({
      kind: "act",
      action: { name: "attack", direction: "backward" },
    });
    expect(commandForKey("w", "west", granted, "walk")).toEqual({
      kind: "act",
      action: { name: "walk", direction: "right" },
    });
  });

  it("picks an action by letter or digit, and rest acts at once", () => {
    expect(commandForKey("f", "east", granted, "walk")).toEqual({ kind: "arm", name: "attack" });
    expect(commandForKey("2", "east", granted, "walk")).toEqual({ kind: "arm", name: "attack" });
    expect(commandForKey("r", "east", granted, "walk")).toEqual({
      kind: "act",
      action: { name: "rest", direction: null },
    });
    expect(commandForKey("3", "east", granted, "walk")).toEqual({
      kind: "act",
      action: { name: "rest", direction: null },
    });
  });

  it("ignores keys that are not the pad's, an action that is not granted, and steering on rest", () => {
    expect(commandForKey("x", "east", granted, "walk")).toBeNull();
    expect(commandForKey("5", "east", granted, "walk")).toBeNull();
    expect(commandForKey("Enter", "east", granted, "walk")).toBeNull();
    expect(commandForKey("d", "east", granted, "rest")).toBeNull();
  });

  it("undoes on Z or Backspace", () => {
    expect(commandForKey("z", "east", granted, "walk")).toEqual({ kind: "undo" });
    expect(commandForKey("Backspace", "east", granted, "walk")).toEqual({ kind: "undo" });
  });
});

describe("HandPad keyboard", () => {
  it("steers with the armed action and stops the page scrolling", () => {
    const { onAct } = setup();
    const down = new KeyboardEvent("keydown", { key: "ArrowRight", cancelable: true });
    window.dispatchEvent(down);
    expect(onAct).toHaveBeenCalledWith({ name: "walk", direction: "forward" });
    expect(down.defaultPrevented).toBe(true);
  });

  it("arms an action with a letter, then steers with it", () => {
    const { onAct } = setup();
    fireEvent.keyDown(window, { key: "f" });
    fireEvent.keyDown(window, { key: "d" });
    expect(onAct).toHaveBeenCalledWith({ name: "attack", direction: "forward" });
  });

  it("leaves every key alone once the run is over", () => {
    const { onAct } = setup({ live: false });
    for (const key of ["ArrowDown", " ", "d", "z"]) {
      const event = new KeyboardEvent("keydown", { key, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(onAct).not.toHaveBeenCalled();
  });

  it("leaves keys the pad does not use alone while live, so Space and Tab still work", () => {
    const { onAct } = setup();
    for (const key of [" ", "Tab", "PageDown", "k"]) {
      const event = new KeyboardEvent("keydown", { key, cancelable: true });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(onAct).not.toHaveBeenCalled();
  });

  it("ignores keys typed in a field, with a modifier, or held down", () => {
    const { onAct } = setup();
    const field = document.createElement("textarea");
    document.body.append(field);
    fireEvent.keyDown(field, { key: "d" });
    fireEvent.keyDown(window, { key: "d", ctrlKey: true });
    fireEvent.keyDown(window, { key: "d", metaKey: true });
    fireEvent.keyDown(window, { key: "d", repeat: true });
    expect(onAct).not.toHaveBeenCalled();
    field.remove();
  });

  it("listens to nothing when the keyboard is off", () => {
    const { onAct } = setup({ keyboard: false });
    fireEvent.keyDown(window, { key: "d" });
    expect(onAct).not.toHaveBeenCalled();
  });

  it("stops listening when it unmounts", () => {
    const { onAct, unmount } = setup();
    unmount();
    fireEvent.keyDown(window, { key: "d" });
    expect(onAct).not.toHaveBeenCalled();
  });
});
