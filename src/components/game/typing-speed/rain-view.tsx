"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Heart, RotateCcw, Trophy } from "lucide-react";
import { useVisualViewport } from "@/hooks/use-visual-viewport";
import { isTextEntryTarget } from "../text-entry";
import { RAIN_LIVES, rainAccuracy, rainTarget, rainWpm, type RainState } from "./engine/rain";
import { isNewBest } from "./metrics";
import { PlaySheet, SheetHud } from "./play-sheet";
import { sheetLayout } from "./sheet-layout";
import { useRain } from "./use-rain";

const AREA_BASE =
  "relative cursor-text overflow-hidden rounded-2xl border border-(--border) bg-(--card) font-mono";
const AREA_PAGE = `${AREA_BASE} h-[420px]`;
const AREA_SHEET = `${AREA_BASE} min-h-0 flex-1`;
const ECHO_BASE =
  "flex min-h-11 items-center justify-center rounded-lg border border-(--border) bg-(--card) px-3 font-mono text-lg tracking-wide";

function pct(n: number): string {
  return `${(n * 100).toFixed(2)}%`;
}

function Lives({ lives }: { lives: number }) {
  return (
    <span
      role="img"
      aria-label={`Lives: ${lives}`}
      data-testid="ts-rain-lives"
      className="inline-flex items-center gap-1"
    >
      {Array.from({ length: RAIN_LIVES }, (_, i) => (
        <Heart
          key={i}
          aria-hidden="true"
          className={i < lives ? "h-4 w-4 fill-red-400 text-red-400" : "h-4 w-4 text-(--muted)/50"}
        />
      ))}
    </span>
  );
}

function RainStats({ rain }: { rain: RainState }) {
  return (
    <>
      <Lives lives={rain.lives} />
      <span
        data-testid="ts-rain-wave"
        className="font-mono text-sm font-semibold text-accent-blue tabular-nums"
      >
        Wave {rain.wave}
      </span>
      <span
        data-testid="ts-rain-score"
        className="font-mono text-sm font-semibold text-accent-green tabular-nums"
      >
        {rain.score}
      </span>
    </>
  );
}

/**
 * Word Rain: words fall from the top of the play area and a word typed through the hidden
 * input is cleared. The page holds a 420 px card; on a phone a run plays in the same sheet as
 * the timed modes, with the lives and wave in the one-row HUD and the typed echo under the
 * area, so all three stay above the keyboard.
 */
export function RainGame({
  header,
  phone,
  nextSeed,
  onSheetChange,
  onOver: onRunOver,
}: {
  /** Something above the area that goes inert while the sheet is up. */
  header?: ReactNode;
  phone: boolean;
  nextSeed: () => number;
  onSheetChange?: (on: boolean) => void;
  /** Called once when a run ends; returns the best score from before it, or null if none. */
  onOver?: (rain: RainState, bulk: number) => number | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [seed, setSeed] = useState(nextSeed);
  const [sheetOn, setSheetOn] = useState(false);
  const [wasPhone, setWasPhone] = useState(phone);
  if (phone !== wasPhone) {
    setWasPhone(phone);
    if (!phone) setSheetOn(false);
  }
  const sheet = phone && sheetOn;
  const viewport = useVisualViewport(sheet);
  const layout = sheetLayout({ vvHeight: viewport.height, keyboardOpen: viewport.keyboardOpen });

  const [outcome, setOutcome] = useState<{ prior: number | null; bulk: number } | null>(null);
  const onOver = useCallback(
    (r: RainState, bulk: number) => {
      setOutcome({ prior: onRunOver?.(r, bulk) ?? null, bulk });
    },
    [onRunOver],
  );
  const { rain, buffer, invalid, started, active, press, reset } = useRain(seed, {
    inputRef,
    onOver,
  });
  const over = rain.status === "over";
  const [shake, setShake] = useState(0);
  const [wasInvalid, setWasInvalid] = useState(false);
  if (invalid !== wasInvalid) {
    setWasInvalid(invalid);
    if (invalid) setShake((s) => s + 1);
  }

  useEffect(() => {
    onSheetChange?.(sheet);
  }, [sheet, onSheetChange]);

  // The sheet owns the screen: lock the page scroll while it is up.
  useEffect(() => {
    if (!sheet) return;
    const root = document.documentElement;
    root.classList.add("typing-lock");
    return () => root.classList.remove("typing-lock");
  }, [sheet]);

  const startTyping = useCallback(() => {
    inputRef.current?.focus();
    if (phone) setSheetOn(true);
  }, [phone]);

  const again = useCallback(() => {
    const next = nextSeed();
    setSeed(next);
    setOutcome(null);
    reset(next, true);
    // Synchronous, inside the click, so mobile Safari keeps the keyboard.
    inputRef.current?.focus();
    if (phone) setSheetOn(true);
  }, [nextSeed, reset, phone]);

  // Exit abandons the run: the keyboard closes and the page is as it was.
  const exit = useCallback(() => {
    setSheetOn(false);
    inputRef.current?.blur();
    const next = nextSeed();
    setSeed(next);
    setOutcome(null);
    reset(next, false);
  }, [nextSeed, reset]);

  // A printable key focuses the input (and so starts the run); Escape restarts; Enter plays again.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      const ownInput = !!el && el === inputRef.current;
      const inTextField = isTextEntryTarget(e);
      const inButton = !!el?.closest("button, a");
      if (e.key === "Escape") {
        if (inTextField && !ownInput) return;
        if (started) {
          e.preventDefault();
          again();
        }
        return;
      }
      if (e.key === "Enter") {
        if (over && !inButton && !(inTextField && !ownInput)) {
          e.preventDefault();
          again();
        }
        return;
      }
      if (over || e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (inTextField || (e.key === " " && inButton)) return;
      if (document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
        if (e.key !== " ") press(e.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, over, again, press]);

  const target = rainTarget(rain, buffer);
  const paused = !over && !active;

  const area = (
    <div
      data-testid="ts-rain-area"
      data-missed={rain.missed}
      data-wave={rain.wave}
      data-lives={rain.lives}
      className={sheet ? AREA_SHEET : AREA_PAGE}
      onClick={() => !over && startTyping()}
      style={{ background: "linear-gradient(180deg, rgba(99,102,241,0.04), rgba(239,68,68,0.08))" }}
    >
      {rain.words.map((w) => {
        const hit = target?.id === w.id ? buffer.length : 0;
        return (
          <span
            key={w.id}
            data-testid="ts-rain-word"
            data-x={w.x.toFixed(4)}
            data-y={w.y.toFixed(4)}
            className="absolute text-lg font-semibold whitespace-nowrap text-(--foreground)"
            style={{
              left: pct(w.x),
              top: pct(w.y),
              transform: `translate(-${pct(w.x)}, -${pct(w.y)})`,
            }}
          >
            {hit > 0 ? (
              <>
                <span className="text-accent-green">{w.text.slice(0, hit)}</span>
                {w.text.slice(hit)}
              </>
            ) : (
              w.text
            )}
          </span>
        );
      })}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-red-400/60" />
      {paused && (
        <div
          data-testid="ts-rain-pause"
          className="absolute inset-0 flex items-center justify-center bg-(--card)/80 font-sans text-sm font-semibold text-accent-amber"
        >
          {started ? "Tap to keep typing" : "Click or press a key to start"}
        </div>
      )}
      {over && (
        <div
          data-testid="ts-rain-over"
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-y-auto bg-(--card)/90 p-4 text-center font-sans"
        >
          <p className="font-display text-2xl font-black text-accent-green">Game over</p>
          <p className="font-mono text-4xl font-black text-accent-green tabular-nums">
            <span data-testid="ts-rain-result-score">{rain.score}</span>
            <span className="ml-1 font-sans text-base font-semibold text-(--muted)">letters</span>
          </p>
          <dl className="grid grid-cols-4 gap-x-4 text-sm text-(--muted)">
            {(
              [
                ["words", "Words", String(rain.cleared)],
                ["wave", "Wave", String(rain.wave)],
                ["wpm", "WPM", String(rainWpm(rain))],
                ["acc", "Accuracy", `${rainAccuracy(rain)}%`],
              ] as const
            ).map(([id, label, value]) => (
              <div key={id}>
                <dd
                  data-testid={`ts-rain-result-${id}`}
                  className="font-mono text-lg font-semibold text-(--foreground) tabular-nums"
                >
                  {value}
                </dd>
                <dt>{label}</dt>
              </div>
            ))}
          </dl>
          {outcome && !outcome.bulk && isNewBest(rain.score, outcome.prior) && (
            <p
              data-testid="ts-rain-new-best"
              className="flex items-center gap-1 text-sm font-semibold text-accent-amber"
            >
              <Trophy className="h-3.5 w-3.5" />
              New best
            </p>
          )}
          {outcome && outcome.bulk > 0 && (
            <p className="text-xs text-accent-amber">
              Typed with keyboard suggestions, so this run cannot set a best.
            </p>
          )}
          <button
            type="button"
            onClick={again}
            className="inline-flex min-h-11 min-w-11 touch-manipulation items-center gap-2 rounded-lg border border-(--border) px-5 py-2 text-sm font-semibold text-(--muted) transition-colors hover:text-(--foreground)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Play again
          </button>
        </div>
      )}
    </div>
  );

  const echo = (
    <div
      key={shake}
      data-testid="ts-rain-echo"
      className={[ECHO_BASE, invalid ? "ts-rain-shake text-red-400" : "text-(--foreground)"].join(
        " ",
      )}
    >
      {buffer}
    </div>
  );

  return (
    <div className="space-y-5">
      {header !== undefined && header !== null && <div inert={sheet}>{header}</div>}
      <PlaySheet
        active={sheet}
        compact={layout.compact}
        viewport={viewport}
        hud={<SheetHud lead={<RainStats rain={rain} />} onRestart={again} onExit={exit} />}
      >
        {!sheet && (
          <div className="flex items-center gap-5" data-testid="ts-rain-stats">
            <RainStats rain={rain} />
          </div>
        )}
        {area}
        {echo}
      </PlaySheet>
      <input
        ref={inputRef}
        type="text"
        data-ts-hidden
        aria-label="Word Rain typing area"
        inputMode="text"
        enterKeyHint="next"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        defaultValue=" "
        className="pointer-events-none fixed left-0 h-px w-px text-base opacity-0"
        style={{ top: viewport.top }}
      />
    </div>
  );
}
