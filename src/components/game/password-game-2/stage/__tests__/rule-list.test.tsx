import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, within } from "@testing-library/react";
import { RuleList } from "../rule-list";
import type { GameState, Pg2Rule, RuleApi } from "../../engine/types";

const STATE = {} as GameState;
const API: RuleApi = {
  isEventActive: () => false,
  isEventDone: () => false,
  getEventData: () => null,
  ruleState: () => null,
  nowHHMM: () => "12:00",
};

interface Opts {
  passing?: Record<string, boolean>;
  liveEvents?: readonly string[];
  onRuleFlips?: (flips: { regressed: string[]; recovered: string[] }) => void;
}

function rulesFor(ids: string[], passing: Record<string, boolean>): Pg2Rule[] {
  return ids.map((id) => ({
    id,
    act: "prologue" as const,
    description: `Rule ${id}.`,
    validate: () => ({ passed: passing[id] ?? false }),
  }));
}

function listFor(ids: string[], opts: Opts = {}) {
  return (
    <RuleList
      rules={rulesFor(ids, opts.passing ?? {})}
      password=""
      state={STATE}
      api={API}
      onWidgetText={vi.fn()}
      onRuleState={vi.fn()}
      onRuleFlips={opts.onRuleFlips}
      liveEvents={opts.liveEvents ?? []}
      version={0}
      validationTick={0}
    />
  );
}

function renderRuleList(ids: string[], opts: Opts = {}) {
  return render(listFor(ids, opts));
}

const item = (id: string) => document.querySelector<HTMLElement>(`[data-flip-id="${id}"]`)!;
/** The card itself: motion classes live on the button so a FLIP transform on the li cannot mask them. */
const card = (id: string) => item(id).querySelector<HTMLElement>("button")!;

/** jsdom has no AnimationEvent, so build the event by hand and attach the name React reads. */
function endAnimation(el: Element, animationName: string) {
  // React listens under the vendor-prefixed name when the engine lacks unprefixed support
  // (jsdom), so fire both; only the one React subscribed to reaches the handler.
  for (const type of ["animationend", "webkitAnimationEnd"]) {
    const ev = new Event(type, { bubbles: true });
    Object.defineProperty(ev, "animationName", { value: animationName });
    fireEvent(el, ev);
  }
}

afterEach(() => cleanup());

describe("RuleList motion", () => {
  it("a rule card carries its flip id and an entrance marker until the entrance ends", () => {
    const { rerender } = renderRuleList(["r1"]);
    expect(card("r1").className).toContain("pg2-rule-enter");
    endAnimation(card("r1"), "pg2-rule-in");
    expect(card("r1").className).not.toContain("pg2-rule-enter");
    rerender(listFor(["r1", "r2"]));
    expect(card("r1").className).not.toContain("pg2-rule-enter");
    expect(card("r2").className).toContain("pg2-rule-enter");
  });

  it("another animation ending inside the card does not end the entrance", () => {
    renderRuleList(["r1"]);
    endAnimation(card("r1"), "pg2-chess-shake");
    expect(card("r1").className).toContain("pg2-rule-enter");
  });

  it("the status badge renders the number and the check so they can cross-fade", () => {
    renderRuleList(["r1"], { passing: { r1: true } });
    const badge = card("r1").querySelector("[data-badge]")!;
    expect(badge.querySelectorAll("svg").length).toBe(1);
    expect(badge.querySelector(".pg2-badge__num")!.textContent).toBe("1");
    expect(badge.getAttribute("data-state")).toBe("pass");
  });

  it("the badge reports a failing rule as fail", () => {
    renderRuleList(["r1"], { passing: { r1: false } });
    expect(card("r1").querySelector("[data-badge]")!.getAttribute("data-state")).toBe("fail");
  });
});

describe("RuleList regressions", () => {
  it("a rule that regresses shakes and shows why; recovery clears the reason", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true } });
    rerender(listFor(["r1"], { passing: { r1: false }, liveEvents: ["infection"] }));
    expect(card("r1").className).toContain("pg2-rule-shake");
    expect(within(card("r1")).getByText(/Reopened while the infection is active/)).toBeTruthy();
    rerender(listFor(["r1"], { passing: { r1: true } }));
    expect(card("r1").className).not.toContain("pg2-rule-shake");
    expect(within(card("r1")).queryByText(/Reopened/)).toBeNull();
  });

  it("the reason is announced politely", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true } });
    rerender(listFor(["r1"], { passing: { r1: false } }));
    const reason = within(card("r1")).getByText("Your last edit broke this rule");
    expect(reason.getAttribute("role")).toBe("status");
    expect(reason.getAttribute("aria-live")).toBe("polite");
  });

  it("a rule that was never passing neither shakes nor explains itself", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: false } });
    rerender(listFor(["r1"], { passing: { r1: false } }));
    expect(card("r1").className).not.toContain("pg2-rule-shake");
    expect(within(card("r1")).queryByRole("status")).toBeNull();
  });

  it("a freshly revealed failing rule is not a regression", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true } });
    rerender(listFor(["r1", "r2"], { passing: { r1: true, r2: false } }));
    expect(card("r2").className).not.toContain("pg2-rule-shake");
  });

  it("reports flips to the shell once per change, not once per render", () => {
    const onRuleFlips = vi.fn();
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true }, onRuleFlips });
    expect(onRuleFlips).not.toHaveBeenCalled();
    rerender(listFor(["r1"], { passing: { r1: false }, onRuleFlips }));
    expect(onRuleFlips).toHaveBeenCalledTimes(1);
    expect(onRuleFlips).toHaveBeenLastCalledWith({ regressed: ["r1"], recovered: [] });
    rerender(listFor(["r1"], { passing: { r1: false }, onRuleFlips }));
    expect(onRuleFlips).toHaveBeenCalledTimes(1);
    rerender(listFor(["r1"], { passing: { r1: true }, onRuleFlips }));
    expect(onRuleFlips).toHaveBeenCalledTimes(2);
    expect(onRuleFlips).toHaveBeenLastCalledWith({ regressed: [], recovered: ["r1"] });
  });
});
