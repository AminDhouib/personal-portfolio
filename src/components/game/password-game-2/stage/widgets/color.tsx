import { useState } from "react";
import type { ColorMatch, ColorOption } from "../../engine/rules/act2";
import type { WidgetChannel } from "./types";

/**
 * The color-match eyedropper. The seeded true color is shown as a big, deliberately
 * UNLABELED swatch (aria-label "mystery color swatch"): its name never appears in the
 * card until the puzzle is solved, so a sighted player must read the hue and a screen
 * reader gets only the generic label. Below it sits the seeded candidate row — the
 * true color among five decoys, each a role=button swatch aria-labelled by its own
 * name. Clicking the candidate whose hue MATCHES the mystery swatch types that color's
 * lowercase name into the password through the widget channel and marks the rule solved;
 * clicking any other candidate shakes and types nothing. The name asymmetry is intended:
 * the label names each candidate (so the picker is name-addressable), but which one is
 * correct is only knowable by matching hue, so the answer never leaks as DOM text.
 *
 * Rendered inside the rule card's <button>, so every control is a `[role=button]` div
 * (nested real buttons would be invalid DOM) that stopPropagation so a click never
 * toggles the card, and the global keydown handler ignores role=button so activating a
 * swatch never leaks a keystroke into the password. State is component-local; a re-mount
 * (card collapse then expand) resets to unsolved, which is acceptable — one correct
 * click re-solves it.
 */
export function ColorSwatch({
  ruleId,
  puzzle,
  widget,
}: {
  ruleId: string;
  puzzle: ColorMatch;
  widget: WidgetChannel;
}) {
  const [solved, setSolved] = useState(false);
  const [shake, setShake] = useState<string | null>(null);

  function pick(option: ColorOption) {
    if (solved) return;
    if (option.name === puzzle.name) {
      setSolved(true);
      setShake(null);
      widget.onRuleState(ruleId, { solved: true });
      widget.onWidgetText(puzzle.name);
      return;
    }
    // A hue that does not match the mystery swatch is a dead click: shake, type nothing.
    setShake(option.name);
  }

  return (
    <div className="pg2-color">
      <div
        className="pg2-color__swatch"
        role="img"
        aria-label="mystery color swatch"
        style={{ background: puzzle.hex }}
      />
      <p className="pg2-color__prompt">Match the accent swatch, then name it.</p>
      <div className="pg2-color__options" role="group" aria-label="Candidate colors">
        {puzzle.options.map((opt) => {
          const isPicked = solved && opt.name === puzzle.name;
          const isShake = shake === opt.name;
          return (
            <div
              key={opt.name}
              role="button"
              tabIndex={0}
              aria-label={opt.name}
              aria-pressed={isPicked}
              data-color={opt.name}
              onClick={(e) => {
                e.stopPropagation();
                pick(opt);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  pick(opt);
                }
              }}
              className={`pg2-color__option ${isPicked ? "pg2-color__option--picked" : ""} ${isShake ? "pg2-color__option--shake" : ""}`}
              style={{ background: opt.hex }}
            />
          );
        })}
      </div>
      {solved ? (
        <div className="pg2-color__done">
          <span className="text-xs text-[color:var(--pg2-muted)]">Color name</span>
          <div className="pg2-color__name">{puzzle.name}</div>
        </div>
      ) : null}
    </div>
  );
}
