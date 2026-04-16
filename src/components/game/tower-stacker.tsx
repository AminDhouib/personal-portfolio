"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

/**
 * Tower Stacker — embedded port of iamkun/tower_game (MIT License).
 *
 * The upstream HTML5 game runs inside an <iframe> at /tower_stacker/game.html.
 * The iframe posts events ("ts:score", "ts:milestone", "ts:gameover", ...) via
 * window.postMessage, which this component listens to in order to render the
 * animated score HUD, streak chip, milestone bursts, and themed game-over
 * card on top. See /public/tower_stacker/LICENSE for the original MIT notice.
 */

type TsMessage =
  | { type: "ts:ready" }
  | { type: "ts:started" }
  | {
      type: "ts:score";
      score: number;
      blocks: number;
      streak: number;
      bestStreak: number;
      perfects: number;
      perfect: boolean;
    }
  | { type: "ts:milestone"; blocks: number }
  | { type: "ts:fail"; fails: number }
  | { type: "ts:gameover"; score: number; blocks: number; bestStreak: number; perfects: number };

type GameState = {
  score: number;
  blocks: number;
  streak: number;
  bestStreak: number;
  perfects: number;
  started: boolean;
  gameOver: boolean;
};

const INITIAL: GameState = {
  score: 0,
  blocks: 0,
  streak: 0,
  bestStreak: 0,
  perfects: 0,
  started: false,
  gameOver: false,
};

export default function TowerStacker(_props: { initialSeed?: string } = {}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number }>({ w: 360, h: 600 });
  const [iframeKey, setIframeKey] = useState(0);
  const [state, setState] = useState<GameState>(INITIAL);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [scorePulseKey, setScorePulseKey] = useState(0);
  const [perfectFlashKey, setPerfectFlashKey] = useState(0);
  const [streakPopKey, setStreakPopKey] = useState(0);
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitRank, setSubmitRank] = useState<number | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = () => {
      const rect = el.getBoundingClientRect();
      const maxWidth = Math.min(440, Math.floor(rect.width));
      const w = Math.max(280, maxWidth);
      const h = Math.min(720, Math.round(w * 1.5));
      setFrameSize({ w, h });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const iframe = iframeRef.current;
      if (!iframe || e.source !== iframe.contentWindow) return;
      const d = e.data as TsMessage | null;
      if (!d || typeof d !== "object" || typeof d.type !== "string") return;
      switch (d.type) {
        case "ts:started":
          setState({ ...INITIAL, started: true });
          break;
        case "ts:score":
          setState((s) => ({
            ...s,
            score: d.score,
            blocks: d.blocks,
            streak: d.streak,
            bestStreak: Math.max(s.bestStreak, d.bestStreak),
            perfects: d.perfects,
            started: true,
          }));
          setScorePulseKey((k) => k + 1);
          if (d.perfect) {
            setPerfectFlashKey((k) => k + 1);
            setStreakPopKey((k) => k + 1);
          }
          break;
        case "ts:milestone": {
          const n = d.blocks;
          setMilestone(n);
          window.setTimeout(() => {
            setMilestone((cur) => (cur === n ? null : cur));
          }, 1400);
          break;
        }
        case "ts:gameover":
          setState((s) => ({
            ...s,
            score: d.score,
            blocks: d.blocks,
            bestStreak: d.bestStreak,
            perfects: d.perfects,
            gameOver: true,
          }));
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [iframeKey]);

  const handlePlayAgain = useCallback(() => {
    setState(INITIAL);
    setMilestone(null);
    setName("");
    setSubmitted(false);
    setSubmitRank(null);
    setIframeKey((k) => k + 1);
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (submitting || submitted) return;
      setSubmitting(true);
      try {
        const res = await fetch("/api/leaderboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim().slice(0, 12) || "Stacker",
            score: state.score,
            level: Math.max(1, state.blocks),
            game: "tower-stacker",
          }),
        });
        if (res.ok) {
          const json = (await res.json()) as { rank?: number };
          setSubmitRank(typeof json.rank === "number" ? json.rank : null);
          setSubmitted(true);
        }
      } catch {
        // Silent — a failed submit shouldn't break the UI.
      } finally {
        setSubmitting(false);
      }
    },
    [name, state.score, state.blocks, submitting, submitted],
  );

  const showHud = state.started && !state.gameOver;

  return (
    <div
      ref={containerRef}
      className="relative w-full flex flex-col items-center justify-center gap-2"
      style={{ minHeight: 480 }}
    >
      <div
        className="flex w-full items-end justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-foreground/40"
        style={{ maxWidth: frameSize.w }}
      >
        <span>TWR-01 / REV.A</span>
        <span className="tabular-nums">
          {frameSize.w}×{frameSize.h}
        </span>
      </div>
      <div
        className="relative overflow-hidden bg-[#05070d]"
        style={{
          width: frameSize.w,
          height: frameSize.h,
          boxShadow:
            "0 0 60px -20px rgba(239,68,68,0.25), inset 0 0 0 1px rgba(148,163,184,0.18)",
        }}
      >
        <CornerTick position="tl" />
        <CornerTick position="tr" />
        <CornerTick position="bl" />
        <CornerTick position="br" />
        <iframe
          ref={iframeRef}
          key={`${iframeKey}-${frameSize.w}x${frameSize.h}`}
          src="/tower_stacker/game.html"
          title="Tower Stacker"
          width={frameSize.w}
          height={frameSize.h}
          scrolling="no"
          className="block border-0"
          style={{ background: "#05070d" }}
          sandbox="allow-scripts allow-same-origin"
          allow="autoplay"
        />

        {showHud && (
          <div className="pointer-events-none absolute left-0 right-0 top-3 z-20 flex flex-col items-center gap-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-foreground/45">
              Height
            </div>
            <div
              key={scorePulseKey}
              className="ts-score-pulse font-mono text-5xl font-bold leading-none tabular-nums text-foreground"
              style={{
                textShadow:
                  "0 2px 12px rgba(0,0,0,0.7), 0 0 24px rgba(239,68,68,0.2)",
              }}
            >
              {state.score}
            </div>
            {state.streak >= 2 && (
              <div
                key={streakPopKey}
                className="ts-streak-pop inline-flex items-center gap-1.5 border border-accent-red/60 bg-accent-red/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-accent-red backdrop-blur-sm"
              >
                <span className="tabular-nums">×{state.streak}</span>
                <span className="text-foreground/70">Perfect</span>
              </div>
            )}
          </div>
        )}

        {showHud && (
          <div
            key={`flash-${perfectFlashKey}`}
            className="ts-perfect-flash pointer-events-none absolute inset-0 z-10"
          />
        )}

        {milestone !== null && (
          <div className="ts-milestone-burst pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1">
            <div className="font-mono text-[11px] uppercase tracking-[0.45em] text-accent-red/80">
              Milestone
            </div>
            <div
              className="font-mono text-7xl font-bold tabular-nums text-foreground"
              style={{
                textShadow:
                  "0 4px 24px rgba(0,0,0,0.8), 0 0 40px rgba(239,68,68,0.55)",
              }}
            >
              {milestone}
            </div>
          </div>
        )}

        {state.gameOver && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
            <div
              className="ts-gameover-in relative w-full max-w-sm border border-accent-red/40 bg-[#05070d] p-6 text-center"
              style={{ boxShadow: "0 0 80px -10px rgba(239, 68, 68, 0.5)" }}
            >
              <CornerTick position="tl" variant="card" />
              <CornerTick position="tr" variant="card" />
              <CornerTick position="bl" variant="card" />
              <CornerTick position="br" variant="card" />
              <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-accent-red">
                Structural Failure
              </div>
              <div
                className="font-mono mt-2 mb-4 text-6xl font-bold leading-none tabular-nums text-foreground"
                style={{ textShadow: "0 0 24px rgba(239,68,68,0.3)" }}
              >
                {state.score}
              </div>
              <div className="mb-5 grid grid-cols-3 gap-2">
                <Stat label="Blocks" value={state.blocks} />
                <Stat label="Best Streak" value={state.bestStreak} />
                <Stat label="Perfect" value={state.perfects} />
              </div>

              {!submitted ? (
                <form onSubmit={handleSubmit} className="mb-3">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="YOUR NAME"
                    maxLength={12}
                    disabled={submitting}
                    className="w-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2 font-mono text-xs uppercase tracking-[0.15em] text-foreground placeholder:text-muted focus:border-accent-red/60 focus:outline-none focus:ring-1 focus:ring-accent-red/40"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="mt-2 w-full border border-accent-red/70 bg-accent-red/10 px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.3em] text-accent-red transition hover:bg-accent-red/20 hover:border-accent-red disabled:opacity-50"
                  >
                    {submitting ? "Submitting…" : "Submit score"}
                  </button>
                </form>
              ) : (
                <div className="mb-3 border border-accent-red/30 bg-accent-red/10 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-foreground">
                  {submitRank !== null ? (
                    <>
                      Ranked <span className="font-bold text-accent-red">#{submitRank}</span> —
                      submitted
                    </>
                  ) : (
                    <>Score submitted</>
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={handlePlayAgain}
                className="w-full border border-[var(--border)] bg-transparent px-4 py-2 font-mono text-xs font-bold uppercase tracking-[0.3em] text-foreground/80 transition hover:border-accent-red/50 hover:text-foreground"
              >
                Play again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-[var(--border)] bg-[var(--surface)] px-2 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted">
        {label}
      </div>
      <div className="font-mono text-lg font-bold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
}

function CornerTick({
  position,
  variant = "frame",
}: {
  position: "tl" | "tr" | "bl" | "br";
  variant?: "frame" | "card";
}) {
  const size = variant === "frame" ? 14 : 10;
  const color =
    variant === "frame" ? "rgba(239,68,68,0.75)" : "rgba(239,68,68,0.6)";
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
