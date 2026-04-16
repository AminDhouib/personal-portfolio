"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Key, CalendarDays } from "lucide-react";
import { selectRulesForRun, validateRules, computeActiveRuleIndex } from "./engine";
import { dailySeed, todayDateString } from "./daily";
import { TIER_1_RULES } from "./rules/tier1";
import { TIER_2_RULES } from "./rules/tier2";
import { RuleCard } from "./rule-card";
import { pickForeshadow, useForeshadowTrigger, ForeshadowOverlay } from "./foreshadowing";
import { CracksOverlay } from "./destruction";
import { ResultModal } from "./result-modal";
import type { GameState, Rule } from "./types";

function makeSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        { 1: Math.min(4, TIER_1_RULES.length), 2: Math.min(3, TIER_2_RULES.length) },
        { 1: TIER_1_RULES, 2: TIER_2_RULES }
      ),
    [seed]
  );

  const state: GameState = useMemo(
    () => ({
      password,
      formatting: [],
      elapsedSeconds,
      activeRuleIndex: 0,
      rules,
      seed,
    }),
    [password, elapsedSeconds, rules, seed]
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

  const foreshadowKind = useMemo(() => pickForeshadow(seed), [seed]);
  const foreshadowFired = useForeshadowTrigger(satisfiedCount, 2);

  const revealCount = activeIdx === -1 ? rules.length : activeIdx + 1;
  const visibleRules = rules.slice(0, revealCount);
  const visibleResults = results.slice(0, revealCount);

  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
    setElapsedSeconds(0);
    setTimerRunning(false);
    setShowResult(false);
  }, []);

  const startDaily = useCallback(() => {
    setSeed(dailySeed(todayDateString()));
    setPassword("");
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
      <textarea
        id="pg-input"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value);
          if (!timerRunning && e.target.value.length > 0) setTimerRunning(true);
        }}
        rows={3}
        className="w-full rounded-lg border border-(--border) bg-(--background) px-4 py-3 font-mono text-base text-(--foreground) focus:outline-none focus:border-accent-pink/60 resize-none"
        spellCheck={false}
        autoComplete="off"
      />
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
    </div>
  );
}
