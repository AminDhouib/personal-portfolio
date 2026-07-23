import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RuleList } from "../rule-list";
import type { GameState, Pg2Rule, RuleApi } from "../../engine/types";
import type { CaptchaChallenge } from "../../engine/rules/prologue";

/**
 * Task 10's rejecting image CAPTCHA, driven through the REAL RuleList -> RuleCard ->
 * PayloadView -> CaptchaWidget path (not a mocked stand-in), matching how the chess
 * widget test guards its own prop threading. A failing captcha rule is the first
 * (only) rule, so its card renders active + open and the tiles show.
 *
 * Everything the widget shows comes from this fixed challenge: grid 1 has three
 * traffic lights at 0,2,4; grid 2 has four at 1,3,6,8. The token is OK-BEEF.
 */
const TL = { kind: "traffic-light" } as const;
const CW = { kind: "crosswalk" } as const;
const SF = { kind: "storefront" } as const;

const CHALLENGE: CaptchaChallenge = {
  target: "traffic-light",
  token: "OK-BEEF",
  grids: [
    [TL, CW, TL, SF, TL, CW, SF, CW, SF], // grid 1: traffic lights at 0, 2, 4
    [CW, TL, SF, TL, CW, SF, TL, SF, TL], // grid 2: traffic lights at 1, 3, 6, 8
  ],
};
const GRID1_TARGET = [0, 2, 4];
const GRID2_TARGET = [1, 3, 6, 8];

const STATE = {} as GameState;
const API: RuleApi = {
  isEventActive: () => false,
  isEventDone: () => false,
  getEventData: () => null,
  ruleState: () => null,
  nowHHMM: () => "12:00",
};

/** A never-passing captcha rule so its card stays active and its tiles stay open. */
function captchaRule(challenge: CaptchaChallenge): Pg2Rule {
  return {
    id: "captcha-human",
    act: "prologue",
    description: "Prove you are human. Complete the verification challenge.",
    payload: { captcha: challenge },
    validate: () => ({ passed: false }),
  };
}

function renderWidget(challenge: CaptchaChallenge = CHALLENGE) {
  const onWidgetText = vi.fn();
  const onRuleState = vi.fn();
  const { container } = render(
    <RuleList
      rules={[captchaRule(challenge)]}
      password=""
      state={STATE}
      api={API}
      onWidgetText={onWidgetText}
      onRuleState={onRuleState}
      version={0}
      validationTick={0}
    />,
  );
  const tile = (i: number) => container.querySelector<HTMLElement>(`[data-index="${i}"]`);
  const verify = () => container.querySelector<HTMLElement>('[data-testid="captcha-verify"]')!;
  const stage = () => container.querySelector<HTMLElement>(".pg2-captcha")!.dataset.stage;
  const select = (indices: number[]) => indices.forEach((i) => fireEvent.click(tile(i)!));
  return { container, onWidgetText, onRuleState, tile, verify, stage, select };
}

afterEach(() => cleanup());

describe("rejecting image captcha", () => {
  it("renders nine tiles, a prompt naming the target, and a verify control", () => {
    const { container, verify } = renderWidget();
    expect(container.querySelectorAll("[data-index]")).toHaveLength(9);
    expect(container.querySelector(".pg2-captcha__prompt")?.textContent).toContain(
      "traffic lights",
    );
    expect(verify()).not.toBeNull();
  });

  it("toggles a tile's pressed state on click", () => {
    const { tile } = renderWidget();
    expect(tile(0)?.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(tile(0)!);
    expect(tile(0)?.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(tile(0)!);
    expect(tile(0)?.getAttribute("aria-pressed")).toBe("false");
  });

  it("rejects a wrong set without advancing, so the forced rejection is untouched", () => {
    const { onWidgetText, onRuleState, verify, stage, select, container } = renderWidget();
    select([0, 1]); // includes a non-target tile — wrong
    fireEvent.click(verify());
    expect(container.querySelector(".pg2-captcha__msg")?.textContent).toBe(
      "Verification failed. Please try again.",
    );
    expect(stage()).toBe("1"); // still grid 1
    expect(onWidgetText).not.toHaveBeenCalled();
    expect(onRuleState).not.toHaveBeenCalled();
  });

  it("rejects the FIRST correct set and swaps to grid 2 (the single forced rejection)", () => {
    const { onWidgetText, onRuleState, verify, stage, select, container } = renderWidget();
    select(GRID1_TARGET);
    fireEvent.click(verify());
    expect(container.querySelector(".pg2-captcha__msg")?.textContent).toBe(
      "Verification failed. Please try again.",
    );
    expect(stage()).toBe("2"); // advanced to grid 2
    expect(onWidgetText).not.toHaveBeenCalled(); // no token yet
    expect(onRuleState).toHaveBeenCalledWith("captcha-human", { stage: 2 });
  });

  it("accepts the correct set on grid 2 and types the token exactly once", () => {
    const { onWidgetText, onRuleState, verify, select, container } = renderWidget();
    select(GRID1_TARGET);
    fireEvent.click(verify()); // forced rejection -> grid 2
    select(GRID2_TARGET);
    fireEvent.click(verify()); // second correct -> success
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("OK-BEEF");
    expect(onRuleState).toHaveBeenLastCalledWith("captcha-human", { stage: 2, solved: true });
    expect(container.querySelector(".pg2-captcha__token")?.textContent).toBe("OK-BEEF");
  });

  it("drives a toggle and the forced rejection through the keyboard path", () => {
    const { onWidgetText, onRuleState, verify, stage, tile, container } = renderWidget();
    const press = (el: HTMLElement, key: string) => fireEvent.keyDown(el, { key });
    // Space flips a tile's pressed state and flips it back — same as the click toggle.
    press(tile(0)!, " ");
    expect(tile(0)?.getAttribute("aria-pressed")).toBe("true");
    press(tile(0)!, " ");
    expect(tile(0)?.getAttribute("aria-pressed")).toBe("false");
    // Select the whole correct grid-1 set by keyboard (Enter and Space both activate).
    press(tile(0)!, "Enter");
    press(tile(2)!, " ");
    press(tile(4)!, "Enter");
    expect(GRID1_TARGET.every((i) => tile(i)?.getAttribute("aria-pressed") === "true")).toBe(true);
    // Verify by keyboard: the first correct set is the single forced rejection -> grid 2.
    press(verify(), "Enter");
    expect(container.querySelector(".pg2-captcha__msg")?.textContent).toBe(
      "Verification failed. Please try again.",
    );
    expect(stage()).toBe("2"); // advanced to grid 2, exactly as the click path does
    expect(onWidgetText).not.toHaveBeenCalled(); // no token yet — the rejection was consumed
    expect(onRuleState).toHaveBeenCalledWith("captcha-human", { stage: 2 });
  });

  it("forces exactly one rejection even after earlier wrong guesses on grid 1", () => {
    const { onWidgetText, verify, stage, select, tile } = renderWidget();
    // A wrong guess first (does not consume the forced rejection).
    select([1]);
    fireEvent.click(verify());
    expect(stage()).toBe("1");
    // Clear the stray selection, then the first CORRECT set — this is the forced reject.
    fireEvent.click(tile(1)!);
    select(GRID1_TARGET);
    fireEvent.click(verify());
    expect(stage()).toBe("2");
    expect(onWidgetText).not.toHaveBeenCalled();
    // The correct set on grid 2 now succeeds.
    select(GRID2_TARGET);
    fireEvent.click(verify());
    expect(onWidgetText).toHaveBeenCalledTimes(1);
    expect(onWidgetText).toHaveBeenCalledWith("OK-BEEF");
  });
});
