"use client";

import { useEffect, useState } from "react";
import type { Rule, ValidationResult } from "./types";
import { CheckCircle, XCircle } from "lucide-react";
import { FLAGS } from "../../../data/password-game/flags";
import { CHESS_PUZZLES, getDailyChessPuzzle } from "../../../data/password-game/chess";
import { PIANO_KEYS } from "../../../data/password-game/piano";
import { ASCII_ART } from "../../../data/password-game/ascii-art";
import { ZODIAC_SIGNS } from "../../../data/password-game/zodiac";

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

  const zodiacMatch = text.match(/\[\[ZODIAC:([A-Za-z]+)\]\]/);
  if (zodiacMatch) {
    const sign = ZODIAC_SIGNS.find((s) => s.name === zodiacMatch[1]);
    const before = text.slice(0, zodiacMatch.index);
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <GlitchText text={before} chaos={chaos} />
        {sign && (
          <span
            aria-label={`zodiac ${sign.name}`}
            role="img"
            className="inline-block align-middle text-2xl leading-none font-normal"
            style={{ fontVariantEmoji: "text" as const, color: "var(--foreground)" }}
          >
            {sign.glyph}
          </span>
        )}
      </span>
    );
  }

  const binaryMatch = text.match(/\[\[BINARY:([01]{8})\]\]/);
  if (binaryMatch) {
    const before = text.slice(0, binaryMatch.index);
    const bits = binaryMatch[1];
    return (
      <>
        <GlitchText text={before} chaos={chaos} />
        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-(--background) border border-(--border) px-3 py-2 font-mono">
          {[...bits].map((b, i) => (
            <span
              key={i}
              className="inline-block"
              aria-label={`bit ${i}: ${b}`}
              style={{
                width: 14,
                height: 14,
                borderRadius: "50%",
                background: b === "1" ? "#22c55e" : "transparent",
                border: "1.5px solid #22c55e",
              }}
            />
          ))}
        </div>
      </>
    );
  }

  const clockMatch = text.match(/\[\[CLOCK:(\d{2}):(\d{2})\]\]/);
  if (clockMatch) {
    const before = text.slice(0, clockMatch.index);
    return (
      <>
        <GlitchText text={before} chaos={chaos} />
        <SevenSegClock hh={clockMatch[1]} mm={clockMatch[2]} />
      </>
    );
  }

  const mixMatch = text.match(/\[\[MIX:([a-z]+):([a-z]+)\]\]/);
  if (mixMatch) {
    const before = text.slice(0, mixMatch.index);
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <GlitchText text={before} chaos={chaos} />
        <ColorMixBadge a={mixMatch[1]} b={mixMatch[2]} />
      </span>
    );
  }

  const moonMatch = text.match(/\[\[MOON:([0-9.]+)\]\]/);
  if (moonMatch) {
    const fraction = Number(moonMatch[1]);
    const before = text.slice(0, moonMatch.index);
    return (
      <span className="inline-flex items-center gap-2 flex-wrap">
        <GlitchText text={before} chaos={chaos} />
        <MoonBadge fraction={fraction} />
      </span>
    );
  }

  const asciiMatch = text.match(/\[\[ASCII:([\w-]+)\]\]/);
  if (asciiMatch) {
    const entry = ASCII_ART.find((a) => a.id === asciiMatch[1]);
    const before = text.slice(0, asciiMatch.index);
    return (
      <>
        <GlitchText text={before} chaos={chaos} />
        {entry && (
          <pre className="mt-2 inline-block rounded-md bg-(--background) border border-(--border) p-3 text-xs font-mono leading-tight whitespace-pre text-(--foreground)">
            {entry.art.join("\n")}
          </pre>
        )}
      </>
    );
  }

  const pianoMatch = text.match(/\[\[PIANO:(\d+)\]\]/);
  if (pianoMatch) {
    const highlight = Number(pianoMatch[1]);
    const before = text.slice(0, pianoMatch.index);
    return (
      <>
        <GlitchText text={before} chaos={chaos} />
        <PianoKeyboard highlight={highlight} />
      </>
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

/** LED-style 7-segment HH:MM clock display. */
function SevenSegClock({ hh, mm }: { hh: string; mm: string }) {
  return (
    <div className="mt-2 inline-flex items-center gap-1 rounded-md bg-[#0a0a0a] border border-(--border) px-3 py-2">
      <SevenSegDigit value={Number(hh[0])} />
      <SevenSegDigit value={Number(hh[1])} />
      <span className="text-red-500 text-2xl font-bold leading-none" style={{ letterSpacing: 2 }}>:</span>
      <SevenSegDigit value={Number(mm[0])} />
      <SevenSegDigit value={Number(mm[1])} />
    </div>
  );
}

// Segments a..g lit for each digit 0..9
const SEG_MAP: Record<number, string> = {
  0: "abcdef",
  1: "bc",
  2: "abged",
  3: "abgcd",
  4: "fgbc",
  5: "afgcd",
  6: "afgedc",
  7: "abc",
  8: "abcdefg",
  9: "abcdfg",
};

function SevenSegDigit({ value }: { value: number }) {
  const lit = SEG_MAP[value] ?? "";
  const on = (seg: string) => (lit.includes(seg) ? "#ef4444" : "#2a0b0b");
  // Canvas 30×50; each segment is a rounded rect.
  return (
    <svg width={30} height={50} viewBox="0 0 30 50" aria-label={`digit ${value}`} role="img">
      {/* a: top */}
      <rect x={6} y={2}  width={18} height={4} rx={1.5} fill={on("a")} />
      {/* f: top-left */}
      <rect x={2} y={6}  width={4}  height={16} rx={1.5} fill={on("f")} />
      {/* b: top-right */}
      <rect x={24} y={6} width={4}  height={16} rx={1.5} fill={on("b")} />
      {/* g: middle */}
      <rect x={6} y={22} width={18} height={4}  rx={1.5} fill={on("g")} />
      {/* e: bottom-left */}
      <rect x={2} y={28} width={4}  height={16} rx={1.5} fill={on("e")} />
      {/* c: bottom-right */}
      <rect x={24} y={28} width={4} height={16} rx={1.5} fill={on("c")} />
      {/* d: bottom */}
      <rect x={6} y={44} width={18} height={4}  rx={1.5} fill={on("d")} />
    </svg>
  );
}

/** Inline "A + B = ?" color mix badge with two filled circles and a question mark. */
function ColorMixBadge({ a, b }: { a: string; b: string }) {
  const COLORS: Record<string, string> = {
    red: "#ef4444",
    yellow: "#eab308",
    blue: "#3b82f6",
    white: "#f8fafc",
    black: "#0f172a",
  };
  const colorA = COLORS[a] ?? "#888";
  const colorB = COLORS[b] ?? "#888";
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      <span
        aria-label={`color ${a}`}
        role="img"
        className="inline-block rounded-full border border-black/30"
        style={{ width: 22, height: 22, background: colorA }}
      />
      <span className="text-sm font-bold text-(--foreground)">+</span>
      <span
        aria-label={`color ${b}`}
        role="img"
        className="inline-block rounded-full border border-black/30"
        style={{ width: 22, height: 22, background: colorB }}
      />
      <span className="text-sm font-bold text-(--foreground)">= ?</span>
    </span>
  );
}

/**
 * Render a moon phase as SVG. The full moon is a light circle against a dark
 * background; other phases use an overlay ellipse to carve out the shadow.
 *
 * For phases <0.5 (waxing), the shadow is on the left; for >0.5 (waning),
 * on the right. The overlay's x-radius is a function of how far from half
 * we are — 0 at quarter, full width at new/full.
 */
function MoonBadge({ fraction }: { fraction: number }) {
  const size = 40;
  const r = size / 2 - 2;
  const cx = size / 2;
  const cy = size / 2;
  const MOON = "#f8fafc";
  const SHADOW = "#0f172a";

  // Normalize to [-1, 1] where 0 = new, ±1 = full, 0.5 = first quarter.
  // Amount of lit area grows 0 → 1 → 0 over the cycle.
  const f = fraction % 1;
  const isNew = f < 0.03 || f > 0.97;
  const isFull = f > 0.47 && f < 0.53;
  const waxing = f < 0.5;
  // rx ∈ [0, r]: 0 at quarter (straight terminator), r at new/full (full circle overlay)
  const distFromHalf = Math.abs(f - (waxing ? 0.25 : 0.75));
  const rx = Math.min(r, (distFromHalf / 0.25) * r);
  const overlayX = waxing ? cx - rx / 2 : cx + rx / 2;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label="moon phase" role="img">
      {/* Dark disc — sky + shadow side */}
      <circle cx={cx} cy={cy} r={r} fill={SHADOW} />
      {/* Full moon special case */}
      {isFull && <circle cx={cx} cy={cy} r={r} fill={MOON} />}
      {/* Anything but new or full: draw the lit portion */}
      {!isFull && !isNew && (
        <>
          {/* Lit half — covers either left (waning) or right (waxing) half */}
          <path
            d={
              waxing
                ? `M ${cx} ${cy - r} A ${r} ${r} 0 0 1 ${cx} ${cy + r} Z`
                : `M ${cx} ${cy - r} A ${r} ${r} 0 0 0 ${cx} ${cy + r} Z`
            }
            fill={MOON}
          />
          {/* Terminator ellipse — carves shadow or light depending on gibbous/crescent */}
          <ellipse
            cx={overlayX}
            cy={cy}
            rx={rx / 2}
            ry={r}
            fill={f < 0.25 || (f > 0.5 && f < 0.75) ? SHADOW : MOON}
          />
        </>
      )}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#0006" strokeWidth={1} />
    </svg>
  );
}

/** One-octave piano keyboard with a single highlighted key. */
function PianoKeyboard({ highlight }: { highlight: number }) {
  const whiteKeys = PIANO_KEYS.filter((k) => k.kind === "white");
  const blackKeys = PIANO_KEYS.filter((k) => k.kind === "black");
  const whiteW = 22;
  const whiteH = 70;
  const blackW = 14;
  const blackH = 44;
  const svgW = whiteKeys.length * whiteW;
  const whiteIndexByOrder: Record<number, number> = {};
  whiteKeys.forEach((k, i) => (whiteIndexByOrder[k.order] = i));
  return (
    <div className="mt-2">
      <svg width={svgW} height={whiteH} viewBox={`0 0 ${svgW} ${whiteH}`} aria-label="piano keyboard" role="img">
        {whiteKeys.map((k, i) => {
          const isHi = k.order === highlight;
          return (
            <rect
              key={`w-${i}`}
              x={i * whiteW}
              y={0}
              width={whiteW}
              height={whiteH}
              fill={isHi ? "#facc15" : "#f8fafc"}
              stroke="#1a1a1a"
              strokeWidth={1}
            />
          );
        })}
        {blackKeys.map((k) => {
          const prevWhiteOrder = k.order - 1;
          const whiteIdx = whiteIndexByOrder[prevWhiteOrder];
          if (whiteIdx === undefined) return null;
          const x = (whiteIdx + 1) * whiteW - blackW / 2;
          const isHi = k.order === highlight;
          return (
            <rect
              key={`b-${k.order}`}
              x={x}
              y={0}
              width={blackW}
              height={blackH}
              fill={isHi ? "#f59e0b" : "#0f172a"}
              stroke="#1a1a1a"
              strokeWidth={1}
            />
          );
        })}
      </svg>
    </div>
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
