"use client";

import { useEffect, useState } from "react";
import type { Rule, ValidationResult } from "./types";
import { CheckCircle, XCircle } from "lucide-react";

interface Props {
  rule: Rule;
  result: ValidationResult;
  index: number;
  isActive: boolean;
  chaos?: number;
}

export function RuleCard({ rule, result, index, isActive, chaos = 0 }: Props) {
  const passed = result.passed;
  return (
    <div
      className={`rounded-lg border px-4 py-3 transition-all ${
        passed
          ? "border-accent-green/30 bg-accent-green/5"
          : isActive
          ? "border-accent-amber/60 bg-accent-amber/10 shadow-[0_0_0_1px_var(--accent-amber)]"
          : "border-(--border) bg-(--card)"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="pt-0.5">
          {passed ? (
            <CheckCircle className="h-4 w-4 text-accent-green" />
          ) : (
            <XCircle className={`h-4 w-4 ${isActive ? "text-accent-amber" : "text-(--muted)"}`} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-(--muted) mb-1">Rule {index + 1}</div>
          <div className={`pg-rule-description text-sm ${passed ? "text-(--muted) line-through" : "text-(--foreground)"}`}>
            <RuleDescription text={rule.description} chaos={chaos} />
          </div>
          {result.message && !passed && (
            <div className="mt-1 text-xs text-accent-amber">{result.message}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleDescription({ text, chaos }: { text: string; chaos: number }) {
  const idx = text.indexOf("\n\n");
  if (idx === -1) {
    return <GlitchText text={text} chaos={chaos} />;
  }
  const prose = text.slice(0, idx);
  const code = text.slice(idx + 2);
  return (
    <>
      <GlitchText text={prose} chaos={chaos} />
      <pre className="mt-2 rounded-md bg-(--background) border border-(--border) p-3 text-xs font-mono overflow-x-auto whitespace-pre text-(--foreground)">
        {code}
      </pre>
    </>
  );
}

/**
 * Renders text that occasionally corrupts a random character to a glitch
 * glyph. Corruption frequency and duration scale with chaos level; at chaos
 * < 4 nothing happens. Corrupted chars flash back to normal after ~80ms.
 */
const GLITCH_GLYPHS = "▓▒░█▄▀■▪◆◇◈◊⚠⚡✦✧∎⋈⧖⨯⊗⊘∷";

function GlitchText({ text, chaos }: { text: string; chaos: number }) {
  const [display, setDisplay] = useState(text);

  useEffect(() => {
    // Reset when text or chaos changes.
    setDisplay(text);
    if (chaos < 4) return;
    const tickMs = chaos >= 5 ? 1200 : 2600;
    const id = window.setInterval(() => {
      if (text.length === 0) return;
      // Replace 1-2 random characters with glitch glyphs briefly.
      const count = chaos >= 5 ? 2 : 1;
      const chars = [...text];
      for (let i = 0; i < count; i++) {
        const pos = Math.floor(Math.random() * chars.length);
        if (chars[pos] !== " " && chars[pos] !== "\n") {
          chars[pos] = GLITCH_GLYPHS[Math.floor(Math.random() * GLITCH_GLYPHS.length)];
        }
      }
      setDisplay(chars.join(""));
      window.setTimeout(() => setDisplay(text), 90);
    }, tickMs);
    return () => window.clearInterval(id);
  }, [text, chaos]);

  return <span>{display}</span>;
}
