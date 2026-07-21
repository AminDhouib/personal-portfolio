import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { applyKey, createRun, makeRuleApi } from "../../engine/engine";
import { cellsToPassword } from "../../engine/cells";
import { CharStage } from "../char-stage";
import { RuleList } from "../rule-list";
import { Hud } from "../hud";

// Presentational-layer smoke tests: the leaf stage components render against a
// real engine run without a router or matchMedia (which the full shell needs).
// This exercises the char cells, caret, rule cards, and HUD formatting.
describe("pg2 stage smoke", () => {
  it("renders one DOM cell per character plus a caret", () => {
    const g = createRun({ seed: 42, daily: false, nowHHMM: () => "12:00" });
    for (const k of "Hello9") applyKey(g, k);
    const { container, unmount } = render(
      <CharStage cells={g.cells} caret={g.caret} onCellClick={() => {}} onBoxClick={() => {}} />,
    );
    expect(container.querySelectorAll("[data-cell-id]").length).toBe(g.cells.length);
    expect(container.querySelector(".pg2-caret")).not.toBeNull();
    unmount();
  });

  it("renders the rule list and HUD without crashing", () => {
    const g = createRun({ seed: 7, daily: false, nowHHMM: () => "13:37" });
    const api = makeRuleApi(g, () => "13:37");
    const password = cellsToPassword(g.cells);
    const { getByText, unmount } = render(
      <>
        <Hud
          elapsedMs={65_000}
          act={g.act}
          seed={7}
          soundOn={false}
          onToggleSound={() => {}}
          onCopySeed={() => {}}
        />
        <RuleList
          rules={g.rules}
          password={password}
          state={g}
          api={api}
          onWidgetText={() => {}}
          onRuleState={() => {}}
          version={g.version}
          validationTick={0}
        />
      </>,
    );
    expect(getByText("01:05")).toBeTruthy(); // mm:ss timer format
    expect(getByText("seed 7")).toBeTruthy();
    unmount();
  });
});
