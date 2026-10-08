import type { CSSProperties, ReactNode, RefObject } from "react";

/** What the DOM overlay shows. The canvas never carries text the player must read. */
export interface HudState {
  floors: number;
  score: number;
  streak: number;
  bestStreak: number;
  perfects: number;
  /** The width of the top slab, in world units. */
  width: number;
}

export function Hud({
  hud,
  scorePulseKey,
  streakPopKey,
  perfectFlashKey,
  milestone,
  callout,
}: {
  hud: HudState;
  scorePulseKey: number;
  streakPopKey: number;
  perfectFlashKey: number;
  milestone: number | null;
  callout: string | null;
}) {
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-14 pt-[calc(env(safe-area-inset-top)+3rem)]">
        <div className="flex flex-col items-start leading-none">
          <div className="text-foreground/70 font-mono text-[9px] font-bold tracking-[0.3em] uppercase">
            Floors
          </div>
          <div className="text-foreground mt-1 font-mono text-[26px] leading-none font-bold tabular-nums">
            {hud.floors}
          </div>
        </div>
        {hud.streak >= 2 ? (
          <div
            key={streakPopKey}
            className="ts-streak-pop inline-flex items-center gap-1.5 border border-accent-red/70 bg-accent-red/15 px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.3em] text-accent-red uppercase"
          >
            <span className="tabular-nums">x{hud.streak}</span>
            <span className="text-foreground/80">Perfect</span>
          </div>
        ) : (
          <div className="text-foreground/35 font-mono text-[9px] font-bold tracking-[0.4em] uppercase">
            Stack
          </div>
        )}
        <div className="flex flex-col items-end leading-none">
          <div className="text-foreground/70 font-mono text-[9px] font-bold tracking-[0.3em] uppercase">
            Score
          </div>
          <div
            key={scorePulseKey}
            className="ts-score-pulse text-foreground mt-1 font-mono text-[26px] leading-none font-bold tabular-nums"
            style={{ textShadow: "0 2px 10px rgba(0,0,0,0.9), 0 0 16px rgba(239,68,68,0.35)" }}
          >
            {hud.score}
          </div>
        </div>
      </div>

      <div className="text-foreground/60 pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center font-mono text-[10px] tracking-[0.3em] uppercase">
        Width <span className="ml-1.5 tabular-nums">{hud.width}</span>
      </div>

      {callout !== null && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 z-20 flex justify-center font-mono text-sm font-bold tracking-[0.3em] text-accent-red">
          {callout}
        </div>
      )}

      <div
        key={`flash-${perfectFlashKey}`}
        className={
          perfectFlashKey > 0
            ? "ts-perfect-flash pointer-events-none absolute inset-0 z-10"
            : "hidden"
        }
      />

      {milestone !== null && (
        <div className="ts-milestone-burst pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1">
          <div className="font-mono text-[11px] tracking-[0.45em] text-accent-red/80 uppercase">
            Milestone
          </div>
          <div
            className="text-foreground font-mono text-7xl font-bold tabular-nums"
            style={{ textShadow: "0 4px 24px rgba(0,0,0,0.8), 0 0 40px rgba(239,68,68,0.55)" }}
          >
            {milestone}
          </div>
        </div>
      )}
    </>
  );
}

export function OverCard({
  hud,
  best,
  cardRef,
  onPlayAgain,
  children,
}: {
  hud: HudState;
  /** The best score on this device for the mode just played. */
  best: number;
  cardRef: RefObject<HTMLDivElement | null>;
  onPlayAgain: () => void;
  /** The board panel (or the free-build pointer), between the stats and Play again. */
  children?: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        ref={cardRef}
        tabIndex={-1}
        role="group"
        aria-label="Game over"
        data-testid="tower-over-card"
        className="ts-gameover-in relative max-h-full w-full max-w-sm overflow-y-auto border border-accent-red/40 bg-[#05070d] p-6 text-center outline-none"
        style={{ boxShadow: "0 0 80px -10px rgba(239, 68, 68, 0.5)" }}
      >
        <CornerTick position="tl" variant="card" />
        <CornerTick position="tr" variant="card" />
        <CornerTick position="bl" variant="card" />
        <CornerTick position="br" variant="card" />
        <div className="font-mono text-[10px] tracking-[0.35em] text-accent-red uppercase">
          Structural failure
        </div>
        <div
          className="text-foreground mt-2 mb-4 font-mono text-6xl leading-none font-bold tabular-nums"
          style={{ textShadow: "0 0 24px rgba(239,68,68,0.3)" }}
        >
          {hud.score}
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2">
          <Stat label="Floors" value={hud.floors} />
          <Stat label="Perfects" value={hud.perfects} />
          <Stat label="Best streak" value={hud.bestStreak} />
        </div>
        <div className="text-muted mb-4 font-mono text-[10px] tracking-[0.25em] uppercase">
          Best on this device <span className="text-foreground tabular-nums">{best}</span>
        </div>
        {children}
        <button
          type="button"
          onClick={onPlayAgain}
          className="text-foreground/80 hover:text-foreground min-h-11 w-full min-w-11 border border-[var(--border)] bg-transparent px-4 py-2 font-mono text-xs font-bold tracking-[0.3em] uppercase transition hover:border-accent-red/50"
        >
          Play again
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] px-2 py-2">
      <div className="text-muted font-mono text-[9px] tracking-[0.25em] uppercase">{label}</div>
      <div className="text-foreground font-mono text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

export function CornerTick({
  position,
  variant = "frame",
}: {
  position: "tl" | "tr" | "bl" | "br";
  variant?: "frame" | "card";
}) {
  const size = variant === "frame" ? 14 : 10;
  const color = variant === "frame" ? "rgba(239,68,68,0.75)" : "rgba(239,68,68,0.6)";
  const offset = variant === "frame" ? 6 : 4;
  const style: CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    borderColor: color,
    borderStyle: "solid",
    borderWidth: 0,
    pointerEvents: "none",
    zIndex: 25,
  };
  if (position === "tl") {
    style.top = offset;
    style.left = offset;
    style.borderTopWidth = 1;
    style.borderLeftWidth = 1;
  } else if (position === "tr") {
    style.top = offset;
    style.right = offset;
    style.borderTopWidth = 1;
    style.borderRightWidth = 1;
  } else if (position === "bl") {
    style.bottom = offset;
    style.left = offset;
    style.borderBottomWidth = 1;
    style.borderLeftWidth = 1;
  } else {
    style.bottom = offset;
    style.right = offset;
    style.borderBottomWidth = 1;
    style.borderRightWidth = 1;
  }
  return <div style={style} />;
}
