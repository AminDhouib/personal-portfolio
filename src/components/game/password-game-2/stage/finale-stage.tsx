"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FinalePhaseId, GameState, PointerTarget } from "../engine/types";
import {
  effectiveCheckboxPara,
  survivingParagraphs,
  type EulaData,
  type MissilesData,
  type RunawayData,
} from "../engine/events/finale";

/**
 * Password Game 2 — the finale stage.
 *
 * The boss gauntlet's DOM layer, mounted while `g.act === "finale"` and the run is
 * still playing. Phase 1's missiles are drawn by the canvas overlay (and intercepted
 * through its hit regions); this component adds the corporate-dread chrome around
 * them and owns phases 2 and 3 outright: the EULA scroll with its one real checkbox
 * buried among decoys, and the Submit button that flees the cursor. The engine owns
 * all outcomes — a knockback, a burn, the bear's tackle, the win — so every handler
 * here just routes a pointer and lets `finale.ts` decide what it means.
 */

interface FinaleStageProps {
  g: GameState;
  onPointer: (target: PointerTarget) => void;
}

const PHASE_LABEL: Record<FinalePhaseId, { n: number; sub: string }> = {
  missiles: { n: 1, sub: "Incoming Fire" },
  eula: { n: 2, sub: "The Agreement" },
  runaway: { n: 3, sub: "The Button" },
};

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!mq) return;
    const update = () => setReduced(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function FinaleStage({ g, onPointer }: FinaleStageProps) {
  const reduced = useReducedMotion();
  const finale = g.finale;
  const phase: FinalePhaseId = finale?.phase ?? "missiles";
  const label = PHASE_LABEL[phase];
  const allies = finale?.allies ?? [];

  return (
    <div className="pg2-finale">
      <div className="pg2-finale__banner">
        <span className="pg2-finale__kicker">The Submission — Phase {label.n} of 3</span>
        <span className="pg2-finale__title">{label.sub}</span>
      </div>

      {phase === "missiles" ? <MissilesPhase g={g} allies={allies} reduced={reduced} /> : null}
      {phase === "eula" ? <EulaPhase g={g} allies={allies} onPointer={onPointer} /> : null}
      {phase === "runaway" ? (
        <RunawayPhase g={g} allies={allies} onPointer={onPointer} reduced={reduced} />
      ) : null}
    </div>
  );
}

// --- ally badges -------------------------------------------------------------

function GeraldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 12c3-5 9-5 12 0-3 5-9 5-12 0z" fill="currentColor" />
      <path d="M15 12l5-3v6l-5-3z" fill="currentColor" />
      <circle cx="7" cy="11" r="1.1" fill="#fff" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3c1 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 0 1.5 1 2 2 2-1.5-2 0-5 1-7z"
        fill="currentColor"
      />
    </svg>
  );
}

function BearIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="6" cy="6" r="2.4" fill="currentColor" />
      <circle cx="18" cy="6" r="2.4" fill="currentColor" />
      <circle cx="12" cy="13" r="7" fill="currentColor" />
      <circle cx="9.5" cy="12" r="1" fill="#fff" />
      <circle cx="14.5" cy="12" r="1" fill="#fff" />
    </svg>
  );
}

function AllyBadge({ kind }: { kind: "gerald" | "campfire" | "garden" }) {
  const map = {
    gerald: { icon: <GeraldIcon />, text: "Gerald on duty", cls: "pg2-ally--gerald" },
    campfire: { icon: <FlameIcon />, text: "Campfire standing by", cls: "pg2-ally--campfire" },
    garden: { icon: <BearIcon />, text: "The bear is watching", cls: "pg2-ally--garden" },
  } as const;
  const a = map[kind];
  return (
    <span className={`pg2-ally ${a.cls}`}>
      {a.icon}
      {a.text}
    </span>
  );
}

// --- phase 1: missiles -------------------------------------------------------

function MissilesPhase({
  g,
  allies,
  reduced,
}: {
  g: GameState;
  allies: readonly string[];
  reduced: boolean;
}) {
  const stunRef = useRef<HTMLDivElement | null>(null);

  // Drive the landing-stun vignette straight off g.inputLocked each frame so it
  // flashes the instant a missile lands, ahead of the shell's 250ms heartbeat.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = stunRef.current;
      if (el) el.style.opacity = g.inputLocked ? "1" : "0";
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [g]);

  const missiles = (g.finale?.data.missiles as MissilesData | undefined) ?? null;
  const landings = missiles?.landedThisAttempt ?? 0;

  return (
    <div className="pg2-alert" aria-live="polite">
      <div className={`pg2-alert-vignette${reduced ? "pg2-alert-vignette--still" : ""}`} />
      <div ref={stunRef} className="pg2-stun" aria-hidden="true" />

      <p className="pg2-alert__lede">
        The form is defending itself. Click the incoming payloads to intercept them before four get
        through.
      </p>

      <div className="pg2-impacts">
        <span className="pg2-impacts__label">Impacts</span>
        <span className="pg2-impacts__dots" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`pg2-impacts__dot${i < landings ? "pg2-impacts__dot--hit" : ""}`}
            />
          ))}
        </span>
        <span className="pg2-impacts__count">{landings} / 4</span>
      </div>

      {allies.includes("gerald") ? (
        <div className="pg2-ally-row">
          <AllyBadge kind="gerald" />
        </div>
      ) : null}
    </div>
  );
}

// --- phase 2: EULA -----------------------------------------------------------

/** Twelve base clauses of corporate legalese, cycled to fill the 24-paragraph scroll. */
const EULA_CLAUSES: readonly string[] = [
  "You, the Signatory, grant SignetID a perpetual, irrevocable, galaxy-wide license to your password, your enthusiasm, and any passwords you may conceive of in the future.",
  "The Service is provided “as is,” “as was,” and “as it briefly appeared to you in a dream.” No warranty is made that the Service exists at the time of reading.",
  "By scrolling, you accept. By not scrolling, you accept more firmly. Ceasing to read constitutes vigorous, notarized consent.",
  "You agree not to reverse-engineer, decompile, or think too hard about the Service, its mascot, or the reasons this form is behaving the way it is.",
  "SignetID may, at its sole discretion, revise these Terms, your password, your username, and your recollection of ever having read this clause.",
  "In the event of a dispute, both parties agree to binding arbitration conducted by a coin that SignetID keeps in a drawer for exactly this purpose.",
  "You represent and warrant that you are a natural person, a legal person, or at minimum a person-shaped arrangement of outstanding obligations.",
  "The Signatory waives all rights to a refund, a re-do, a good night’s sleep, and the phrase “this seems excessive.”",
  "Any letters abducted, infected, orbited, or set on fire during your session remain the property of the aggressor, in perpetuity.",
  "SignetID’s total liability shall not exceed the emotional value of one (1) firm handshake, payable in understanding.",
  "These Terms are governed by the laws of a jurisdiction that will be named later, if at all, possibly by the aforementioned coin.",
  "By checking the box you did not scroll to, you affirm that you have read, understood, and personally befriended every word above.",
];

function EulaPhase({
  g,
  allies,
  onPointer,
}: {
  g: GameState;
  allies: readonly string[];
  onPointer: (target: PointerTarget) => void;
}) {
  const deadlineRef = useRef<HTMLDivElement | null>(null);
  const data = (g.finale?.data.eula as EulaData | undefined) ?? null;
  const burned = data?.burned ?? false;
  const realPara = data ? effectiveCheckboxPara(data) : -1;

  // The visible paragraph indices: everything, or just the survivors once burned.
  const survivors = useMemo(() => survivingParagraphs(), []);
  const visible = useMemo(
    () => (burned ? survivors : Array.from({ length: EULA_CLAUSES.length * 2 }, (_v, i) => i)),
    [burned, survivors],
  );

  // Three decoy checkboxes at fixed non-real paragraphs, spread across whatever is
  // still on screen. Deterministic in (burned, realPara) so they never jump around.
  const decoys = useMemo(() => {
    const pool = visible.filter((i) => i !== realPara);
    if (pool.length === 0) return [] as number[];
    const picks: number[] = [];
    for (let k = 1; k <= 3; k++) {
      const idx = pool[Math.floor((pool.length * k) / 4) % pool.length]!;
      if (!picks.includes(idx)) picks.push(idx);
    }
    return picks;
  }, [visible, realPara]);

  // Drain the 90s deadline bar each frame; it resets to full on a knockback.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = deadlineRef.current;
      const d = g.finale?.data.eula as EulaData | undefined;
      if (el && d && g.finale) {
        const remaining = Math.max(0, 1 - g.finale.phaseElapsedMs / d.deadlineAtMs);
        el.style.transform = `scaleX(${remaining})`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [g]);

  return (
    <div className="pg2-eula-wrap">
      <div className="pg2-eula-head">
        <div>
          <p className="pg2-eula-head__crumb">SignetID Master Services Agreement</p>
          <p className="pg2-eula-head__title">You must agree to the terms to continue</p>
        </div>
        {burned && allies.includes("campfire") ? <AllyBadge kind="campfire" /> : null}
      </div>

      <div className="pg2-eula" role="group" aria-label="Terms and conditions">
        {visible.map((idx) => {
          const isReal = idx === realPara;
          const isDecoy = decoys.includes(idx);
          return (
            <div key={idx} className={`pg2-eula__para${isReal ? "pg2-eula__para--real" : ""}`}>
              <p className="pg2-eula__num">Section {idx + 1}.</p>
              <p className="pg2-eula__body">{EULA_CLAUSES[idx % EULA_CLAUSES.length]}</p>
              {isReal ? (
                <label className="pg2-eula__check pg2-eula__check--real">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => onPointer({ kind: "eula-checkbox" })}
                  />
                  <span>I have read and agree to the SignetID Terms.</span>
                </label>
              ) : null}
              {isDecoy ? (
                <label className="pg2-eula__check">
                  <input
                    type="checkbox"
                    checked={false}
                    onChange={() => onPointer({ kind: "eula-decoy" })}
                  />
                  <span>I agree to the terms of this particular section.</span>
                </label>
              ) : null}
            </div>
          );
        })}

        {burned
          ? Array.from({ length: 8 }, (_v, i) => (
              <div key={`ash-${i}`} className="pg2-eula__charred" aria-hidden="true">
                <span className="pg2-eula__ash" />
                <span className="pg2-eula__ash" />
                <span className="pg2-eula__ash" />
              </div>
            ))
          : null}
      </div>

      <div className="pg2-eula-deadline" aria-hidden="true">
        <div ref={deadlineRef} className="pg2-eula-deadline__fill" />
      </div>
    </div>
  );
}

// --- phase 3: runaway button -------------------------------------------------

const TAUNTS: readonly string[] = [
  "Try again.",
  "Almost.",
  "The button has a lawyer.",
  "Not today.",
  "You’ll never take it alive.",
  "It’s not you, it’s the Terms.",
];

/** Five fixed rest positions the button teleports between under reduced motion. */
const SLOTS: ReadonlyArray<[number, number]> = [
  [0.12, 0.2],
  [0.82, 0.22],
  [0.5, 0.55],
  [0.16, 0.82],
  [0.84, 0.8],
];

function RunawayPhase({
  g,
  allies,
  onPointer,
  reduced,
}: {
  g: GameState;
  allies: readonly string[];
  onPointer: (target: PointerTarget) => void;
  reduced: boolean;
}) {
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const posRef = useRef({ x: 0.5, y: 0.5 }); // normalized within the arena
  const cursorRef = useRef({ x: -1, y: -1 }); // arena-local px; -1 = off-arena
  const [taunt, setTaunt] = useState(0);

  const bearBond = (g.finale?.data.runaway as RunawayData | undefined)?.bearBond ?? false;

  useEffect(() => {
    const id = window.setInterval(() => setTaunt((n) => (n + 1) % TAUNTS.length), 2400);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const arena = arenaRef.current;
    const btn = btnRef.current;
    if (!arena || !btn) return;

    const onMove = (e: PointerEvent) => {
      const r = arena.getBoundingClientRect();
      cursorRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => {
      cursorRef.current = { x: -1, y: -1 };
    };
    arena.addEventListener("pointermove", onMove);
    arena.addEventListener("pointerleave", onLeave);

    let raf = 0;
    let last = 0;
    const REPEL = 120; // repulsion radius in px
    const loop = (ts: number) => {
      const dt = last === 0 ? 0.016 : Math.min(0.05, (ts - last) / 1000);
      last = ts;
      const r = arena.getBoundingClientRect();
      const bw = btn.offsetWidth;
      const bh = btn.offsetHeight;
      const pad = 8;
      const maxX = Math.max(pad, r.width - bw - pad);
      const maxY = Math.max(pad, r.height - bh - pad);
      const run = g.finale?.data.runaway as RunawayData | undefined;
      const speedScale = run?.speedScale ?? 1;

      let px = posRef.current.x * maxX;
      let py = posRef.current.y * maxY;
      const cx = px + bw / 2;
      const cy = py + bh / 2;
      const cur = cursorRef.current;

      if (cur.x >= 0) {
        const dx = cx - cur.x;
        const dy = cy - cur.y;
        const dist = Math.hypot(dx, dy);
        if (dist < REPEL && dist > 0.001) {
          if (reduced) {
            // Teleport to whichever fixed slot is farthest from the cursor.
            let best = 0;
            let bestD = -1;
            SLOTS.forEach(([sx, sy], i) => {
              const scx = sx * maxX + bw / 2;
              const scy = sy * maxY + bh / 2;
              const d = Math.hypot(scx - cur.x, scy - cur.y);
              if (d > bestD) {
                bestD = d;
                best = i;
              }
            });
            px = SLOTS[best]![0] * maxX;
            py = SLOTS[best]![1] * maxY;
          } else {
            const speed = 900 * speedScale;
            const force = 1 - dist / REPEL;
            px += (dx / dist) * speed * force * dt;
            py += (dy / dist) * speed * force * dt;
          }
        }
      }

      px = Math.max(pad, Math.min(maxX, px));
      py = Math.max(pad, Math.min(maxY, py));
      posRef.current = { x: maxX > 0 ? px / maxX : 0.5, y: maxY > 0 ? py / maxY : 0.5 };
      btn.style.transform = `translate(${px}px, ${py}px)`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      arena.removeEventListener("pointermove", onMove);
      arena.removeEventListener("pointerleave", onLeave);
    };
  }, [g, reduced]);

  return (
    <div className="pg2-runaway">
      <p className="pg2-runaway__lede">
        Everything is satisfied. All that is left is to submit. The button would rather you did not.
      </p>
      <div ref={arenaRef} className="pg2-runaway__arena">
        <span className="pg2-runaway__taunt" aria-hidden="true">
          {TAUNTS[taunt]}
        </span>
        {bearBond ? (
          <div className="pg2-bear-sweep" aria-hidden="true">
            <svg width="120" height="80" viewBox="0 0 120 80">
              <ellipse cx="60" cy="52" rx="42" ry="26" fill="#1f2937" />
              <circle cx="26" cy="30" r="12" fill="#1f2937" />
              <circle cx="18" cy="18" r="6" fill="#1f2937" />
              <circle cx="34" cy="16" r="6" fill="#1f2937" />
            </svg>
          </div>
        ) : null}
        <button
          ref={btnRef}
          type="button"
          className="pg2-runaway__btn"
          onPointerDown={() => onPointer({ kind: "submit-button" })}
        >
          Create account
        </button>
      </div>
      {allies.includes("garden") ? (
        <div className="pg2-ally-row pg2-ally-row--center">
          <AllyBadge kind="garden" />
        </div>
      ) : null}
    </div>
  );
}
