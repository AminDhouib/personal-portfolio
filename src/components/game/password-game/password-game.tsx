"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw, Key } from "lucide-react";
import { selectRulesForRun, validateRules, computeActiveRuleIndex } from "./engine";
import { TIER_1_RULES } from "./rules/tier1";
import { RuleCard } from "./rule-card";
import { pickForeshadow, useForeshadowTrigger, ForeshadowOverlay } from "./foreshadowing";
import type { GameState, Rule } from "./types";

function makeSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export function PasswordGame() {
  const [seed, setSeed] = useState<number>(() => makeSeed());
  const [password, setPassword] = useState<string>("");
  const [startedAt, setStartedAt] = useState<number>(() => Date.now());
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const rules: Rule[] = useMemo(
    () =>
      selectRulesForRun(
        seed,
        { 1: Math.min(4, TIER_1_RULES.length) },
        { 1: TIER_1_RULES }
      ),
    [seed]
  );

  const state: GameState = useMemo(
    () => ({
      password,
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

  const foreshadowKind = useMemo(() => pickForeshadow(seed), [seed]);
  const foreshadowFired = useForeshadowTrigger(satisfiedCount, 2);

  const revealCount = activeIdx === -1 ? rules.length : activeIdx + 1;
  const visibleRules = rules.slice(0, revealCount);
  const visibleResults = results.slice(0, revealCount);

  const reset = useCallback(() => {
    setSeed(makeSeed());
    setPassword("");
    setStartedAt(Date.now());
    setElapsedSeconds(0);
  }, []);

  const allPassed = activeIdx === -1 && rules.length > 0;

  return (
    <div
      ref={containerRef}
      className="w-full rounded-xl border border-(--border) bg-(--card) p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-accent-pink" />
          <span className="text-xs font-medium text-(--muted)">
            Seed: <span className="font-mono text-(--foreground)">{seed}</span>
          </span>
        </div>
        <button
          type="button"
          onClick={reset}
          className="inline-flex items-center gap-1 text-xs text-(--muted) hover:text-(--foreground) transition-colors"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          New seed
        </button>
      </div>

      <label htmlFor="pg-input" className="block text-sm text-(--muted) mb-2">
        Please choose a password
      </label>
      <textarea
        id="pg-input"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
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
          <RuleCard
            key={`${rule.id}-${i}`}
            rule={rule}
            result={visibleResults[i]}
            index={i}
            isActive={i === activeIdx}
          />
        ))}
      </div>

      {allPassed && (
        <div className="mt-5 rounded-lg border border-accent-green/40 bg-accent-green/10 px-4 py-3 text-sm text-accent-green">
          Tier 1 cleared. (Tiers 2-5 coming soon.)
        </div>
      )}

      <ForeshadowOverlay
        kind={foreshadowKind}
        active={foreshadowFired}
        containerRef={containerRef}
      />
    </div>
  );
}
