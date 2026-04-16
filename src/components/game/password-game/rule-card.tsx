"use client";

import { useEffect, useState } from "react";
import type { Rule, ValidationResult } from "./types";
import { CheckCircle, XCircle } from "lucide-react";
import { FLAGS } from "../../../data/password-game/flags";
import { CHESS_PUZZLES, getDailyChessPuzzle } from "../../../data/password-game/chess";

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
  // Extract media markers before normal text processing.
  const flagMatch = text.match(/\[\[FLAG:([A-Za-z ]+)\]\]/);
  if (flagMatch) {
    const flag = FLAGS.find((f) => f.country === flagMatch[1].trim());
    const before = text.slice(0, flagMatch.index);
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <GlitchText text={before} chaos={chaos} />
        {flag && <FlagBadge flag={flag} />}
      </span>
    );
  }

  const chessMatch = text.match(/\[\[CHESS:([\w-]+)\]\]/);
  if (chessMatch) {
    const id = chessMatch[1];
    const daily = getDailyChessPuzzle();
    const puzzle = daily && daily.id === id ? daily : CHESS_PUZZLES.find((p) => p.id === id);
    const before = text.slice(0, chessMatch.index);
    return (
      <>
        <GlitchText text={before} chaos={chaos} />
        {puzzle && <ChessBoard board={puzzle.board} toMove={puzzle.toMove} hint={puzzle.hint} />}
      </>
    );
  }

  // Fallback to existing behavior: split on blank line for code snippets.
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

/** Rendered flag — CSS linear-gradient tricolor, inline with the text. */
function FlagBadge({ flag }: { flag: (typeof FLAGS)[number] }) {
  const direction = flag.orientation === "h" ? "to bottom" : "to right";
  const background = `linear-gradient(${direction}, ${flag.colors[0]} 0 33.33%, ${flag.colors[1]} 33.33% 66.66%, ${flag.colors[2]} 66.66% 100%)`;
  return (
    <span
      role="img"
      aria-label={`flag of ${flag.country}`}
      className="inline-block align-middle rounded-sm border border-black/20"
      style={{
        width: 40,
        height: 28,
        background,
      }}
    />
  );
}

/** 8×8 Unicode chess board rendered in a monospace grid. */
function ChessBoard({
  board,
  toMove,
  hint,
}: {
  board: readonly string[];
  toMove: "white" | "black";
  hint: string;
}) {
  return (
    <div className="mt-2">
      <div className="inline-grid grid-cols-8 rounded-md border border-(--border) overflow-hidden bg-(--background) text-2xl leading-none font-mono">
        {board.flatMap((row, r) =>
          [...row].map((cell, c) => {
            const light = (r + c) % 2 === 0;
            return (
              <span
                key={`${r}-${c}`}
                className="flex items-center justify-center w-6 h-6"
                style={{
                  background: light ? "#e0e0c8" : "#7a8b50",
                  color: "#1a1a1a",
                }}
              >
                {cell === "." ? "" : cell}
              </span>
            );
          })
        )}
      </div>
      <div className="mt-1 text-xs text-(--muted)">{toMove} to move · {hint}</div>
    </div>
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
    setDisplay(text);
    if (chaos < 4) return;
    const tickMs = chaos >= 5 ? 1200 : 2600;
    const id = window.setInterval(() => {
      if (text.length === 0) return;
      // Respect debug --fx-scramble flag. 0 = disabled.
      const root = document.querySelector<HTMLElement>(".pg-chaos-root");
      const fxRaw = root ? getComputedStyle(root).getPropertyValue("--fx-scramble").trim() : "1";
      const fx = fxRaw === "" ? 1 : Number(fxRaw);
      if (!Number.isFinite(fx) || fx <= 0) return;
      const count = Math.max(1, Math.round((chaos >= 5 ? 2 : 1) * fx));
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
