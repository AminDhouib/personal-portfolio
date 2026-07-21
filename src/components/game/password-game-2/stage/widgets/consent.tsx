import { useState } from "react";
import type { ConsentPuzzle } from "../../engine/rules/act1";
import type { WidgetChannel } from "./types";

/**
 * The consent-preference wall — a sterile enterprise "Manage your data preferences"
 * panel whose six switches fight back. Clicking a switch flips it; switching one OFF
 * FLIPS its seeded neighbor (the dark pattern: decline one thing and something you had
 * already declined comes back). Driving every switch off enables "Save preferences",
 * which types the seeded passphrase into the password through the widget channel and
 * publishes solved run state. A "Reset to initial" link exists because the flips let a
 * player wedge themselves — reset is the honest way back to the seeded start.
 *
 * Rendered inside the rule card's <button>, so every control is a `[role=switch]` or
 * `[role=button]` div (nested real buttons would be invalid DOM) that stopPropagation
 * so a click never toggles the card, and the global keydown handler ignores these roles
 * so activating a switch never leaks a keystroke into the password. State is component-
 * local and seeded from payload.initial on first render; a re-mount (card collapse then
 * expand) resets progress to `initial`, which is acceptable — the puzzle is short.
 */
export function ConsentWidget({
  ruleId,
  puzzle,
  widget,
}: {
  ruleId: string;
  puzzle: ConsentPuzzle;
  widget: WidgetChannel;
}) {
  const [state, setState] = useState<boolean[]>(() => [...puzzle.initial]);
  const [solved, setSolved] = useState(false);

  const allOff = state.every((b) => !b);

  function clickToggle(i: number) {
    if (solved) return;
    setState((prev) => {
      const next = [...prev];
      const wasOn = next[i] ?? false;
      next[i] = !wasOn;
      if (wasOn) {
        // Only turning a switch OFF disturbs its neighbor, and it FLIPS it.
        const nb = puzzle.neighbor[i] ?? i;
        next[nb] = !(next[nb] ?? false);
      }
      return next;
    });
  }

  function resetToInitial() {
    if (solved) return;
    setState([...puzzle.initial]);
  }

  function save() {
    if (solved || !allOff) return;
    setSolved(true);
    widget.onRuleState(ruleId, { solved: true });
    widget.onWidgetText(puzzle.passphrase);
  }

  const saveEnabled = allOff && !solved;

  return (
    <div className="pg2-consent">
      <p className="pg2-consent__title">Manage your data preferences</p>
      <p className="pg2-consent__sub">Turn off every optional category to continue.</p>
      <div className="pg2-consent__list" role="group" aria-label="Data sharing preferences">
        {puzzle.toggles.map((label, i) => {
          const on = state[i] ?? false;
          return (
            <div key={i} className="pg2-consent__row">
              <span className="pg2-consent__label">{label}</span>
              <div
                role="switch"
                tabIndex={0}
                aria-checked={on}
                aria-label={label}
                data-toggle={i}
                onClick={(e) => {
                  e.stopPropagation();
                  clickToggle(i);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    clickToggle(i);
                  }
                }}
                className={`pg2-consent__switch ${on ? "pg2-consent__switch--on" : "pg2-consent__switch--off"}`}
              >
                <span className="pg2-consent__knob" aria-hidden="true" />
              </div>
            </div>
          );
        })}
      </div>
      <div className="pg2-consent__actions">
        <div
          role="button"
          tabIndex={0}
          aria-label="Save preferences"
          aria-disabled={!saveEnabled}
          data-testid="consent-save"
          onClick={(e) => {
            e.stopPropagation();
            save();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              save();
            }
          }}
          className={`pg2-consent__save ${saveEnabled ? "" : "pg2-consent__save--disabled"}`}
        >
          Save preferences
        </div>
        <div
          role="button"
          tabIndex={0}
          aria-label="Reset to initial"
          data-testid="consent-reset"
          onClick={(e) => {
            e.stopPropagation();
            resetToInitial();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              resetToInitial();
            }
          }}
          className="pg2-consent__reset"
        >
          Reset to initial
        </div>
      </div>
      {solved ? (
        <div className="pg2-consent__done">
          <span className="text-xs text-[color:var(--pg2-muted)]">Confirmation phrase</span>
          <div className="pg2-consent__phrase">{puzzle.passphrase}</div>
        </div>
      ) : null}
    </div>
  );
}
