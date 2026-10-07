"use client";

import { useEffect, useRef } from "react";
import type { GameState, PointerTarget } from "../engine/types";
import type { GardenData } from "../engine/events/garden";
import type { CampfireData } from "../engine/events/campfire";

export interface HudAction {
  id: string;
  label: string;
  /** What the chip sends to the engine on activation. */
  target: PointerTarget;
  /** Family accent while the chip is lit. */
  color: string;
  /** Dimmed (cooldown / nothing to act on). Still clickable: the engine consumes the press. */
  idle: boolean;
  /** Campfire only: bumps every few stokes, and the chip hops when it does. */
  hops: number;
  /** Short caption left of a dimmed chip. */
  note?: string;
}

const GREEN = "#4ade80";
const GARDEN_GREEN = "#16a34a";
const FIRE = "#f59e0b";

/** The live action chips, in a fixed order (gerald, garden, campfire). */
export function hudActions(g: GameState): HudAction[] {
  const live = (defId: string) =>
    g.events.find(
      (e) =>
        e.defId === defId && e.data !== undefined && e.phase !== "telegraph" && e.phase !== "done",
    );
  const out: HudAction[] = [];

  if (live("gerald")) {
    out.push({
      id: "gerald",
      label: "FEED",
      target: { kind: "feed-button" },
      color: GREEN,
      idle: false,
      hops: 0,
    });
  }

  const garden = live("garden");
  if (garden) {
    const active = (garden.data as GardenData).bearState !== "away";
    out.push({
      id: "garden",
      label: active ? "THROW BASKET" : "BASKET",
      target: { kind: "basket-button" },
      color: active ? GARDEN_GREEN : GREEN,
      idle: !active,
      hops: 0,
      note: active ? undefined : "bear away",
    });
  }

  const campfire = live("campfire");
  if (campfire) {
    const d = campfire.data as CampfireData;
    out.push({
      id: "campfire",
      label: "STOKE",
      target: { kind: "stoke-button" },
      color: FIRE,
      idle: g.elapsedMs < d.stokeReadyAtMs,
      hops: d.buttonHops,
    });
  }
  return out;
}

const HOP_MS = 360;
const HOP_PX = 8;

function ActionChip({
  action,
  onAction,
}: {
  action: HudAction;
  onAction: (t: PointerTarget) => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const seenHops = useRef(action.hops);

  // The campfire's STOKE chip hops when its counter moves: a deliberate dark pattern
  // (the button you are chasing relocates). WAAPI rather than a remount, so a keyboard
  // user keeps focus on the chip while it jumps.
  useEffect(() => {
    if (seenHops.current === action.hops) return;
    seenHops.current = action.hops;
    const el = ref.current;
    if (el && typeof el.animate === "function") {
      el.animate(
        [
          { transform: "translateY(0)" },
          { transform: `translateY(-${HOP_PX}px)`, offset: 0.5 },
          { transform: "translateY(0)" },
        ],
        { duration: HOP_MS, easing: "ease-out" },
      );
    }
  }, [action.hops]);

  return (
    <span className="inline-flex items-center gap-1.5">
      {action.note ? (
        <span className="text-[10px] font-semibold text-[color:var(--pg2-muted)]">
          {action.note}
        </span>
      ) : null}
      <button
        ref={ref}
        type="button"
        data-action={action.id}
        // A pointer press must not steal focus from the hidden input, or the soft
        // keyboard collapses; the click still fires and Tab/Enter still work.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onAction(action.target)}
        style={action.idle ? undefined : { backgroundColor: action.color }}
        className={`pg2-hudchip inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-3 text-[13px] font-bold ${
          action.idle ? "pg2-hudchip--idle" : "pg2-hudchip--ready"
        }`}
      >
        {action.label}
      </button>
    </span>
  );
}

/**
 * The event action chips (feed / basket / stoke) as real buttons. They replace the
 * canvas-drawn chips, so a keyboard or screen-reader player can act on the creatures
 * and every chip is a 44 px target. Renders nothing when no chip event is live.
 */
export function HudActions({
  g,
  onAction,
}: {
  g: GameState;
  onAction: (target: PointerTarget) => void;
}) {
  const actions = hudActions(g);
  if (actions.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {actions.map((a) => (
        <ActionChip key={a.id} action={a} onAction={onAction} />
      ))}
    </div>
  );
}
