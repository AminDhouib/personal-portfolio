"use client";

/**
 * Super Voltorb Flip — web rewrite.
 *
 * Visual style is a port of the CSS motifs in
 * https://github.com/jv-vogler/voltorb-flip (MIT, Copyright (c) João Vogler)
 * — specifically the felt-green table palette, triple-outline DS bezel
 * ("border + outline + inner border") used on every panel, salmon card
 * faces (#bd8c84/#a55a52), and per-row/col header tints. Gameplay is the
 * Voltorb Flip minigame from Pokémon HGSS: 5x5 grid, multiply coins by
 * each non-voltorb tile value, hit a voltorb = bust.
 *
 * Fonts under public/games/voltorb-flip/fonts/ — Pokémon DS Font is CC0
 * (see LICENSE.txt alongside). The voltorb icon is a fresh inline SVG;
 * we don't ship upstream's Pokémon sprite PNGs (that's Nintendo IP that
 * isn't licensed for redistribution).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import localFont from "next/font/local";

const pokemonDs = localFont({
  src: "../../../public/games/voltorb-flip/fonts/pokemon-ds-font.ttf",
  variable: "--font-voltorb-ds",
  display: "swap",
});
const m5x7 = localFont({
  src: "../../../public/games/voltorb-flip/fonts/m5x7.ttf",
  variable: "--font-voltorb-m5x7",
  display: "swap",
});
const stackedPixel = localFont({
  src: "../../../public/games/voltorb-flip/fonts/stacked-pixel.ttf",
  variable: "--font-voltorb-stacked",
  display: "swap",
});

// ---------------------------------------------------------------------------
// Palette — borrowed from the reference constants.ts for visual parity.
// ---------------------------------------------------------------------------

const FELT = "#58a66c";
const FELT_DARK = "#448563";
const CARD_FACE = "#bd8c84";
const CARD_FACE_INNER = "#a55a52";
// Ordered tints applied to the row/col clue cards 0..4.
const HEADER_TINTS = ["#e77352", "#5eae43", "#efa539", "#3194ff", "#c872e7"];

// ---------------------------------------------------------------------------
// Board generation — classic Voltorb Flip rules.
// Each tile is 0 (voltorb) | 1 | 2 | 3. Level determines how many 2s, 3s, and
// voltorbs are on the board. We derive row/col totals from the finished board.
// ---------------------------------------------------------------------------

type TileValue = 0 | 1 | 2 | 3;

interface BoardState {
  tiles: TileValue[]; // row-major 25 entries
  revealed: boolean[]; // per-tile
  memos: Array<Set<TileValue>>; // per-tile memo marks
}

interface LevelSpec {
  level: number;
  twos: number;
  threes: number;
  voltorbs: number;
}

// Level table for levels 1..5 (a subset of the canonical HGSS table, enough
// to demonstrate scaling difficulty).
const LEVELS: LevelSpec[] = [
  { level: 1, twos: 3, threes: 1, voltorbs: 6 },
  { level: 2, twos: 0, threes: 3, voltorbs: 7 },
  { level: 3, twos: 5, threes: 2, voltorbs: 8 },
  { level: 4, twos: 3, threes: 4, voltorbs: 8 },
  { level: 5, twos: 2, threes: 5, voltorbs: 10 },
];

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function generateBoard(level: number): BoardState {
  const spec = LEVELS[Math.min(level - 1, LEVELS.length - 1)];
  const values: TileValue[] = [];
  for (let i = 0; i < spec.voltorbs; i++) values.push(0);
  for (let i = 0; i < spec.twos; i++) values.push(2);
  for (let i = 0; i < spec.threes; i++) values.push(3);
  while (values.length < 25) values.push(1);
  const tiles = shuffle(values, Math.random) as TileValue[];
  return {
    tiles,
    revealed: Array(25).fill(false),
    memos: Array.from({ length: 25 }, () => new Set<TileValue>()),
  };
}

// Sum and voltorb-count for one row (r=0..4) or one column (c=0..4).
function rowStats(tiles: TileValue[], r: number) {
  let sum = 0;
  let volts = 0;
  for (let c = 0; c < 5; c++) {
    const v = tiles[r * 5 + c];
    if (v === 0) volts++;
    else sum += v;
  }
  return { sum, volts };
}

function colStats(tiles: TileValue[], c: number) {
  let sum = 0;
  let volts = 0;
  for (let r = 0; r < 5; r++) {
    const v = tiles[r * 5 + c];
    if (v === 0) volts++;
    else sum += v;
  }
  return { sum, volts };
}

// ---------------------------------------------------------------------------
// Voltorb SVG — hand-drawn so we don't ship third-party sprite assets.
// ---------------------------------------------------------------------------

function VoltorbIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Red top hemisphere */}
      <path d="M2 10 A8 8 0 0 1 18 10 L2 10 Z" fill="#e53935" />
      {/* White bottom hemisphere */}
      <path d="M2 10 A8 8 0 0 0 18 10 L2 10 Z" fill="#f4f4f4" />
      {/* Horizontal seam */}
      <rect x="2" y="9.5" width="16" height="1" fill="#1a1a1a" />
      {/* Eyes */}
      <ellipse cx="7" cy="6.5" rx="1.2" ry="1.8" fill="#1a1a1a" />
      <ellipse cx="13" cy="6.5" rx="1.2" ry="1.8" fill="#1a1a1a" />
      {/* Eye shine */}
      <circle cx="7.5" cy="5.8" r="0.4" fill="#fff" />
      <circle cx="13.5" cy="5.8" r="0.4" fill="#fff" />
      {/* Outline */}
      <circle cx="10" cy="10" r="8.2" fill="none" stroke="#1a1a1a" strokeWidth="1" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Shared chrome styles — the reference's signature "triple outline" looks
// crisp even without bitmap sprites. Tailwind's arbitrary-variant APIs handle
// the perspective/transform-style stack for the flip.
// ---------------------------------------------------------------------------

const panelChrome =
  "border-2 border-gray-700 outline outline-4 outline-gray-200 rounded-[5px]";

// ---------------------------------------------------------------------------
// Card (tile)
// ---------------------------------------------------------------------------

function Card({
  value,
  revealed,
  memos,
  onFlip,
  onToggleMemo,
  memoMode,
  focused,
}: {
  value: TileValue;
  revealed: boolean;
  memos: Set<TileValue>;
  onFlip: () => void;
  onToggleMemo: (m: TileValue) => void;
  memoMode: boolean;
  focused: boolean;
}) {
  const visibleMemos: TileValue[] = [1, 2, 3, 0];
  const cycleMemo = () => {
    if (revealed) return;
    // Cycle through the four possible marks (1, 2, 3, voltorb). When a mark
    // is absent we add it; once all four are set we clear them and start
    // over. This keeps left-click on unrevealed tiles productive in memo
    // mode without needing a separate pick-a-mark panel.
    const next = visibleMemos.find((m) => !memos.has(m));
    if (next !== undefined) onToggleMemo(next);
    else visibleMemos.forEach((m) => onToggleMemo(m));
  };
  // Long-press support for touch devices (no right-click there). If the
  // pointer stays down for 400 ms we cycle a memo mark and flag the next
  // click to be suppressed so the release doesn't also flip the tile.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressNextClick = useRef(false);
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  return (
    <button
      type="button"
      onPointerDown={() => {
        if (revealed) return;
        longPressTimer.current = setTimeout(() => {
          cycleMemo();
          suppressNextClick.current = true;
          longPressTimer.current = null;
        }, 400);
      }}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      onClick={() => {
        if (suppressNextClick.current) {
          suppressNextClick.current = false;
          return;
        }
        if (revealed) return;
        if (memoMode) cycleMemo();
        else onFlip();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        // Right-click always cycles memo marks regardless of memo mode, so
        // power-users can mark tiles without toggling mode first.
        cycleMemo();
      }}
      className={`relative h-full w-full ${panelChrome} bg-transparent p-0`}
      style={{
        perspective: 1000,
        // Amber focus ring when this is the keyboard-focused tile. Uses a
        // box-shadow instead of outline so it layers cleanly on top of
        // the existing triple-outline chrome without fighting z-order.
        boxShadow: focused ? "0 0 0 3px #fbbf24, 0 0 10px #fbbf24aa" : undefined,
      }}
      aria-label={revealed ? `Card showing ${value}` : "Hidden card"}
    >
      <div
        className="relative h-full w-full transition-transform duration-500"
        style={{
          transformStyle: "preserve-3d",
          transform: revealed ? "rotateY(180deg)" : "rotateY(0)",
        }}
      >
        {/* Back (face-down) — striped felt carpet */}
        <div
          className="absolute inset-0 grid grid-cols-3 grid-rows-3"
          style={{ backfaceVisibility: "hidden" }}
        >
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              style={{
                background:
                  (Math.floor(i / 3) + (i % 3)) % 2 === 0 ? FELT : FELT_DARK,
              }}
            />
          ))}
          {/* Memo overlay — only marks the player has toggled on are shown
              so unset marks don't clutter the face. Each mark sits in its
              own rounded cell with a dark tint for readability against the
              felt-green stripes. */}
          {!revealed && memos.size > 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-1">
              <div
                className="grid h-full w-full grid-cols-2 grid-rows-2 gap-0.5"
                style={{ fontFamily: "var(--font-voltorb-m5x7), monospace" }}
              >
                {([1, 2, 3] as TileValue[]).map((m) => (
                  <div
                    key={m}
                    className="flex items-center justify-center rounded-sm text-sm font-bold text-white"
                    style={{
                      background: memos.has(m) ? "rgba(0,0,0,0.45)" : "transparent",
                      visibility: memos.has(m) ? "visible" : "hidden",
                      lineHeight: 1,
                    }}
                  >
                    {m}
                  </div>
                ))}
                <div
                  className="flex items-center justify-center rounded-sm"
                  style={{
                    background: memos.has(0) ? "rgba(0,0,0,0.45)" : "transparent",
                    visibility: memos.has(0) ? "visible" : "hidden",
                  }}
                >
                  <VoltorbIcon size={16} />
                </div>
              </div>
            </div>
          )}
        </div>
        {/* Front (revealed) — scale-pulse fires when revealed flips true,
            timed to hit once the flip rotation passes 90° (~0.22 s into
            the 0.5 s flip) so the pop reads as the number "landing" on
            screen instead of bouncing before it's visible. */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: CARD_FACE,
            border: `2px solid ${CARD_FACE_INNER}`,
            borderRadius: 3,
          }}
          animate={revealed ? { scale: [1, 1.12, 1] } : { scale: 1 }}
          transition={{
            duration: 0.4,
            delay: revealed ? 0.22 : 0,
            times: [0, 0.5, 1],
            ease: "easeOut",
          }}
        >
          {value === 0 ? (
            <VoltorbIcon size={36} />
          ) : (
            <span
              className="text-3xl font-black text-white"
              style={{
                fontFamily: "var(--font-voltorb-m5x7), monospace",
                textShadow:
                  "1px 0 0 #222,-1px 0 0 #222,0 1px 0 #222,0 -1px 0 #222",
                lineHeight: 1,
              }}
            >
              {value}
            </span>
          )}
        </motion.div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// RowColCard — the coin-total + voltorb-count clue cards along the right
// and bottom edges of the board.
// ---------------------------------------------------------------------------

function RowColCard({
  sum,
  volts,
  tint,
}: {
  sum: number;
  volts: number;
  tint: string;
}) {
  // Upstream's signature RowColCard shape: the coin total overflows the top
  // edge of the card (absolute, negative offset) so it visually "stamps"
  // above the voltorb section. The card body shows the voltorb count
  // centered, with a hairline divider hinting at the old two-row layout.
  return (
    <div
      className={`relative h-full w-full ${panelChrome}`}
      style={{ background: tint, overflow: "visible" }}
    >
      {/* Coin total — breaks the top frame */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 -top-2 px-1 py-px ${panelChrome}`}
        style={{ background: tint }}
      >
        <span
          className="block text-xl font-black text-white"
          style={{
            fontFamily: "var(--font-voltorb-m5x7), monospace",
            lineHeight: 1,
            textShadow:
              "1px 0 0 #222,-1px 0 0 #222,0 1px 0 #222,0 -1px 0 #222",
          }}
        >
          {String(sum).padStart(2, "0")}
        </span>
      </div>
      {/* Voltorb count body */}
      <div className="flex h-full items-end justify-center gap-1 pb-1">
        <VoltorbIcon size={14} />
        <span
          className="text-base font-bold text-white"
          style={{
            fontFamily: "var(--font-voltorb-m5x7), monospace",
            lineHeight: 1,
          }}
        >
          {volts}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scoreboard
// ---------------------------------------------------------------------------

function Scoreboard({ label, value }: { label: string; value: number }) {
  // Remounting the digit span with key={value} kicks framer-motion's
  // initial→animate transition every time the number changes, giving each
  // multiplier reveal a brief pop instead of a silent swap.
  return (
    <div
      className={`flex items-center justify-between gap-4 bg-white px-4 py-2 ${panelChrome}`}
    >
      <span
        className="text-base uppercase tracking-wide text-gray-700"
        style={{
          fontFamily: "var(--font-voltorb-ds), monospace",
          lineHeight: 1,
        }}
      >
        {label}
      </span>
      <motion.span
        key={value}
        initial={{ scale: 1.3, color: "#b45309" }}
        animate={{ scale: 1, color: "#1f2937" }}
        transition={{ type: "spring", stiffness: 380, damping: 18 }}
        className="inline-block text-3xl font-black tabular-nums"
        style={{
          fontFamily: "var(--font-voltorb-stacked), monospace",
          lineHeight: 1,
          filter: "drop-shadow(1px 1px 0 rgba(0,0,0,0.15))",
        }}
      >
        {String(value).padStart(5, "0")}
      </motion.span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game header bar
// ---------------------------------------------------------------------------

function GameInfo({ level }: { level: number }) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2 text-white ${panelChrome}`}
      style={{
        background: FELT_DARK,
        fontFamily: "var(--font-voltorb-ds), monospace",
      }}
    >
      <span className="text-lg tracking-wide" style={{ lineHeight: 1 }}>
        VOLTORB FLIP
      </span>
      <span className="text-lg" style={{ lineHeight: 1 }}>
        Lv. {level}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

// localStorage key for the cumulative COINS total — upstream persists this
// so a visitor coming back tomorrow still sees their score. Namespaced so
// it can't collide with another game on the portfolio.
const STORAGE_KEY = "svf:totalCoins:v1";

export function SuperVoltorbFlipGame() {
  const [level, setLevel] = useState(1);
  const [board, setBoard] = useState<BoardState>(() => generateBoard(1));
  const [running, setRunning] = useState(0); // running coins this level
  const [total, setTotal] = useState(0); // cumulative across levels
  const [status, setStatus] = useState<"playing" | "lost" | "won">("playing");
  const [memoMode, setMemoMode] = useState(false);
  // Focused tile for keyboard navigation (index 0-24, row-major). Null when
  // the player hasn't engaged the keyboard yet — we don't draw a ring in
  // that state so the mouse-only experience stays unchanged.
  const [focused, setFocused] = useState<number | null>(null);

  // Restore saved total on mount — SSR-safe guard on window.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const parsed = Number.parseInt(saved, 10);
      if (Number.isFinite(parsed) && parsed >= 0) setTotal(parsed);
    }
  }, []);

  // Persist every time total changes (skips the 0 write on first mount
  // when there's nothing saved yet; harmless to write the same value).
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, String(total));
  }, [total]);

  // Row and col precomputed clues
  const rowClues = useMemo(
    () => Array.from({ length: 5 }, (_, r) => rowStats(board.tiles, r)),
    [board.tiles],
  );
  const colClues = useMemo(
    () => Array.from({ length: 5 }, (_, c) => colStats(board.tiles, c)),
    [board.tiles],
  );

  // When the player hits a voltorb we replicate upstream's column-by-column
  // reveal animation: every remaining voltorb flips face-up, staggered by
  // column (200 ms per column) so the cascade reads left-to-right. We run
  // this via a setTimeout chain off the initial "lost" transition.
  const triggerLossCascade = useCallback(() => {
    setBoard((prev) => {
      const next = { ...prev, revealed: prev.revealed.slice() };
      for (let c = 0; c < 5; c++) {
        const cc = c;
        setTimeout(() => {
          setBoard((inner) => {
            const revealed = inner.revealed.slice();
            for (let r = 0; r < 5; r++) {
              const i = r * 5 + cc;
              if (inner.tiles[i] === 0) revealed[i] = true;
            }
            return { ...inner, revealed };
          });
        }, cc * 200);
      }
      return next;
    });
  }, []);

  // Win cascade: sweep-reveal every remaining hidden tile column-by-column
  // so the player sees the whole cleared board before auto-advance. Faster
  // than the loss cascade (150 ms per column) since winning should feel
  // snappy rather than ceremonial.
  const triggerWinCascade = useCallback(() => {
    for (let c = 0; c < 5; c++) {
      const cc = c;
      setTimeout(() => {
        setBoard((inner) => {
          const revealed = inner.revealed.slice();
          for (let r = 0; r < 5; r++) {
            revealed[r * 5 + cc] = true;
          }
          return { ...inner, revealed };
        });
      }, cc * 150);
    }
  }, []);

  const flip = useCallback(
    (idx: number) => {
      if (status !== "playing") return;
      setBoard((prev) => {
        if (prev.revealed[idx]) return prev;
        const revealed = prev.revealed.slice();
        revealed[idx] = true;
        return { ...prev, revealed };
      });
      const v = board.tiles[idx];
      if (v === 0) {
        setStatus("lost");
        setRunning(0);
        triggerLossCascade();
        return;
      }
      setRunning((r) => (r === 0 ? v : r * v));
      // Win when every non-1, non-voltorb tile is revealed.
      const nonTrivialLeft = board.tiles.some(
        (t, i) => (t === 2 || t === 3) && !board.revealed[i] && i !== idx,
      );
      if (!nonTrivialLeft) {
        setStatus("won");
        triggerWinCascade();
      }
    },
    [board, status, triggerLossCascade, triggerWinCascade],
  );

  const toggleMemo = useCallback((idx: number, mark: TileValue) => {
    setBoard((prev) => {
      const memos = prev.memos.slice();
      const next = new Set(memos[idx]);
      if (next.has(mark)) next.delete(mark);
      else next.add(mark);
      memos[idx] = next;
      return { ...prev, memos };
    });
  }, []);

  // Auto-advance to next level on win; auto-reset on lose. Delays sized to
  // let the banner and — on lose — the five column-stagger voltorb reveals
  // play in full before the board reshuffles. Cascade finishes around
  // 1 s after flip; banner needs another beat to read. Win path is
  // shorter since there's no cascade to wait on.
  useEffect(() => {
    if (status === "won") {
      const timeout = setTimeout(() => {
        setTotal((t) => t + running);
        setRunning(0);
        setLevel((l) => l + 1);
        setBoard(generateBoard(level + 1));
        setStatus("playing");
      }, 2200);
      return () => clearTimeout(timeout);
    }
    if (status === "lost") {
      const timeout = setTimeout(() => {
        setRunning(0);
        setBoard(generateBoard(level));
        setStatus("playing");
      }, 2800);
      return () => clearTimeout(timeout);
    }
    return undefined;
  }, [status, level, running]);

  return (
    <div
      tabIndex={0}
      onKeyDown={(e) => {
        if (status !== "playing") return;
        const cur = focused ?? 12; // center tile if no prior focus
        const r = Math.floor(cur / 5);
        const c = cur % 5;
        let next = cur;
        switch (e.key) {
          case "ArrowLeft":
            next = r * 5 + ((c + 4) % 5);
            break;
          case "ArrowRight":
            next = r * 5 + ((c + 1) % 5);
            break;
          case "ArrowUp":
            next = ((r + 4) % 5) * 5 + c;
            break;
          case "ArrowDown":
            next = ((r + 1) % 5) * 5 + c;
            break;
          case " ":
          case "Enter":
            if (focused !== null && !board.revealed[focused]) {
              if (memoMode) {
                const m = ([1, 2, 3, 0] as TileValue[]).find(
                  (x) => !board.memos[focused].has(x),
                );
                if (m !== undefined) toggleMemo(focused, m);
              } else {
                flip(focused);
              }
            } else if (focused === null) {
              setFocused(12);
            }
            e.preventDefault();
            return;
          case "m":
          case "M":
            setMemoMode((m) => !m);
            e.preventDefault();
            return;
          default:
            return;
        }
        e.preventDefault();
        setFocused(next);
      }}
      className={`relative mx-auto flex w-full max-w-[420px] flex-col gap-3 p-4 focus:outline-hidden ${pokemonDs.variable} ${m5x7.variable} ${stackedPixel.variable}`}
      style={{
        background: FELT,
        borderRadius: 10,
        fontFamily: "var(--font-voltorb-ds), ui-monospace, monospace",
      }}
    >
      <GameInfo level={level} />
      <div className="flex flex-col gap-2">
        <Scoreboard label="Coins" value={total} />
        <Scoreboard label="This Game" value={running} />
      </div>
      <button
        type="button"
        onClick={() => {
          if (
            typeof window !== "undefined" &&
            !window.confirm("Reset your saved coin total and start a fresh level 1?")
          ) {
            return;
          }
          setTotal(0);
          setRunning(0);
          setLevel(1);
          setBoard(generateBoard(1));
          setStatus("playing");
        }}
        className={`self-end px-3 py-1 text-xs uppercase text-gray-800 ${panelChrome}`}
        style={{
          background: "#fff",
          fontFamily: "var(--font-voltorb-ds), monospace",
          lineHeight: 1,
        }}
      >
        Reset
      </button>

      <div
        className={`p-3 ${panelChrome}`}
        style={{ background: FELT_DARK }}
      >
        {/* Explicit 6x6 grid with each child placed by gridRow/gridColumn so
            clues land on the right column and bottom row regardless of
            iteration order. */}
        <div
          className="grid gap-1.5"
          style={{
            gridTemplateColumns: "repeat(5, 1fr) 56px",
            gridTemplateRows: "repeat(5, 1fr) 56px",
            aspectRatio: "6 / 6",
          }}
        >
          {Array.from({ length: 25 }).map((_, i) => {
            const r = Math.floor(i / 5);
            const c = i % 5;
            return (
              <div
                key={`t-${i}`}
                style={{
                  gridColumn: c + 1,
                  gridRow: r + 1,
                }}
              >
                <Card
                  value={board.tiles[i]}
                  revealed={board.revealed[i]}
                  memos={board.memos[i]}
                  memoMode={memoMode}
                  focused={focused === i}
                  onFlip={() => flip(i)}
                  onToggleMemo={(m) => toggleMemo(i, m)}
                />
              </div>
            );
          })}
          {/* Row clues → column 6, rows 1-5 */}
          {rowClues.map((s, r) => (
            <div key={`rc-${r}`} style={{ gridColumn: 6, gridRow: r + 1 }}>
              <RowColCard sum={s.sum} volts={s.volts} tint={HEADER_TINTS[r]} />
            </div>
          ))}
          {/* Col clues → row 6, columns 1-5 */}
          {colClues.map((s, c) => (
            <div key={`cc-${c}`} style={{ gridColumn: c + 1, gridRow: 6 }}>
              <RowColCard sum={s.sum} volts={s.volts} tint={HEADER_TINTS[c]} />
            </div>
          ))}
          {/* Memo toggle → bottom-right corner (col 6, row 6) */}
          <button
            type="button"
            onClick={() => setMemoMode((m) => !m)}
            className={`flex items-center justify-center text-sm uppercase ${panelChrome}`}
            style={{
              gridColumn: 6,
              gridRow: 6,
              background: memoMode ? "#fde68a" : "#fff",
              fontFamily: "var(--font-voltorb-ds), monospace",
              color: memoMode ? "#92400e" : "#1f2937",
              lineHeight: 1,
            }}
          >
            Memo
          </button>
        </div>
      </div>

      <AnimatePresence>
        {status === "lost" && (
          <motion.div
            key="lost-banner"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3 px-5 py-3 ${panelChrome}`}
            style={{
              background: "#7a1f1f",
              fontFamily: "var(--font-voltorb-ds), monospace",
            }}
          >
            <VoltorbIcon size={28} />
            <span className="text-lg font-black uppercase tracking-wider text-white">
              Busted!
            </span>
          </motion.div>
        )}
        {status === "won" && (
          <motion.div
            key="won-banner"
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 24 }}
            className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-3 text-center ${panelChrome}`}
            style={{
              background: "#eab308",
              fontFamily: "var(--font-voltorb-ds), monospace",
            }}
          >
            <div className="text-xl font-black uppercase tracking-widest text-gray-900">
              Level Cleared!
            </div>
            <div
              className="mt-1 text-sm text-gray-800"
              style={{ fontFamily: "var(--font-voltorb-stacked), monospace" }}
            >
              +{running} coins
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
