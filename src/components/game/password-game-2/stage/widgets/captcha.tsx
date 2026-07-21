import { useState } from "react";
import type { CaptchaChallenge, CaptchaKind } from "../../engine/rules/prologue";
import type { WidgetChannel } from "./types";

/** Plural label for the prompt ("Select all tiles containing ..."). */
const KIND_LABEL: Record<CaptchaKind, string> = {
  "traffic-light": "traffic lights",
  crosswalk: "crosswalks",
  storefront: "storefronts",
};

/** Per-tile accessible name. */
const KIND_ARIA: Record<CaptchaKind, string> = {
  "traffic-light": "Traffic light",
  crosswalk: "Crosswalk",
  storefront: "Storefront",
};

/** The one rejection copy, shared by the forced gag and by a genuinely wrong set. */
const REJECT_MESSAGE = "Verification failed. Please try again.";

/** Simple inline vector art per kind — primitives only, no emoji, no external asset. */
function TileArt({ kind }: { kind: CaptchaKind }) {
  switch (kind) {
    case "traffic-light":
      return (
        <svg viewBox="0 0 48 48" className="pg2-captcha__art" aria-hidden="true">
          <rect x="17" y="5" width="14" height="38" rx="4" fill="#1f2937" />
          <circle cx="24" cy="14" r="4.4" fill="#ef4444" />
          <circle cx="24" cy="24" r="4.4" fill="#f59e0b" />
          <circle cx="24" cy="34" r="4.4" fill="#22c55e" />
        </svg>
      );
    case "crosswalk":
      return (
        <svg viewBox="0 0 48 48" className="pg2-captcha__art" aria-hidden="true">
          <rect x="0" y="0" width="48" height="48" fill="#64748b" />
          <rect x="7" y="6" width="6" height="36" fill="#f8fafc" />
          <rect x="17" y="6" width="6" height="36" fill="#f8fafc" />
          <rect x="27" y="6" width="6" height="36" fill="#f8fafc" />
          <rect x="37" y="6" width="6" height="36" fill="#f8fafc" />
        </svg>
      );
    case "storefront":
      return (
        <svg viewBox="0 0 48 48" className="pg2-captcha__art" aria-hidden="true">
          <rect
            x="8"
            y="21"
            width="32"
            height="21"
            fill="#e5e7eb"
            stroke="#334155"
            strokeWidth="1"
          />
          <rect x="6" y="12" width="36" height="9" fill="#0ea5e9" />
          <rect
            x="12"
            y="26"
            width="7"
            height="7"
            fill="#93c5fd"
            stroke="#334155"
            strokeWidth="1"
          />
          <rect
            x="29"
            y="26"
            width="7"
            height="7"
            fill="#93c5fd"
            stroke="#334155"
            strokeWidth="1"
          />
          <rect x="21" y="28" width="6" height="14" fill="#334155" />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * The rejecting image CAPTCHA. Every tile, the target kind, and the token come from
 * the seeded payload; only the selection, the stage, and the solved flag are local.
 *
 * The gag: the FIRST correct submission (which lands on grid 1) is rejected anyway
 * and swaps in a fresh grid; the SECOND correct submission (grid 2) succeeds and
 * types the token. A wrong submission is rejected too but never advances the stage,
 * so it cannot consume the single forced rejection.
 *
 * Rendered inside the rule card's <button>, so every control is a `[role=button]`
 * div (nested real buttons would be invalid DOM) that stopPropagation so a click
 * never toggles the card, and the global keydown handler ignores role=button so
 * activating a tile never leaks a keystroke into the password.
 */
export function CaptchaWidget({
  ruleId,
  challenge,
  widget,
}: {
  ruleId: string;
  challenge: CaptchaChallenge;
  widget: WidgetChannel;
}) {
  const [stage, setStage] = useState(0); // 0 = grid 1, 1 = grid 2
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const [message, setMessage] = useState<string | null>(null);
  const [solved, setSolved] = useState(false);

  const grid = challenge.grids[stage] ?? [];
  const target = challenge.target;

  function toggle(i: number) {
    if (solved) return;
    setMessage(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function selectionIsCorrect(): boolean {
    const correct = new Set<number>();
    grid.forEach((tile, i) => {
      if (tile.kind === target) correct.add(i);
    });
    if (correct.size !== selected.size) return false;
    for (const i of selected) if (!correct.has(i)) return false;
    return true;
  }

  function verify() {
    if (solved) return;
    if (!selectionIsCorrect()) {
      setMessage(REJECT_MESSAGE); // wrong set — rejected, stage unchanged
      return;
    }
    if (stage === 0) {
      // The forced rejection: a correct answer is rejected once, a new grid loaded.
      setStage(1);
      setSelected(new Set());
      setMessage(REJECT_MESSAGE);
      widget.onRuleState(ruleId, { stage: 2 });
      return;
    }
    // Correct on grid 2 — the challenge finally yields its token.
    setSolved(true);
    setMessage(null);
    widget.onRuleState(ruleId, { stage: 2, solved: true });
    widget.onWidgetText(challenge.token);
  }

  if (solved) {
    return (
      <div className="pg2-captcha" data-stage="done">
        <p className="pg2-captcha__done">Verification complete.</p>
        <span className="text-xs text-[color:var(--pg2-muted)]">Confirmation code</span>
        <div className="pg2-captcha__token">{challenge.token}</div>
      </div>
    );
  }

  return (
    <div className="pg2-captcha" data-stage={stage + 1}>
      <p className="pg2-captcha__prompt">Select all tiles containing {KIND_LABEL[target]}</p>
      <div className="pg2-captcha__grid" role="group" aria-label="Verification tiles">
        {grid.map((tile, i) => {
          const isSelected = selected.has(i);
          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={KIND_ARIA[tile.kind]}
              aria-pressed={isSelected}
              data-index={i}
              onClick={(e) => {
                e.stopPropagation();
                toggle(i);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  toggle(i);
                }
              }}
              className={`pg2-captcha__tile ${isSelected ? "pg2-captcha__tile--selected" : ""}`}
            >
              <TileArt kind={tile.kind} />
            </div>
          );
        })}
      </div>
      <div className="pg2-captcha__actions">
        <div
          role="button"
          tabIndex={0}
          aria-label="Verify"
          data-testid="captcha-verify"
          onClick={(e) => {
            e.stopPropagation();
            verify();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              verify();
            }
          }}
          className="pg2-captcha__verify"
        >
          Verify
        </div>
        {message ? (
          <p className="pg2-captcha__msg" role="status">
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
