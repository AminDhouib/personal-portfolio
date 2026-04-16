"use client";

import type { Rule, ValidationResult } from "./types";
import { CheckCircle, XCircle } from "lucide-react";

interface Props {
  rule: Rule;
  result: ValidationResult;
  index: number;
  isActive: boolean;
}

export function RuleCard({ rule, result, index, isActive }: Props) {
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
          <div className={`text-sm ${passed ? "text-(--muted) line-through" : "text-(--foreground)"}`}>
            <RuleDescription text={rule.description} />
          </div>
          {result.message && !passed && (
            <div className="mt-1 text-xs text-accent-amber">{result.message}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function RuleDescription({ text }: { text: string }) {
  const idx = text.indexOf("\n\n");
  if (idx === -1) {
    return <span>{text}</span>;
  }
  const prose = text.slice(0, idx);
  const code = text.slice(idx + 2);
  return (
    <>
      <span>{prose}</span>
      <pre className="mt-2 rounded-md bg-(--background) border border-(--border) p-3 text-xs font-mono overflow-x-auto whitespace-pre text-(--foreground)">
        {code}
      </pre>
    </>
  );
}
