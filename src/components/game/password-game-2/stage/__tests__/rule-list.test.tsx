import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RuleList } from "../rule-list";
import type { ColorMatch } from "../../engine/rules/act2";
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
  password?: string;
  passing?: Record<string, boolean>;
  liveEvents?: readonly string[];
  runId?: number;
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
      password={opts.password ?? ""}
      state={STATE}
      api={API}
      onWidgetText={vi.fn()}
      onRuleState={vi.fn()}
      onRuleFlips={opts.onRuleFlips}
      liveEvents={opts.liveEvents ?? []}
      version={0}
      validationTick={0}
      runId={opts.runId}
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
  const reasonIn = (id: string) => item(id).querySelector(".pg2-rule-reason");
  const announcer = () => document.querySelector("[data-testid='pg2-rule-announcer']")!;

  it("a rule that regresses after an edit shakes and shows why; recovery clears it all", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true } });
    rerender(listFor(["r1"], { passing: { r1: false }, liveEvents: ["infection"], password: "a" }));
    expect(card("r1").className).toContain("pg2-rule-shake");
    expect(reasonIn("r1")!.textContent).toBe("Reopened while the infection is active");
    expect(announcer().textContent).toContain("Reopened while the infection is active");
    rerender(listFor(["r1"], { passing: { r1: true }, password: "" }));
    expect(card("r1").className).not.toContain("pg2-rule-shake");
    expect(reasonIn("r1")).toBeNull();
    expect(announcer().textContent).toBe("");
  });

  it("the live region is one polite node outside every card, empty at mount", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true } });
    expect(announcer().textContent).toBe("");
    expect(announcer().getAttribute("aria-live")).toBe("polite");
    expect(announcer().closest("button")).toBeNull();
    rerender(listFor(["r1"], { passing: { r1: false }, password: "a" }));
    expect(announcer().textContent).toContain("This rule is no longer satisfied");
    expect(document.querySelectorAll("[role='status']")).toHaveLength(1);
    expect(reasonIn("r1")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("a flip with no player edit (the clock, a coupled rule) only recolours", () => {
    const onRuleFlips = vi.fn();
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true }, onRuleFlips });
    rerender(listFor(["r1"], { passing: { r1: false }, onRuleFlips }));
    expect(card("r1").className).not.toContain("pg2-rule-shake");
    expect(reasonIn("r1")).toBeNull();
    expect(announcer().textContent).toBe("");
    expect(onRuleFlips).not.toHaveBeenCalled();
  });

  it("a rule that was never passing neither shakes nor explains itself", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: false } });
    rerender(listFor(["r1"], { passing: { r1: false }, password: "a" }));
    expect(card("r1").className).not.toContain("pg2-rule-shake");
    expect(reasonIn("r1")).toBeNull();
  });

  it("a freshly revealed failing rule is not a regression", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true } });
    rerender(listFor(["r1", "r2"], { passing: { r1: true, r2: false }, password: "a" }));
    expect(card("r2").className).not.toContain("pg2-rule-shake");
  });

  it("reports edit-driven flips once per change, not once per render", () => {
    const onRuleFlips = vi.fn();
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true }, onRuleFlips });
    expect(onRuleFlips).not.toHaveBeenCalled();
    rerender(listFor(["r1"], { passing: { r1: false }, onRuleFlips, password: "a" }));
    expect(onRuleFlips).toHaveBeenCalledTimes(1);
    expect(onRuleFlips).toHaveBeenLastCalledWith({ regressed: ["r1"], recovered: [] });
    rerender(listFor(["r1"], { passing: { r1: false }, onRuleFlips, password: "a" }));
    expect(onRuleFlips).toHaveBeenCalledTimes(1);
    rerender(listFor(["r1"], { passing: { r1: true }, onRuleFlips, password: "" }));
    expect(onRuleFlips).toHaveBeenCalledTimes(2);
    expect(onRuleFlips).toHaveBeenLastCalledWith({ regressed: [], recovered: ["r1"] });
  });

  it("a regression during the entrance does not replay the entrance afterwards", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true } });
    expect(card("r1").className).toContain("pg2-rule-enter");
    rerender(listFor(["r1"], { passing: { r1: false }, password: "a" }));
    expect(card("r1").className).toContain("pg2-rule-shake");
    expect(card("r1").className).not.toContain("pg2-rule-enter");
    endAnimation(card("r1"), "pg2-rule-shake");
    expect(card("r1").className).not.toContain("pg2-rule-shake");
    expect(card("r1").className).not.toContain("pg2-rule-enter");
  });
});

describe("RuleList widget input, recoveries and restarts", () => {
  const announcer = () => document.querySelector("[data-testid='pg2-rule-announcer']")!;
  const reasonIn = (id: string) => item(id).querySelector(".pg2-rule-reason");

  const PUZZLE: ColorMatch = {
    name: "crimson",
    hex: "#dc143c",
    options: [
      { name: "teal", hex: "#008080" },
      { name: "crimson", hex: "#dc143c" },
    ],
  };

  /** One color-widget rule whose pass state the test flips from outside; the widget is open. */
  function widgetList(flag: { passed: boolean }, onRuleFlips?: (f: unknown) => void) {
    const rule: Pg2Rule = {
      id: "w1",
      act: "act2",
      description: "Widget rule.",
      payload: { color: PUZZLE },
      validate: () => ({ passed: flag.passed }),
    };
    return (
      <RuleList
        rules={[rule]}
        password=""
        state={STATE}
        api={API}
        onWidgetText={vi.fn()}
        onRuleState={() => {}}
        onRuleFlips={onRuleFlips}
        liveEvents={[]}
        version={0}
        validationTick={0}
      />
    );
  }

  it("a widget pass cues even though the password text did not change", () => {
    const flag = { passed: false };
    const onRuleFlips = vi.fn();
    const { getByLabelText } = render(widgetList(flag, onRuleFlips));
    flag.passed = true;
    fireEvent.click(getByLabelText("crimson"));
    expect(onRuleFlips).toHaveBeenCalledWith({ regressed: [], recovered: ["w1"] });
  });

  it("a widget-driven regression shakes and gives a reason", () => {
    const flag = { passed: true };
    const { getByLabelText } = render(widgetList(flag));
    fireEvent.click(card("w1")); // expand the passing card so its widget shows
    flag.passed = false;
    fireEvent.click(getByLabelText("crimson"));
    expect(card("w1").className).toContain("pg2-rule-shake");
    expect(reasonIn("w1")!.textContent).toBe("This rule is no longer satisfied");
  });

  it("a pure heartbeat flip still only recolours, while its recovery still cues", () => {
    const onRuleFlips = vi.fn();
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true }, onRuleFlips });
    rerender(listFor(["r1"], { passing: { r1: false }, onRuleFlips }));
    expect(onRuleFlips).not.toHaveBeenCalled();
    rerender(listFor(["r1"], { passing: { r1: true }, onRuleFlips }));
    expect(onRuleFlips).toHaveBeenCalledWith({ regressed: [], recovered: ["r1"] });
  });

  it("announces which rule regressed, and says it again for the next regression", () => {
    const { rerender } = renderRuleList(["r1", "r2"], { passing: { r1: true, r2: true } });
    rerender(listFor(["r1", "r2"], { passing: { r1: true, r2: false }, password: "a" }));
    expect(announcer().textContent).toBe("Rule 2: This rule is no longer satisfied");
    rerender(listFor(["r1", "r2"], { passing: { r1: true, r2: true }, password: "" }));
    expect(announcer().textContent).toBe("");
    rerender(listFor(["r1", "r2"], { passing: { r1: true, r2: false }, password: "b" }));
    expect(announcer().textContent).toBe("Rule 2: This rule is no longer satisfied");
  });

  it("a new runId with the same rule ids starts the cards fresh", () => {
    const { rerender } = renderRuleList(["r1"], { passing: { r1: true }, runId: 1 });
    endAnimation(card("r1"), "pg2-rule-in");
    expect(card("r1").className).not.toContain("pg2-rule-enter");
    rerender(listFor(["r1"], { passing: { r1: false }, password: "a", runId: 1 }));
    expect(card("r1").className).toContain("pg2-rule-shake");
    rerender(listFor(["r1"], { passing: { r1: true }, password: "", runId: 2 }));
    expect(card("r1").className).not.toContain("pg2-rule-shake");
    expect(card("r1").className).toContain("pg2-rule-enter");
    expect(announcer().textContent).toBe("");
  });
});
