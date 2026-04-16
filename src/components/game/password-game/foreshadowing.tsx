"use client";

import { useEffect, useState } from "react";
import { mulberry32, pickOne } from "./prng";

export type ForeshadowKind = "nudge" | "gaslighter" | "peek" | "rumble";

export function pickForeshadow(seed: number): ForeshadowKind {
  const rng = mulberry32((seed ^ 0xb5297a4d) >>> 0);
  return pickOne(rng, ["nudge", "gaslighter", "peek", "rumble"] as const);
}

/** Triggers an effect once after the player has satisfied N rules. */
export function useForeshadowTrigger(satisfiedCount: number, triggerAt: number) {
  const [fired, setFired] = useState(false);
  useEffect(() => {
    if (!fired && satisfiedCount >= triggerAt) setFired(true);
  }, [satisfiedCount, triggerAt, fired]);
  return fired;
}

/** Renders the active foreshadowing overlay once triggered. */
export function ForeshadowOverlay({
  kind,
  active,
  containerRef,
}: {
  kind: ForeshadowKind;
  active: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
}) {
  if (!active) return null;
  switch (kind) {
    case "nudge":
      return <NudgeEffect containerRef={containerRef} />;
    case "gaslighter":
      return <GaslighterEffect />;
    case "peek":
      return <PeekEffect />;
    case "rumble":
      return <RumbleEffect />;
  }
}

function NudgeEffect({ containerRef }: { containerRef: React.RefObject<HTMLElement | null> }) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const orig = el.style.transform;
    el.style.transition = "transform 0.35s ease-out";
    el.style.transform = "translateX(14px)";
    const t = window.setTimeout(() => {
      if (el) {
        el.style.transform = orig;
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [containerRef]);
  return null;
}

function GaslighterEffect() {
  return (
    <div aria-hidden className="pg-foreshadow-gaslight" />
  );
}

function PeekEffect() {
  return (
    <div aria-hidden className="pg-foreshadow-peek">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <ellipse cx="12" cy="12" rx="10" ry="6" fill="#fff" stroke="#000" strokeWidth="1" />
        <circle cx="12" cy="12" r="3" fill="#000" />
        <circle cx="13" cy="11" r="1" fill="#fff" />
      </svg>
    </div>
  );
}

function RumbleEffect() {
  useEffect(() => {
    document.body.animate(
      [
        { transform: "translate(0, 0)" },
        { transform: "translate(-2px, 1px)" },
        { transform: "translate(2px, -1px)" },
        { transform: "translate(-1px, 2px)" },
        { transform: "translate(0, 0)" },
      ],
      { duration: 350, iterations: 1 }
    );
  }, []);
  return null;
}
