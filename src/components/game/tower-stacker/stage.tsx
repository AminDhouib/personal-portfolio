"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BoardPanel, type FinishedRun } from "./board-panel";
import { cameraTarget, stepCamera, type Camera } from "./camera";
import { dropKey, isTextEntryTarget, shouldBlockScroll } from "./controls";
import { utcDayKey } from "@/lib/arcade/boards";
import { dailyTowerSeed, freeSeed } from "./daily";
import { spawnDebris, stepDebris, type DebrisPiece } from "./debris";
import {
  BASE_WIDTH,
  BLOCK_HEIGHT,
  GROW_AMOUNT,
  drop,
  newRun,
  pauseRun,
  resumeRun,
  runSeconds,
  topSlab,
  type DropOutcome,
  type TowerRun,
} from "./engine";
import { createTowerAudio, readMuted, type TowerAudio } from "./audio";
import { CornerTick, Hud, OverCard, type HudState } from "./hud";
import { stageLayout, type StageLayout } from "./layout";
import { ModeRow, type TowerMode } from "./mode-row";
import { PULSE_MS, paintFrame } from "./painter";
import { usePlaySheet } from "./play-sheet";
import { activeStreak, markHintSeen, recordRun, setHandle } from "./stats";
import { CUES, perfectCue } from "./sound-cues";
import { useTowerLoop } from "./use-tower-loop";
import { useTowerStats } from "./use-tower-stats";

type Phase = "ready" | "live" | "paused" | "over";

const FIELD = "#05070d";
const GROUND_PX = 48;
const SHAKE_MS = 160;
const MILESTONE_EVERY = 10;
/** The ready screen paints a still tower with the crane partway across. */
const READY_RUN = newRun(1, 0);
const READY_NOW = 900;

const EMPTY_HUD: HudState = {
  floors: 0,
  score: 0,
  streak: 0,
  bestStreak: 0,
  perfects: 0,
  width: BASE_WIDTH,
};

/** The stored mute choice never changes under us, so there is nothing to subscribe to. */
function noopSubscribe(): () => void {
  return () => undefined;
}

/**
 * The first-run hint stays until the first landing. Kept in memory for this page load too,
 * so a blocked localStorage still dismisses it; tower:stats remembers it across visits.
 */
let hintDismissed = false;

function randomSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return bytes[0] ?? 1;
}

function hudOf(run: TowerRun): HudState {
  return {
    floors: run.slabs.length - 1,
    score: run.score,
    streak: run.streak,
    bestStreak: run.bestStreak,
    perfects: run.perfects,
    width: topSlab(run).width,
  };
}

function describeLanding(floors: number, outcome: DropOutcome): string {
  if (outcome.kind === "perfect") return `Floor ${floors}. Perfect, streak ${outcome.streak}.`;
  if (outcome.kind === "trim") return `Floor ${floors}. Trimmed to ${outcome.slab.width}.`;
  return `Missed. Your tower ends at ${floors} floors.`;
}

export function Stage({ seedText }: { seedText?: string }) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const startRef = useRef<HTMLButtonElement | null>(null);
  const { sheet, enter: enterSheet, exit: exitSheet } = usePlaySheet();

  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState<HudState>(EMPTY_HUD);
  const [layout, setLayout] = useState<StageLayout>(() =>
    stageLayout({ containerWidth: 440, viewportHeight: 900, sheet: false }),
  );
  const [announcement, setAnnouncement] = useState("");
  const [scorePulseKey, setScorePulseKey] = useState(0);
  const [streakPopKey, setStreakPopKey] = useState(0);
  const [perfectFlashKey, setPerfectFlashKey] = useState(0);
  const [milestone, setMilestone] = useState<number | null>(null);
  const [callout, setCallout] = useState<string | null>(null);
  // The stored choice (false on the server, so hydration agrees); a click overrides it.
  const storedMuted = useSyncExternalStore(noopSubscribe, readMuted, () => false);
  const [mutedChoice, setMuted] = useState<boolean | null>(null);
  const muted = mutedChoice ?? storedMuted;
  const { stats, update: updateStats } = useTowerStats();
  const [showHint, setShowHint] = useState(() => !hintDismissed && !stats.seenHint);
  const [finished, setFinished] = useState<FinishedRun | null>(null);
  // A ?tower-seed= text preselects Free build; otherwise Today's tower is the default.
  const [mode, setMode] = useState<TowerMode>(seedText ? "free" : "daily");
  // The mode and UTC day the live run began with, taken at Start so a run that crosses
  // midnight still knows which tower it was.
  const [runInfo, setRunInfo] = useState<{ mode: TowerMode; dayKey: string } | null>(null);
  const [settled, setSettled] = useState(false);

  const runRef = useRef<TowerRun | null>(null);
  const runInfoRef = useRef<{ mode: TowerMode; dayKey: string } | null>(null);
  const phaseRef = useRef<Phase>("ready");
  const cameraRef = useRef<Camera>({ x: 0, y: 0 });
  const debrisRef = useRef<DebrisPiece[]>([]);
  const pulsesRef = useRef<number[]>([]);
  const landedAtRef = useRef<number | null>(null);
  const shakeRef = useRef({ until: 0, amp: 0 });
  const layoutRef = useRef(layout);
  const audioRef = useRef<TowerAudio | null>(null);
  const timersRef = useRef<number[]>([]);

  const dpr = useMemo(
    () => (typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1)),
    [],
  );

  const setPhaseBoth = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  // ---- sizing ------------------------------------------------------------
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const apply = () => {
      const next = stageLayout({
        containerWidth: sheet
          ? window.innerWidth
          : el.parentElement?.clientWidth || el.clientWidth || 440,
        viewportHeight: window.innerHeight || 900,
        sheet,
      });
      layoutRef.current = next;
      setLayout((prev) =>
        prev.cssWidth === next.cssWidth && prev.cssHeight === next.cssHeight ? prev : next,
      );
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [sheet]);

  // ---- painting ----------------------------------------------------------
  const paint = useCallback(
    (now: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const lay = layoutRef.current;
      const run = runRef.current ?? READY_RUN;
      const clock = runRef.current ? (run.pausedAt ?? run.endedAt ?? now) : READY_NOW;
      const shake = shakeRef.current;
      const k = clock < shake.until ? shake.amp * Math.sin(clock * 0.09) : 0;
      pulsesRef.current = pulsesRef.current.filter((at) => clock - at < PULSE_MS);
      paintFrame(ctx, {
        run,
        camera: cameraRef.current,
        debris: debrisRef.current,
        now: clock,
        layout: lay,
        dpr,
        pulses: pulsesRef.current,
        landedAt: landedAtRef.current,
        shake: { x: k, y: k * 0.5 },
      });
    },
    [dpr],
  );

  const frame = useCallback(
    (now: number, dt: number) => {
      const run = runRef.current;
      if (run) {
        const lay = layoutRef.current;
        const viewWorld = (lay.cssHeight - GROUND_PX) / lay.scale;
        cameraRef.current = stepCamera(cameraRef.current, cameraTarget(run, viewWorld), dt);
        debrisRef.current = stepDebris(
          debrisRef.current,
          dt,
          cameraRef.current.y - GROUND_PX / lay.scale,
        );
      }
      paint(now);
    },
    [paint],
  );

  // Static repaint when nothing animates (ready, paused, a resize).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = Math.round(layout.cssWidth * dpr);
    canvas.height = Math.round(layout.cssHeight * dpr);
    paint(performance.now());
  }, [layout, dpr, phase, paint]);

  const animating = phase === "live" || (phase === "over" && !settled);

  const pauseLive = useCallback(() => {
    const run = runRef.current;
    if (phaseRef.current !== "live" || !run) return;
    runRef.current = pauseRun(run, performance.now());
    setPhaseBoth("paused");
  }, [setPhaseBoth]);

  const { targetRef } = useTowerLoop({ active: animating, frame, onPause: pauseLive });

  // ---- run lifecycle -----------------------------------------------------
  // `forced` starts a given mode at once (the over card's "Play today's tower"), since a
  // setMode in the same tick would not yet be visible here.
  const startRun = useCallback(
    (forced?: TowerMode) => {
      if (!audioRef.current) audioRef.current = createTowerAudio();
      audioRef.current.unlock();
      setMuted(audioRef.current.isMuted());
      const runMode = forced ?? mode;
      if (forced) setMode(forced);
      const dayKey = utcDayKey(new Date());
      const seed =
        runMode === "daily" ? dailyTowerSeed(dayKey) : seedText ? freeSeed(seedText) : randomSeed();
      const run = newRun(seed, performance.now());
      runInfoRef.current = { mode: runMode, dayKey };
      setRunInfo({ mode: runMode, dayKey });
      setFinished(null);
      runRef.current = run;
      cameraRef.current = { x: 0, y: 0 };
      debrisRef.current = [];
      pulsesRef.current = [];
      landedAtRef.current = null;
      shakeRef.current = { until: 0, amp: 0 };
      setHud(hudOf(run));
      setAnnouncement("");
      setMilestone(null);
      setCallout(null);
      setSettled(false);
      for (const id of timersRef.current) window.clearTimeout(id);
      timersRef.current.length = 0;
      setPhaseBoth("live");
      enterSheet();
    },
    [mode, seedText, setPhaseBoth, enterSheet],
  );

  const resume = useCallback(() => {
    const run = runRef.current;
    if (phaseRef.current !== "paused" || !run) return;
    runRef.current = resumeRun(run, performance.now());
    setPhaseBoth("live");
  }, [setPhaseBoth]);

  const release = useCallback(() => {
    const run = runRef.current;
    if (phaseRef.current !== "live" || !run) return;
    const now = performance.now();
    const result = drop(run, now);
    if (!result) return;
    const next = result.run;
    const outcome = result.outcome;
    runRef.current = next;
    const floors = next.slabs.length - 1;
    const audio = audioRef.current;

    landedAtRef.current = now;
    if (outcome.kind === "miss") {
      const side = outcome.piece.left + outcome.piece.width / 2 >= 0 ? "right" : "left";
      debrisRef.current = [
        ...debrisRef.current,
        spawnDebris(outcome.piece, next.slabs.length * BLOCK_HEIGHT, side),
      ];
      audio?.play(CUES.miss);
    } else if (outcome.kind === "trim") {
      const slabCentre = outcome.slab.left + outcome.slab.width / 2;
      const side = outcome.cut.left + outcome.cut.width / 2 >= slabCentre ? "right" : "left";
      debrisRef.current = [
        ...debrisRef.current,
        spawnDebris(outcome.cut, floors * BLOCK_HEIGHT, side),
      ];
      shakeRef.current = { until: now + SHAKE_MS, amp: Math.min(6, outcome.cut.width / 8) };
      audio?.play(CUES.trim);
      audio?.play(CUES.drop);
    } else {
      pulsesRef.current = [...pulsesRef.current, now];
      audio?.play(perfectCue(outcome.streak));
      if (outcome.grew) audio?.play(CUES.grow);
    }

    if (outcome.kind === "perfect") {
      setPerfectFlashKey((k) => k + 1);
      setStreakPopKey((k) => k + 1);
      if (outcome.grew) {
        setCallout(`+${GROW_AMOUNT}`);
        later(() => setCallout(null), 900);
      }
    }
    if (outcome.kind !== "miss") {
      setScorePulseKey((k) => k + 1);
      if (floors % MILESTONE_EVERY === 0) {
        audio?.play(CUES.milestone);
        setMilestone(floors);
        later(() => setMilestone((cur) => (cur === floors ? null : cur)), 1400);
      }
    }

    hintDismissed = true;
    setShowHint(false);
    updateStats(markHintSeen);
    setHud(hudOf(next));
    setAnnouncement(describeLanding(floors, outcome));
    if (next.over) {
      const info = runInfoRef.current;
      if (info) {
        setFinished({
          mode: info.mode,
          dayKey: info.dayKey,
          score: next.score,
          floors,
          perfects: next.perfects,
          bestStreak: next.bestStreak,
          seconds: runSeconds(next, now),
          // The UTC day turned over mid-run: today's board no longer takes this tower.
          closed: info.mode === "daily" && utcDayKey(new Date()) !== info.dayKey,
        });
        updateStats((prev) =>
          recordRun(prev, { mode: info.mode, score: next.score, day: info.dayKey }),
        );
      }
      setPhaseBoth("over");
      later(() => setSettled(true), 1500);
    }
  }, [later, setPhaseBoth, updateStats]);

  // ---- input -------------------------------------------------------------
  useEffect(() => {
    if (phase !== "live" && phase !== "paused") return;
    const onKey = (event: KeyboardEvent) => {
      if (shouldBlockScroll(event, true)) event.preventDefault();
      if (!dropKey(event) || isTextEntryTarget(event)) return;
      // A held key repeats keydown; one press releases one block.
      if (event.repeat) return;
      // A focused button handles its own Space and Enter.
      if (event.target instanceof HTMLButtonElement) return;
      if (phaseRef.current === "paused") resume();
      else release();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, release, resume]);

  useEffect(() => {
    if (phase === "over") cardRef.current?.focus();
    if (phase === "ready") startRef.current?.focus({ preventScroll: true });
  }, [phase]);

  // Exit abandons the run and puts the stage back on the ready screen.
  const leave = useCallback(() => {
    runRef.current = null;
    debrisRef.current = [];
    pulsesRef.current = [];
    cameraRef.current = { x: 0, y: 0 };
    setHud(EMPTY_HUD);
    setFinished(null);
    setAnnouncement("");
    setMilestone(null);
    setCallout(null);
    setPhaseBoth("ready");
    exitSheet();
  }, [exitSheet, setPhaseBoth]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const id of timers) window.clearTimeout(id);
      audioRef.current?.close();
    };
  }, []);

  const toggleMute = () => {
    const audio = audioRef.current ?? (audioRef.current = createTowerAudio());
    audio.setMuted(!audio.isMuted());
    setMuted(audio.isMuted());
  };

  return (
    <div
      data-testid="tower-sheet"
      className={
        sheet
          ? "fixed inset-0 z-80 flex h-[100dvh] w-screen flex-col items-center justify-center overscroll-contain bg-[#05070d]"
          : "relative flex w-full flex-col items-center gap-2"
      }
    >
      {!sheet && (
        <div
          className="text-foreground/40 flex w-full items-end justify-between font-mono text-[10px] tracking-[0.3em] uppercase"
          style={{ maxWidth: layout.cssWidth }}
        >
          <span>TWR-01 / REV.A</span>
        </div>
      )}
      <div
        ref={(el) => {
          rootRef.current = el;
          targetRef.current = el;
        }}
        data-testid="tower-stage"
        data-phase={phase}
        data-mode={phase === "ready" ? mode : (runInfo?.mode ?? mode)}
        data-floors={hud.floors}
        data-score={hud.score}
        data-streak={hud.streak}
        className="relative touch-none overflow-hidden select-none"
        style={{
          width: layout.cssWidth,
          height: layout.cssHeight,
          background: FIELD,
          boxShadow: "0 0 60px -20px rgba(239,68,68,0.25), inset 0 0 0 1px rgba(148,163,184,0.18)",
        }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className="absolute inset-0 block"
          style={{ width: layout.cssWidth, height: layout.cssHeight }}
        />
        <CornerTick position="tl" />
        <CornerTick position="tr" />
        <CornerTick position="bl" />
        <CornerTick position="br" />

        <div
          data-testid="tower-hit-layer"
          className="absolute inset-0 z-10"
          onPointerDown={release}
        />

        {phase !== "ready" && (
          <Hud
            hud={hud}
            scorePulseKey={scorePulseKey}
            streakPopKey={streakPopKey}
            perfectFlashKey={perfectFlashKey}
            milestone={milestone}
            callout={callout}
          />
        )}

        {sheet && (
          <button
            type="button"
            onClick={leave}
            className="text-foreground/70 hover:text-foreground absolute top-[calc(env(safe-area-inset-top)+0.5rem)] left-2 z-40 flex min-h-11 min-w-11 items-center justify-center px-2 font-mono text-[10px] tracking-[0.25em] uppercase"
          >
            Exit
          </button>
        )}
        <button
          type="button"
          onClick={toggleMute}
          aria-pressed={muted}
          aria-label={muted ? "Unmute sound" : "Mute sound"}
          className="text-foreground/70 hover:text-foreground absolute top-2 right-2 z-40 flex min-h-11 min-w-11 items-center justify-center font-mono text-[10px] tracking-[0.25em] uppercase"
        >
          {muted ? "Sound off" : "Sound on"}
        </button>

        {phase === "ready" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/55 p-6 text-center">
            <div className="text-foreground font-mono text-2xl font-bold tracking-[0.2em] uppercase">
              Tower Stacker
            </div>
            {showHint && (
              <p className="text-foreground/80 max-w-[18rem] font-mono text-xs leading-relaxed">
                Tap when the block is over the tower. Land it dead centre for a perfect.
              </p>
            )}
            <ModeRow mode={mode} seeded={Boolean(seedText)} onChange={setMode} />
            <button
              ref={startRef}
              type="button"
              onClick={() => startRun()}
              className="min-h-11 min-w-11 border border-accent-red/70 bg-accent-red/10 px-8 py-2 font-mono text-xs font-bold tracking-[0.3em] text-accent-red uppercase transition hover:border-accent-red hover:bg-accent-red/20"
            >
              Start
            </button>
          </div>
        )}

        {phase === "paused" && (
          <button
            type="button"
            onClick={resume}
            className="text-foreground absolute inset-0 z-30 flex min-h-11 min-w-11 items-center justify-center bg-black/70 font-mono text-sm font-bold tracking-[0.3em] uppercase"
          >
            Paused. Tap to resume.
          </button>
        )}

        {phase === "over" && finished && (
          <OverCard
            hud={hud}
            best={finished.mode === "daily" ? (stats.bestDaily?.score ?? 0) : stats.bestFree}
            cardRef={cardRef}
            onPlayAgain={() => startRun()}
          >
            <BoardPanel
              run={finished}
              handle={stats.handle}
              streakDays={activeStreak(stats, finished.dayKey)}
              onHandle={(name) => updateStats((prev) => setHandle(prev, name))}
              onPlayDaily={() => startRun("daily")}
            />
          </OverCard>
        )}
      </div>
      <div data-testid="tower-live-region" role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
