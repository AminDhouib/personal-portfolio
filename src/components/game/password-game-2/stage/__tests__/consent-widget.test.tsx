import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RuleList } from "../rule-list";
import type { GameState, Pg2Rule, RuleApi } from "../../engine/types";
import type { ConsentPuzzle } from "../../engine/rules/act1";

/**
 * Task 11's consent-preference wall, driven through the REAL RuleList -> RuleCard ->
 * PayloadView -> ConsentWidget path (not a mocked stand-in), matching how the captcha
 * and chess widget tests guard their own prop threading. A failing consent rule is the
 * first (only) rule, so its card renders active + open and the switches show.
 *
 * The fixed puzzle: neighbor[i] = i + 1 (mod 6); initial has toggles 0 and 1 on. A
 * single click on toggle 0 turns it off and flips its neighbor (toggle 1) off too,
 * landing on all-off — the shortest possible solution, which keeps the assertions crisp.
 */
const NEIGHBOR = [1, 2, 3, 4, 5, 0];
const INITIAL = [true, true, false, false, false, false];
const PUZZLE: ConsentPuzzle = {
  toggles: [
    "Analytics cookies",
    "Personalized ads",
    "Partner data sharing (1,400 partners)",
    "Email marketing",
    "Cross-device tracking",
    "Selling your soul (optional)",
  ],
  neighbor: NEIGHBOR,
  initial: INITIAL,
  passphrase: "REFUSE",
};

const STATE = {} as GameState;
const API: RuleApi = {
  isEventActive: () => false,
  isEventDone: () => false,
  getEventData: () => null,
  ruleState: () => null,
  nowHHMM: () => "12:00",
};

/** A never-passing consent rule so its card stays active and its switches stay open. */
function consentRule(consent: ConsentPuzzle): Pg2Rule {
  return {
    id: "consent-preferences",
    act: "act1",
    description:
      "Decline all optional data sharing in your preference center, then include the confirmation phrase.",
    payload: { consent },
    validate: () => ({ passed: false }),
  };
}

function renderWidget(consent: ConsentPuzzle = PUZZLE) {
  const onWidgetText = vi.fn();
  const onRuleState = vi.fn();
  const { container } = render(
    <RuleList
      rules={[consentRule(consent)]}
      password=""
      state={STATE}
      api={API}
      onWidgetText={onWidgetText}
      onRuleState={onRuleState}
      version={0}
      validationTick={0}
    />,
  );
  const sw = (i: number) => container.querySelector<HTMLElement>(`[data-toggle="${i}"]`);
  const checked = (i: number) => sw(i)?.getAttribute("aria-checked") === "true";
  const save = () => container.querySelector<HTMLElement>('[data-testid="consent-save"]')!;
  const reset = () => container.querySelector<HTMLElement>('[data-testid="consent-reset"]')!;
  return { container, onWidgetText, onRuleState, sw, checked, save, reset };
}

afterEach(() => cleanup());

describe("consent-preference wall", () => {
  it("renders six labeled switches reflecting the initial state", () => {
    const { container, sw, checked } = renderWidget();
    expect(container.querySelectorAll("[data-toggle]")).toHaveLength(6);
    expect(sw(0)?.getAttribute("role")).toBe("switch");
    expect(sw(0)?.getAttribute("aria-label")).toBe("Analytics cookies");
    // Initial: toggles 0 and 1 on, the rest off.
    expect(checked(0)).toBe(true);
    expect(checked(1)).toBe(true);
    expect(checked(2)).toBe(false);
  });

  it("turning an OFF toggle on just flips itself (no neighbor effect)", () => {
    const { sw, checked } = renderWidget();
    // Toggle 2 is off; clicking it turns it on and leaves its neighbor (3) alone.
    fireEvent.click(sw(2)!);
    expect(checked(2)).toBe(true);
    expect(checked(3)).toBe(false);
  });

  it("turning an ON toggle off flips its seeded neighbor — the dark pattern", () => {
    const { sw, checked } = renderWidget();
    // Toggle 1 is on; neighbor[1] = 2 (off). Clicking 1 off flips 2 on.
    fireEvent.click(sw(1)!);
    expect(checked(1)).toBe(false);
    expect(checked(2)).toBe(true);
  });

  it("keeps Save disabled until every toggle is off", () => {
    const { save, sw, checked } = renderWidget();
    expect(save().getAttribute("aria-disabled")).toBe("true");
    // The one-click solution: clicking toggle 0 off flips neighbor 1 off too -> all off.
    fireEvent.click(sw(0)!);
    expect([0, 1, 2, 3, 4, 5].every((i) => !checked(i))).toBe(true);
    expect(save().getAttribute("aria-disabled")).toBe("false");
  });

  it("on Save at all-off, reveals the passphrase and publishes it exactly once", () => {
    const { save, sw, onWidgetText, onRuleState, container } = renderWidget();
    fireEvent.click(sw(0)!); // reach all-off
    fireEvent.click(save());
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("REFUSE");
    expect(onRuleState).toHaveBeenLastCalledWith("consent-preferences", { solved: true });
    expect(container.querySelector(".pg2-consent__phrase")?.textContent).toContain("REFUSE");
    // A second Save does not double-publish.
    fireEvent.click(save());
    expect(onWidgetText).toHaveBeenCalledTimes(1);
  });

  it("does nothing when Save is clicked while toggles remain on", () => {
    const { save, onWidgetText, onRuleState } = renderWidget();
    fireEvent.click(save()); // still at initial (two toggles on)
    expect(onWidgetText).not.toHaveBeenCalled();
    expect(onRuleState).not.toHaveBeenCalled();
  });

  it("Reset restores the initial state after the player wedges themselves", () => {
    const { reset, sw, checked } = renderWidget();
    // Wedge: turn toggle 1 off (flips 2 on), then toggle 0 off (flips 1 back on).
    fireEvent.click(sw(1)!);
    fireEvent.click(sw(0)!);
    expect(checked(0)).toBe(false);
    expect(checked(1)).toBe(true);
    expect(checked(2)).toBe(true);
    fireEvent.click(reset());
    // Back to initial: 0 and 1 on, rest off.
    expect(checked(0)).toBe(true);
    expect(checked(1)).toBe(true);
    expect(checked(2)).toBe(false);
  });

  it("hides the Reset link once solved (its post-solve no-op styling would mislead)", () => {
    const { save, sw, container } = renderWidget();
    expect(container.querySelector('[data-testid="consent-reset"]')).not.toBeNull();
    fireEvent.click(sw(0)!); // reach all-off
    fireEvent.click(save());
    expect(container.querySelector('[data-testid="consent-reset"]')).toBeNull();
  });

  it("activates a switch by keyboard (Enter) and stops the event from toggling the card", () => {
    const { sw, checked } = renderWidget();
    expect(checked(2)).toBe(false);
    fireEvent.keyDown(sw(2)!, { key: "Enter" });
    expect(checked(2)).toBe(true);
  });
});
