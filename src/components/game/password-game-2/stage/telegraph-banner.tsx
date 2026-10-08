"use client";

import type { CSSProperties } from "react";
import type { GameState } from "../engine/types";
import { FAMILY_TINT, activeTelegraphs, telegraphLabel } from "./telegraph";

/** The campfire's FUEL meter owns the left of the bottom band while the fire is lit. */
function fuelMeterShown(g: GameState): boolean {
  return g.events.some(
    (e) =>
      e.defId === "campfire" &&
      e.data !== undefined &&
      e.phase !== "telegraph" &&
      e.phase !== "done",
  );
}

/**
 * The telegraph beat, made visible: while any event winds up, a banner in the reserved
 * band under the password names the threat and counts down to it in the family colour.
 * It is an overlay inside a band that is always reserved, so it never moves the box or
 * the rules (the phone keyboard sheet depends on that). The countdown is visual only;
 * the polite announcer beside it carries the label alone, so a screen reader hears each
 * event once and not on every heartbeat.
 */
export function TelegraphBanner({ g }: { g: GameState }) {
  const telegraphs = activeTelegraphs(g.events);
  const next = telegraphs[0];

  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="false" className="sr-only">
        {telegraphs.map((t) => (
          <span key={t.defId}>{`${telegraphLabel(t.defId)}. `}</span>
        ))}
      </p>
      {next ? (
        <div
          data-testid="pg2-telegraph"
          data-family={next.family}
          aria-hidden="true"
          className={
            fuelMeterShown(g) ? "pg2-telegraph pg2-telegraph--beside-meter" : "pg2-telegraph"
          }
          style={{ "--pg2-tg": FAMILY_TINT[next.family] } as CSSProperties}
        >
          <span className="pg2-telegraph__dot" />
          <span className="pg2-telegraph__label">{telegraphLabel(next.defId)}</span>
          <span className="pg2-telegraph__count">{Math.ceil(next.remainingMs / 1000)}</span>
        </div>
      ) : null}
    </>
  );
}
