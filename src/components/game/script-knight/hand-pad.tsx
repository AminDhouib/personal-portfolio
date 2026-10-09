"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionName, Direction, TurnAction } from "./engine/codec";
import type { AbilitySpec } from "./engine/core/ability";
import {
  ABSOLUTE_DIRECTIONS,
  type AbsoluteDirection,
  getAbsoluteDirection,
  RELATIVE_DIRECTIONS,
} from "./engine/spatial";
import { GAME_SURFACE, TOUCH } from "./surface";

const CHIP = `rounded-md border border-(--border) px-3 py-1.5 text-sm text-(--foreground) hover:border-[#4ade80] disabled:opacity-40 ${TOUCH}`;
const CHIP_ARMED = `rounded-md border border-[#4ade80] bg-[#4ade80]/15 px-3 py-1.5 text-sm text-(--foreground) ${TOUCH}`;
const ARROW = `flex h-12 w-12 items-center justify-center rounded-lg border border-(--border) text-(--foreground) hover:border-[#4ade80] disabled:opacity-40 ${TOUCH}`;
const SMALL = `rounded-md border border-(--border) px-3 py-1.5 text-xs text-(--foreground) hover:border-[#4ade80] disabled:opacity-40 ${TOUCH}`;

/** The screen-space cross: which grid cell each absolute direction sits in, and its arrow angle. */
const CROSS: Record<AbsoluteDirection, { cell: string; degrees: number; label: string }> = {
  north: { cell: "col-start-2 row-start-1", degrees: 0, label: "up" },
  east: { cell: "col-start-3 row-start-2", degrees: 90, label: "right" },
  south: { cell: "col-start-2 row-start-3", degrees: 180, label: "down" },
  west: { cell: "col-start-1 row-start-2", degrees: 270, label: "left" },
};

/** One key per action, apart from the WASD keys that steer; digits pick the chips in order. */
export const ACTION_KEYS: Record<ActionName, string> = {
  walk: "g",
  attack: "f",
  rest: "r",
  rescue: "e",
  pivot: "q",
  shoot: "h",
  bind: "b",
  detonate: "x",
};
const STEER_KEYS: Record<string, AbsoluteDirection> = {
  w: "north",
  arrowup: "north",
  d: "east",
  arrowright: "east",
  s: "south",
  arrowdown: "south",
  a: "west",
  arrowleft: "west",
};
const UNDO_KEYS = new Set(["z", "backspace"]);

/** The relative direction that points at screen direction `to` for a warrior facing `facing`. */
export function relativeToward(facing: AbsoluteDirection, to: AbsoluteDirection): Direction {
  const found = RELATIVE_DIRECTIONS.find(
    (relative) => getAbsoluteDirection(relative, facing) === to,
  );
  return found ?? "forward";
}

export type HandCommand =
  { kind: "arm"; name: ActionName } | { kind: "act"; action: TurnAction } | { kind: "undo" };

/**
 * What a key means to the pad, or null when it is none of its keys. Steering keys act with the
 * armed action in the direction they point on screen; an action key arms it (rest acts at once).
 */
export function commandForKey(
  key: string,
  facing: AbsoluteDirection,
  granted: readonly ActionName[],
  armed: ActionName,
): HandCommand | null {
  const lower = key.toLowerCase();
  if (UNDO_KEYS.has(lower)) return { kind: "undo" };
  const steer = STEER_KEYS[lower];
  if (steer) {
    if (armed === "rest") return null;
    return { kind: "act", action: { name: armed, direction: relativeToward(facing, steer) } };
  }
  const byDigit = /^[1-8]$/.test(lower) ? granted[Number(lower) - 1] : undefined;
  const byLetter = granted.find((name) => ACTION_KEYS[name] === lower);
  const name = byDigit ?? byLetter;
  if (!name) return null;
  return name === "rest"
    ? { kind: "act", action: { name: "rest", direction: null } }
    : { kind: "arm", name };
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function Arrow({ degrees }: { degrees: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${degrees}deg)` }}
    >
      <path d="M12 20V5" />
      <path d="M6 11l6-6 6 6" />
    </svg>
  );
}

export interface HandPadProps {
  /** What the floor grants; only the actions get chips. */
  abilities: readonly AbilitySpec[];
  /** Which way the knight faces on screen, so the arrows mean what they point at. */
  facing: AbsoluteDirection;
  /** The hand run is still going: false after a pass or a loss. */
  live: boolean;
  canUndo: boolean;
  onAct: (action: TurnAction) => void;
  onUndo: () => void;
  onRestart: () => void;
  /** Listen for the keyboard (only while the hand mode is the one showing). */
  keyboard: boolean;
}

/**
 * The hand-play pad: a chip for every granted action (tap one to arm it; rest acts at once), and
 * four arrows laid out as they point on screen but meaning forward, right, backward or left for
 * the way the knight faces. An arrow plays the armed action that way. Desktop keys mirror it:
 * WASD or the arrow keys steer, letters (or 1 to 8) pick the action, Z undoes. The page keys are
 * only taken while a hand run is live.
 */
export function HandPad({
  abilities,
  facing,
  live,
  canUndo,
  onAct,
  onUndo,
  onRestart,
  keyboard,
}: HandPadProps) {
  const granted = abilities.filter((ability) => ability.isAction).map((a) => a.name as ActionName);
  const first = granted.includes("walk") ? "walk" : (granted[0] ?? "walk");
  const [chosen, setChosen] = useState<ActionName>(first);
  const armed = granted.includes(chosen) ? chosen : first;

  // The keyboard handler reads the latest of these without re-binding on every render.
  const latest = useRef({ granted, armed, facing, live, onAct, onUndo });
  useEffect(() => {
    latest.current = { granted, armed, facing, live, onAct, onUndo };
  });

  useEffect(() => {
    if (!keyboard) return;
    function onKeyDown(event: KeyboardEvent) {
      const now = latest.current;
      if (!now.live || event.defaultPrevented || event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      const command = commandForKey(event.key, now.facing, now.granted, now.armed);
      if (!command) return;
      // Only a key the pad uses is taken, and only while a hand run is live: arrows and space
      // elsewhere on the page keep scrolling and toggling.
      event.preventDefault();
      if (command.kind === "undo") now.onUndo();
      else if (command.kind === "arm") setChosen(command.name);
      else now.onAct(command.action);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [keyboard]);

  function pickChip(name: ActionName) {
    if (name === "rest") onAct({ name: "rest", direction: null });
    else setChosen(name);
  }

  return (
    <section aria-label="Play by hand" className={`space-y-3 rounded-lg p-3 ${GAME_SURFACE}`}>
      <div role="group" aria-label="Actions" className="flex flex-wrap gap-2">
        {granted.map((name, index) => (
          <button
            key={name}
            type="button"
            aria-pressed={name === "rest" ? undefined : name === armed}
            aria-keyshortcuts={`${ACTION_KEYS[name].toUpperCase()} ${index + 1}`}
            disabled={!live}
            onClick={() => pickChip(name)}
            className={name === armed && name !== "rest" ? CHIP_ARMED : CHIP}
          >
            {name === "rest" ? "Rest" : name[0]?.toUpperCase() + name.slice(1)}
          </button>
        ))}
      </div>
      <div
        role="group"
        aria-label="Directions"
        className="mx-auto grid w-max grid-cols-3 grid-rows-3 gap-1.5"
      >
        {ABSOLUTE_DIRECTIONS.map((to) => {
          const relative = relativeToward(facing, to);
          const spot = CROSS[to];
          return (
            <button
              key={to}
              type="button"
              disabled={!live || armed === "rest"}
              aria-label={`${armed[0]?.toUpperCase()}${armed.slice(1)} ${relative}`}
              title={`${relative} (${spot.label})`}
              onClick={() => onAct({ name: armed, direction: relative })}
              className={`${ARROW} ${spot.cell}`}
            >
              <Arrow degrees={spot.degrees} />
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!canUndo} onClick={onUndo} className={SMALL}>
          Undo
        </button>
        <button type="button" onClick={onRestart} className={SMALL}>
          Start over
        </button>
      </div>
    </section>
  );
}
