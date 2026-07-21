import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

// The shell drives a rAF loop and reads ?seed via next/navigation; stub the router
// and freeze rAF so the run starts deterministically without the frame loop ticking.
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
}));

// Capture the props the shell hands to RuleList so the widget-input channel can be
// exercised directly. The interactive payload renderers that will CALL onWidgetText
// arrive in Task 9; this mock stands in for one, proving the wiring end to end:
// shell handler -> engine.applyText -> the password (cells) re-renders in the DOM.
interface CapturedRuleListProps {
  onWidgetText: (text: string) => void;
  onRuleState: (id: string, value: unknown) => void;
}
let ruleListProps: CapturedRuleListProps | null = null;
vi.mock("../rule-list", () => ({
  RuleList: (props: CapturedRuleListProps) => {
    ruleListProps = props;
    return null;
  },
}));

import { GameShell } from "../game-shell";

describe("PG2 widget input channel", () => {
  beforeEach(() => {
    ruleListProps = null;
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
    vi.stubGlobal("requestAnimationFrame", () => 0);
    vi.stubGlobal("cancelAnimationFrame", () => {});
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("onWidgetText types a widget's answer into the password through applyText", () => {
    const { container, getByRole } = render(<GameShell />);
    fireEvent.click(getByRole("button", { name: /random seed/i })); // begin a run

    const cellCount = () => container.querySelectorAll("[data-cell-id]").length;
    expect(cellCount()).toBe(0);
    // The shell threaded the channel down to RuleList's props.
    expect(ruleListProps).not.toBeNull();
    expect(typeof ruleListProps!.onWidgetText).toBe("function");
    expect(typeof ruleListProps!.onRuleState).toBe("function");

    // A rule widget publishes "AB" the way Task 9's renderers will. It must reach the
    // password via the shell's applyText handler and re-render the cells.
    act(() => ruleListProps!.onWidgetText("AB"));
    expect(cellCount()).toBe(2);

    // onRuleState is wired too; its effect lands on run state (read back by validators
    // via api.ruleState), not the DOM, so assert only that the wiring does not throw.
    act(() => ruleListProps!.onRuleState("smoke", true));
    expect(cellCount()).toBe(2);
  });
});
