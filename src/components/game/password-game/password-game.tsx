"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Key, CalendarDays, Volume2, VolumeX } from "lucide-react";
import { selectRulesForRun, validateRules, computeActiveRuleIndex } from "./engine";
import { dailySeed, todayDateString } from "./daily";
import { setSoundEnabled, isSoundEnabled, play as playSfx } from "./sound";
import { TIER_1_RULES } from "./rules/tier1";
import { TIER_2_RULES } from "./rules/tier2";
import { TIER_3_RULES } from "./rules/tier3";
import { TIER_4_RULES } from "./rules/tier4";
import { TIER_5_RULES } from "./rules/tier5";
import { RuleCard } from "./rule-card";
import { pickForeshadow, useForeshadowTrigger, ForeshadowOverlay } from "./foreshadowing";
import { CracksOverlay } from "./destruction";
import { ChaosDebugPanel } from "./chaos-debug-panel";
import { ResultModal } from "./result-modal";
import { RichInput } from "./rich-input";
import type { GameState, Rule, FormattingMap } from "./types";

function makeSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/**
 * Fire one random high-tier surprise: shadow sweep, blink, or glyph flash.
 * Each one-shot is a briefly-mounted element with a self-cleaning animation.
 */
function fireRandomSurprise(): void {
  if (typeof window === "undefined") return;
  const root = document.querySelector<HTMLElement>(".pg-chaos-root");
  if (!root) return;
  const kinds = ["shadow", "blink", "glyph"] as const;
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  if (kind === "blink") {
    const container = root.querySelector<HTMLElement>(".pg-container");
    if (!container) return;
    container.classList.remove("pg-blink");
    void container.offsetWidth;
    container.classList.add("pg-blink");
    window.setTimeout(() => container.classList.remove("pg-blink"), 220);
    return;
  }
  if (kind === "shadow") {
    const el = document.createElement("div");
    el.className = "pg-shadow-sweep";
    root.appendChild(el);
    window.setTimeout(() => el.remove(), 1000);
    return;
  }
  // Glyph flash — single random glitch char centered for ~320ms.
  const glyphs = "!?#*█▓░◆⚠✦∎";
  const el = document.createElement("div");
  el.className = "pg-glyph-flash";
  el.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
  root.appendChild(el);
  window.setTimeout(() => el.remove(), 360);
}

function initialSeed(): number {
  if (typeof window === "undefined") return makeSeed();
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("seed");
  if (fromUrl) {
    const parsed = Number(fromUrl);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 0xffffffff) {
      return parsed >>> 0;
    }
  }
  return makeSeed();
}

export function PasswordGame() {
  const [seed, setSeed] = useState<number>(() => initialSeed());
  const [password, setPassword] = useState<string>("");
  const [formatting, setFormatting] = useState<FormattingMap>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevSatisfied = useRef(0);
  const prevActive = useRef(-1);
  const prevChaos = useRef(0);
  const winAnnounced = useRef(false);

  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        {
          1: Math.min(4, TIER_1_RULES.length),
          2: Math.min(3, TIER_2_RULES.length),
          3: Math.min(2, TIER_3_RULES.length),
          4: Math.min(2, TIER_4_RULES.length),
          5: Math.min(2, TIER_5_RULES.length),
        },
        {
          1: TIER_1_RULES,
          2: TIER_2_RULES,
          3: TIER_3_RULES,
          4: TIER_4_RULES,
          5: TIER_5_RULES,
        }
      ),
    [seed]
  );

  const state: GameState = useMemo(
    () => ({
      password,
      formatting,
      elapsedSeconds,
      activeRuleIndex: 0,
      rules,
      seed,
    }),
    [password, formatting, elapsedSeconds, rules, seed]
  );

  const results = useMemo(() => validateRules(state), [state]);
  const activeIdx = useMemo(() => computeActiveRuleIndex(state), [state]);
  const satisfiedCount = results.filter((r) => r.passed).length;
  const allPassed = activeIdx === -1 && rules.length > 0;

  // Chaos level = the highest tier the player has unlocked, bumped by 1 per
  // fully cleared tier. We floor at 0 and cap at 5 to keep CSS contracts stable.
  const chaosLevel = useMemo(() => {
    let max = 0;
    for (const rule of rules) {
      // A tier's effect kicks in as soon as one rule from that tier is revealed
      // (i.e. any prior rule was satisfied). Revealed = earlier rule passed.
      const idx = rules.indexOf(rule);
      const earlierAllPassed = idx === 0 || results.slice(0, idx).every((r) => r.passed);
      if (earlierAllPassed) {
        max = Math.max(max, rule.tier);
      }
    }
    return Math.min(5, Math.max(0, max));
  }, [rules, results]);

  // Hazard classes activated by specific active rules.
  const hazardClass = useMemo(() => {
    if (activeIdx === -1) return "";
    const active = rules[activeIdx];
    if (!active) return "";
    if (active.id === "mirror-input") return "pg-hazard-mirror";
    if (active.id === "blurred-input") return "pg-hazard-blur";
    return "";
  }, [activeIdx, rules]);

  useEffect(() => {
    if (!timerRunning) return;
    const id = window.setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [timerRunning]);

  useEffect(() => {
    if (allPassed && timerRunning) {
      setTimerRunning(false);
      setShowResult(true);
    }
  }, [allPassed, timerRunning]);

  // Sound effects on state transitions.
  useEffect(() => {
    if (satisfiedCount > prevSatisfied.current) {
      playSfx("rule-complete");
      // Big glitch burst on the container as a visual reward.
      const container = containerRef.current?.querySelector<HTMLElement>(".pg-container");
      if (container) {
        container.classList.remove("pg-burst");
        void container.offsetWidth;
        container.classList.add("pg-burst");
        window.setTimeout(() => container.classList.remove("pg-burst"), 320);
      }
    } else if (
      satisfiedCount < prevSatisfied.current &&
      prevSatisfied.current > 0 &&
      timerRunning
    ) {
      // A previously-satisfied rule became unsatisfied — punish with a hard
      // shake + error tone so the player notices what they just broke.
      playSfx("unsatisfy");
      const container = containerRef.current?.querySelector<HTMLElement>(".pg-container");
      if (container) {
        container.classList.remove("pg-unsatisfy-shake");
        void container.offsetWidth;
        container.classList.add("pg-unsatisfy-shake");
        window.setTimeout(() => container.classList.remove("pg-unsatisfy-shake"), 600);
      }
    }
    prevSatisfied.current = satisfiedCount;
  }, [satisfiedCount, timerRunning]);

  useEffect(() => {
    if (activeIdx > prevActive.current && prevActive.current !== -1) {
      playSfx("rule-reveal");
      // Shake the container AND attract-animate the new rule card.
      const container = containerRef.current?.querySelector<HTMLElement>(".pg-container");
      if (container) {
        container.classList.remove("pg-reveal-shake");
        void container.offsetWidth;
        container.classList.add("pg-reveal-shake");
        window.setTimeout(() => container.classList.remove("pg-reveal-shake"), 500);
      }
      const cards = containerRef.current?.querySelectorAll<HTMLElement>(".pg-rule-card");
      if (cards && cards.length > 0) {
        const newest = cards[cards.length - 1];
        newest.classList.remove("pg-card-enter");
        void newest.offsetWidth;
        newest.classList.add("pg-card-enter");
        window.setTimeout(() => newest.classList.remove("pg-card-enter"), 560);
      }
    }
    prevActive.current = activeIdx;
  }, [activeIdx]);

  useEffect(() => {
    if (chaosLevel > prevChaos.current && chaosLevel >= 3) {
      playSfx("crack");
      // Layer a low rumble underneath for weight.
      playSfx("rumble");
    }
    prevChaos.current = chaosLevel;
  }, [chaosLevel]);

  useEffect(() => {
    if (allPassed && !winAnnounced.current) {
      winAnnounced.current = true;
      playSfx("win");
    } else if (!allPassed) {
      winAnnounced.current = false;
    }
  }, [allPassed]);

  const toggleSound = useCallback(() => {
    const next = !isSoundEnabled();
    setSoundEnabled(next);
    setSoundOn(next);
  }, []);

  // High-tier surprise moments — random one-shot effects at chaos 4+. Fires
  // once per 20-40 seconds so players feel watched, not overwhelmed.
  useEffect(() => {
    if (chaosLevel < 4 || !timerRunning) return;
    const schedule = () => {
      const delay = 20000 + Math.random() * 20000;
      return window.setTimeout(() => {
        fireRandomSurprise();
        id = schedule();
      }, delay);
    };
    let id = schedule();
    return () => window.clearTimeout(id);
  }, [chaosLevel, timerRunning]);

  const foreshadowKind = useMemo(() => pickForeshadow(seed), [seed]);
  const foreshadowFired = useForeshadowTrigger(satisfiedCount, 2);

  const revealCount = activeIdx === -1 ? rules.length : activeIdx + 1;
  const visibleRules = rules.slice(0, revealCount);
  const visibleResults = results.slice(0, revealCount);

  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
    setFormatting([]);
    setElapsedSeconds(0);
    setTimerRunning(false);
    setShowResult(false);
  }, []);

  const startDaily = useCallback(() => {
    setSeed(dailySeed(todayDateString()));
    setPassword("");
    setFormatting([]);
    setElapsedSeconds(0);
    setTimerRunning(false);
    setShowResult(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="pg-chaos-root w-full relative"
      data-chaos={chaosLevel}
    >
      <CracksOverlay />
      <div className="pg-container relative rounded-xl border border-(--border) bg-(--card) p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-accent-pink" />
          <span className="text-xs font-medium text-(--muted)">
            Seed: <span className="font-mono text-(--foreground)">{seed}</span>
            {" • "}
            <span className="font-mono text-(--foreground)">
              {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSound}
            className="inline-flex items-center gap-1 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
            aria-label={soundOn ? "Disable sound" : "Enable sound"}
          >
            {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            {soundOn ? "Sound" : "Muted"}
          </button>
          <button
            type="button"
            onClick={startDaily}
            className="inline-flex items-center gap-1 text-xs text-accent-amber hover:text-accent-amber/80 transition-colors"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Daily
          </button>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            New seed
          </button>
        </div>
      </div>

      <label htmlFor="pg-input" className="block text-sm text-(--muted) mb-2">
        Please choose a password
      </label>
      <div className={hazardClass}>
        <RichInput
          value={password}
          formatting={formatting}
          onChange={(e) => {
            setPassword(e.value);
            setFormatting(e.formatting);
            if (!timerRunning && e.value.length > 0) setTimerRunning(true);
          }}
          onDestructiveKey={() => {
            const inputWrap = containerRef.current?.querySelector<HTMLElement>(".pg-chaos-root textarea")?.closest("div");
            if (inputWrap) {
              inputWrap.classList.remove("pg-typo-flash");
              void inputWrap.offsetWidth;
              inputWrap.classList.add("pg-typo-flash");
              window.setTimeout(() => inputWrap.classList.remove("pg-typo-flash"), 300);
            }
            playSfx("rule-fail");
          }}
          placeholder="Enter your password..."
        />
      </div>
      <div className="mt-1 text-xs text-(--muted)">
        {[...password].length} characters
      </div>

      <div className="mt-5 space-y-2">
        {visibleRules.map((rule, i) => (
          <div
            key={`${rule.id}-${i}`}
            className="pg-rule-card"
            style={{ ["--pg-card-idx" as string]: i }}
          >
            <RuleCard
              rule={rule}
              result={visibleResults[i]}
              index={i}
              isActive={i === activeIdx}
              chaos={chaosLevel}
            />
          </div>
        ))}
      </div>

      {allPassed && (
        <div className="mt-5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          All rules cleared in {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, "0")}!
        </div>
      )}

      <ResultModal
        open={showResult}
        seed={seed}
        timeSeconds={elapsedSeconds}
        rulesCleared={rules.length}
        tiers={rules.map((r) => r.tier)}
        onClose={() => setShowResult(false)}
      />

      <ForeshadowOverlay
        kind={foreshadowKind}
        active={foreshadowFired}
        containerRef={containerRef}
      />
      </div>
      <ChaosDebugPanel />
    </div>
  );
}
