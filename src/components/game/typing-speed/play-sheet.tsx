import type { CSSProperties, PointerEvent, ReactNode } from "react";
import { RotateCcw, X } from "lucide-react";
import type { ViewportLayout } from "@/hooks/viewport-layout";

const SHEET_CLASS =
  "fixed inset-x-0 z-80 flex flex-col gap-2 overflow-y-auto overscroll-contain bg-(--background) px-3 pb-3";
const SHEET_COMPACT_CLASS =
  "fixed inset-x-0 z-80 flex flex-col gap-1 overflow-y-auto overscroll-contain bg-(--background) px-3 pb-1";
const HUD_BUTTON =
  "inline-flex h-11 min-h-11 w-11 min-w-11 touch-manipulation items-center justify-center rounded-lg font-sans text-(--muted) transition-colors hover:text-(--foreground)";

/**
 * One wrapper for the live slot and the text. On a phone, while a run is on, it is the fixed
 * sheet: exactly as tall as the visible area above the keyboard, with a one-row HUD on top.
 * Otherwise it is a plain stack. It is the same element either way (only its class and style
 * change) so the text view never remounts when the sheet opens.
 */
export function PlaySheet({
  active,
  compact,
  viewport,
  hud,
  children,
}: {
  active: boolean;
  /** The shortest sheets (landscape with the keyboard up) squeeze their gaps. */
  compact: boolean;
  viewport: ViewportLayout;
  hud: ReactNode;
  children: ReactNode;
}) {
  const style = active
    ? ({
        "--ts-vv-h": viewport.height > 0 ? `${viewport.height}px` : "100dvh",
        "--ts-vv-top": `${viewport.top}px`,
        top: "var(--ts-vv-top)",
        height: "var(--ts-vv-h)",
      } as CSSProperties)
    : undefined;
  return (
    <div
      data-testid={active ? "ts-sheet" : undefined}
      className={active ? (compact ? SHEET_COMPACT_CLASS : SHEET_CLASS) : "space-y-5"}
      style={style}
    >
      {active ? hud : null}
      {children}
    </div>
  );
}

// A press must not move focus off the hidden input, or the keyboard flickers shut and open.
const keepKeyboard = (e: PointerEvent<HTMLElement>) => e.preventDefault();

/** Time, live WPM, Restart and Exit in one row; every control is a 44 px target. */
export function SheetHud({
  time,
  wpm,
  pace,
  onRestart,
  onExit,
}: {
  time: string;
  wpm: number;
  /** The ghost pace chip, when there is a ghost; it shares the row and never grows it. */
  pace?: ReactNode;
  onRestart: () => void;
  onExit: () => void;
}) {
  return (
    <div className="flex items-center gap-3 pt-1" data-testid="ts-hud">
      <span className="font-mono text-sm font-semibold text-accent-blue tabular-nums">{time}s</span>
      <span className="font-mono text-sm font-semibold text-accent-green tabular-nums">
        {wpm} WPM
      </span>
      {pace}
      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          aria-label="Restart"
          onPointerDown={keepKeyboard}
          onClick={onRestart}
          className={HUD_BUTTON}
        >
          <RotateCcw className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Exit"
          onPointerDown={keepKeyboard}
          onClick={onExit}
          className={HUD_BUTTON}
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
