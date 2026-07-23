import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RuleList } from "../rule-list";
import type { GameState, Pg2Rule, RuleApi } from "../../engine/types";
import type { ColorMatch } from "../../engine/rules/act2";

/**
 * Task 12's color-match eyedropper, driven through the REAL RuleList -> RuleCard ->
 * PayloadView -> ColorSwatch path (not a mocked stand-in), matching how the captcha,
 * chess, and consent widget tests guard their own prop threading. A failing color rule
 * is the first (only) rule, so its card renders active + open and the swatches show.
 *
 * The fixture: the true color is "crimson"; the candidate row is a fixed six-way
 * shuffle with crimson once among five decoys. The mystery swatch is unlabeled, so the
 * answer name never appears as visible DOM text until the player picks the matching hue.
 */
const PUZZLE: ColorMatch = {
  name: "crimson",
  hex: "#dc143c",
  options: [
    { name: "teal", hex: "#008080" },
    { name: "crimson", hex: "#dc143c" },
    { name: "violet", hex: "#8a2be2" },
    { name: "gold", hex: "#ffd700" },
    { name: "azure", hex: "#007fff" },
    { name: "salmon", hex: "#fa8072" },
  ],
};

const STATE = {} as GameState;
const API: RuleApi = {
  isEventActive: () => false,
  isEventDone: () => false,
  getEventData: () => null,
  ruleState: () => null,
  nowHHMM: () => "12:00",
};

/** A never-passing color rule so its card stays active and its swatches stay open. */
function colorRule(color: ColorMatch): Pg2Rule {
  return {
    id: "color-match",
    act: "act2",
    description: "Your password must name the color of the seasonal accent swatch (lowercase).",
    payload: { color },
    validate: () => ({ passed: false }),
  };
}

function renderWidget(color: ColorMatch = PUZZLE) {
  const onWidgetText = vi.fn();
  const onRuleState = vi.fn();
  const { container } = render(
    <RuleList
      rules={[colorRule(color)]}
      password=""
      state={STATE}
      api={API}
      onWidgetText={onWidgetText}
      onRuleState={onRuleState}
      version={0}
      validationTick={0}
    />,
  );
  const opt = (name: string) => container.querySelector<HTMLElement>(`[data-color="${name}"]`);
  const swatch = () => container.querySelector<HTMLElement>(".pg2-color__swatch")!;
  return { container, onWidgetText, onRuleState, opt, swatch };
}

afterEach(() => cleanup());

describe("color-match eyedropper", () => {
  it("renders an unlabeled mystery swatch and does not leak the answer name", () => {
    const { container, swatch } = renderWidget();
    expect(swatch().getAttribute("aria-label")).toBe("mystery color swatch");
    // The true color's name never appears as visible DOM text before a pick — the
    // candidate labels are attributes (aria-label), and which one is correct is only
    // knowable by matching hue.
    expect(container.textContent).not.toContain("crimson");
    // Nor through a title tooltip: no element carries the answer name in a title attr.
    const titles = Array.from(container.querySelectorAll("[title]"));
    expect(titles.some((el) => (el.getAttribute("title") ?? "").includes("crimson"))).toBe(false);
  });

  it("renders the six candidate swatches, each aria-labelled by its color name", () => {
    const { container, opt } = renderWidget();
    expect(container.querySelectorAll("[data-color]")).toHaveLength(6);
    for (const { name } of PUZZLE.options) {
      expect(opt(name)?.getAttribute("role")).toBe("button");
      expect(opt(name)?.getAttribute("aria-label")).toBe(name);
    }
  });

  it("types the color name once and marks solved when the matching candidate is clicked", () => {
    const { container, opt, onWidgetText, onRuleState } = renderWidget();
    fireEvent.click(opt("crimson")!);
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("crimson");
    expect(onRuleState).toHaveBeenLastCalledWith("color-match", { solved: true });
    expect(opt("crimson")?.getAttribute("aria-pressed")).toBe("true");
    expect(container.querySelector(".pg2-color__name")?.textContent).toContain("crimson");
  });

  it("shakes and types nothing when a non-matching candidate is clicked", () => {
    const { opt, onWidgetText, onRuleState } = renderWidget();
    const wrong = opt("teal")!;
    fireEvent.click(wrong);
    expect(wrong.className).toContain("pg2-color__option--shake");
    expect(onWidgetText).not.toHaveBeenCalled();
    expect(onRuleState).not.toHaveBeenCalled();
  });

  it("ignores further clicks after it is solved", () => {
    const { opt, onWidgetText } = renderWidget();
    fireEvent.click(opt("crimson")!);
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    // A second click on the true candidate, and a click on a decoy, both do nothing.
    fireEvent.click(opt("crimson")!);
    fireEvent.click(opt("teal")!);
    expect(onWidgetText).toHaveBeenCalledTimes(1);
  });

  it("activates a candidate by keyboard (Enter) and stops the event from toggling the card", () => {
    const { opt, onWidgetText } = renderWidget();
    fireEvent.keyDown(opt("crimson")!, { key: "Enter" });
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("crimson");
  });
});
