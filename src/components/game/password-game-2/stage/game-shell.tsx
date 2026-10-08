"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type RefObject,
} from "react";
import { useSearchParams } from "next/navigation";
import type { ActId, Effect, GameState, PointerTarget } from "../engine/types";
import {
  applyKey,
  applyPointer,
  applyText,
  createRun,
  makeRuleApi,
  requestSubmit,
  setRuleState,
  tick,
} from "../engine/engine";
import { drainEffects } from "../engine/effects";
import { loadLiveFeeds } from "../feeds";
import { cellsToPassword } from "../engine/cells";
import { dailySeed } from "../engine/rng";
import { EVENT_DEFS } from "../engine/events/index";
import { isEnabled, setEnabled, unlockAudio } from "../sound/audio";
import { playCue } from "../sound/motifs";
import { CharStage } from "./char-stage";
import { CanvasOverlay, type OverlayHandle } from "./canvas-overlay";
import { ChromeEvents } from "./chrome-events";
import { FinaleStage } from "./finale-stage";
import { ReceiptCard } from "./receipt-card";
import { RuleList } from "./rule-list";
import type { RuleFlips } from "./regression";
import { Hud } from "./hud";
import { HudActions } from "./hud-actions";
import { HUD_BOTTOM_H, HUD_TOP_H } from "./hud-slots";
import { useVisualViewport } from "./use-visual-viewport";
import type { ViewportLayout } from "./viewport-layout";
import "./pg2.css";

/** Valid ?event= ids for the showcase URL param, resolved once from the manifest. */
const EVENT_IDS: ReadonlySet<string> = new Set(EVENT_DEFS.map((d) => d.id));

/** Desktop = the two-column stage; anything narrower plays in the fixed phone sheet. */
const DESKTOP_QUERY = "(min-width: 1024px)";

type Phase = "start" | "running";

/** Minimum gap between two key ticks, so fast typing is a patter and not a buzz. */
const KEY_TICK_GAP_MS = 30;
/** Minimum gap between two rule pass/fail cues. */
const RULE_CUE_GAP_MS = 150;

interface Toast {
  id: number;
  text: string;
  tone: "info" | "danger" | "success";
}

/** Act title-card copy: kicker line over a giant act name. */
const ACT_CARD: Record<ActId, { kicker: string; title: string }> = {
  prologue: { kicker: "Prologue", title: "The Sign-Up" },
  act1: { kicker: "Act One", title: "Move-In" },
  act2: { kicker: "Act Two", title: "The Infestation" },
  act3: { kicker: "Act Three", title: "The Invasion" },
  finale: { kicker: "Finale", title: "The Submission" },
};

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

/** The fake enterprise wordmark stamped atop the sign-up form. */
function CompanyMark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden="true">
        <rect x="2" y="2" width="28" height="28" rx="7" fill="#1d4ed8" />
        <path d="M16 7l7 4v6c0 4.2-2.9 7-7 8-4.1-1-7-3.8-7-8v-6l7-4z" fill="#fff" opacity="0.92" />
        <path
          d="M13 16.5l2.2 2.2L20 14"
          stroke="#1d4ed8"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
      <span className="text-[15px] font-bold tracking-tight text-[color:var(--pg2-ink)]">
        Signet<span className="text-[color:var(--pg2-primary)]">ID</span>
      </span>
    </div>
  );
}

export function GameShell() {
  const searchParams = useSearchParams();
  const urlSeed = useMemo(() => {
    const raw = searchParams.get("seed");
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 && n <= 0xffffffff ? n >>> 0 : null;
  }, [searchParams]);
  // ?event=<id> forces a single event to onset early in act1 — a debug/showcase URL.
  const urlEvent = useMemo(() => {
    const raw = searchParams.get("event");
    return raw !== null && EVENT_IDS.has(raw) ? raw : null;
  }, [searchParams]);

  const [phase, setPhase] = useState<Phase>("start");
  // The engine store: one mutable object rendered from state (not read from a ref
  // during render). A version counter bumps re-renders when the engine mutates it.
  const [game, setGame] = useState<GameState | null>(null);
  const [seed, setSeed] = useState(0);
  // Bumped on every start so a restart with the same seed still remounts the rule list.
  const [runId, setRunId] = useState(0);
  const [daily, setDaily] = useState(false);
  // Lazy initializers read browser APIs directly: this component only ever
  // renders on the client (ssr: false), so window/localStorage are present and
  // this avoids seeding state from an effect (react-hooks/set-state-in-effect).
  const [soundOn, setSoundOn] = useState(() => isEnabled());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [moods, setMoods] = useState<Record<string, string>>({});
  const [titleCard, setTitleCard] = useState<ActId | null>(null);
  // Layout mode is one media query: desktop (>= 1024px) is the two-column stage; below
  // it a live run plays in a fixed sheet sized to the visible viewport.
  const [desktop, setDesktop] = useState(() => window.matchMedia?.(DESKTOP_QUERY).matches ?? false);

  // Render is driven manually: the engine mutates a ref'd store, so we bump this
  // counter when g.version changes or on a heartbeat, rather than mirroring state.
  const [, bumpRender] = useState(0);
  const forceRender = useCallback(() => bumpRender((n) => n + 1), []);

  const gameRef = useRef<GameState | null>(null);
  const renderedVersionRef = useRef(-1);
  const overlayRef = useRef<OverlayHandle | null>(null);
  const autoStartedRef = useRef(false);
  const exitedRef = useRef(false);
  // Bumped by every player input that can move the caret; the phone sheet reveals the caret
  // on this, never on an event-driven version bump.
  const inputSeqRef = useRef(0);
  const feedsLoadedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const shakeRef = useRef(0);
  const reducedRef = useRef(false);
  const soundDebounceRef = useRef<Map<string, number>>(new Map());
  const lastTickRef = useRef(-Infinity);
  const lastFlipCueRef = useRef(-Infinity);
  const ruleCountRef = useRef(0);
  const toastIdRef = useRef(0);
  const moodTimersRef = useRef<Map<string, number>>(new Map());
  const toastTimersRef = useRef<Set<number>>(new Set());

  // Title cards show one at a time for 2.2s, skippable on click. showingCardRef
  // lets enqueue decide immediately without reading state during render;
  // advancement is driven by an effect keyed on the visible card.
  const titleQueueRef = useRef<ActId[]>([]);
  const showingCardRef = useRef(false);

  const advanceCard = useCallback(() => {
    const next = titleQueueRef.current.shift();
    if (next === undefined) {
      showingCardRef.current = false;
      setTitleCard(null);
    } else {
      setTitleCard(next);
    }
  }, []);

  const enqueueCard = useCallback((act: ActId) => {
    if (showingCardRef.current) {
      titleQueueRef.current.push(act);
    } else {
      showingCardRef.current = true;
      setTitleCard(act);
    }
  }, []);

  const skipCard = useCallback(() => advanceCard(), [advanceCard]);

  const pushToast = useCallback((text: string, tone: Toast["tone"]) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, text, tone }].slice(-4));
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
      toastTimersRef.current.delete(timer);
    }, 4000);
    toastTimersRef.current.add(timer);
  }, []);

  const setMood = useCallback((eventId: string, text: string) => {
    setMoods((prev) => ({ ...prev, [eventId]: text }));
    const timers = moodTimersRef.current;
    const existing = timers.get(eventId);
    if (existing !== undefined) clearTimeout(existing);
    timers.set(
      eventId,
      window.setTimeout(() => {
        setMoods((prev) => {
          const next = { ...prev };
          delete next[eventId];
          return next;
        });
        timers.delete(eventId);
      }, 5000),
    );
  }, []);

  const playSound = useCallback((key: string) => {
    const t = performance.now();
    const last = soundDebounceRef.current.get(key) ?? -Infinity;
    if (t - last < 150) return; // survive effect floods emitting identical keys
    soundDebounceRef.current.set(key, t);
    playCue(key);
  }, []);

  // Core-play cues have their own channel: they must not be swallowed by the 150 ms
  // effect-flood debounce above. Only the key tick is rate limited.
  const playKeyTick = useCallback(() => {
    const t = performance.now();
    if (t - lastTickRef.current < KEY_TICK_GAP_MS) return;
    lastTickRef.current = t;
    playCue("key-tick");
  }, []);

  // One set of flips plays one cue (fail wins), and pass/fail share a short gate so a paste,
  // an event or a rule that flips on every keystroke cannot stack buzzes on the key ticks.
  const onRuleFlips = useCallback((flips: RuleFlips) => {
    const t = performance.now();
    if (t - lastFlipCueRef.current < RULE_CUE_GAP_MS) return;
    if (flips.regressed.length > 0) playCue("rule-fail");
    else if (flips.recovered.length > 0) playCue("rule-pass");
    else return;
    lastFlipCueRef.current = t;
  }, []);

  const triggerFlash = useCallback((ms: number) => {
    const el = flashRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.opacity = "0.85";
    requestAnimationFrame(() => {
      el.style.transition = `opacity ${ms}ms ease-out`;
      el.style.opacity = "0";
    });
  }, []);

  // Environment probes (client only): reduced-motion preference (a ref, read in
  // the loop) and a live listener for the desktop/phone layout switch.
  useEffect(() => {
    reducedRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const mq = window.matchMedia?.(DESKTOP_QUERY);
    if (!mq) return;
    const update = () => setDesktop(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const sheet = phase === "running" && !desktop;
  const viewport = useVisualViewport(sheet);

  // The phone play sheet owns the screen: lock the page scroll while it is up and give it
  // back when it goes away, whether that is an Exit, a switch to desktop, or the shell
  // unmounting. Focus after an Exit is handled below; the control that launched the run
  // is already gone by the time the sheet mounts, so there is nothing to restore here.
  useEffect(() => {
    if (!sheet) return;
    const root = document.documentElement;
    root.classList.add("pg2-lock");
    return () => root.classList.remove("pg2-lock");
  }, [sheet]);

  // After an Exit the start screen is a fresh tree, so the control that launched the run
  // is gone; land focus on the start screen's primary button instead of on <body>.
  useEffect(() => {
    if (phase !== "start" || !exitedRef.current) return;
    exitedRef.current = false;
    panelRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, [phase]);

  // Fetch the three live feeds (wordle, country, chess) once on mount, so the
  // feed-backed rules capture real data at rule-create time instead of freebie
  // fallbacks. A ref once-guard survives Strict Mode's mount/unmount/mount so we
  // never double-fetch (mirrors autoStartedRef). Fire-and-forget: loadLiveFeeds
  // is best-effort and never throws.
  useEffect(() => {
    if (feedsLoadedRef.current) return;
    feedsLoadedRef.current = true;
    void loadLiveFeeds();
  }, []);

  // Clear any pending toast/mood dismissal timers when the shell unmounts.
  useEffect(() => {
    const toastTimers = toastTimersRef.current;
    const moodTimers = moodTimersRef.current;
    return () => {
      for (const id of toastTimers) window.clearTimeout(id);
      for (const id of moodTimers.values()) window.clearTimeout(id);
    };
  }, []);

  // Auto-advance the visible title card after 2.2s; cleanup clears the timer when
  // the card changes (a skip re-renders, cancelling the pending advance).
  useEffect(() => {
    if (titleCard === null) return;
    const t = window.setTimeout(advanceCard, 2200);
    return () => window.clearTimeout(t);
  }, [titleCard, advanceCard]);

  // Run the rAF loop + keyboard listener while a run is live. The loop, effect
  // dispatch, and key handler are declared inside the effect so no ref is written
  // or read during render (react-hooks/refs).
  useEffect(() => {
    if (phase !== "running") return;
    let raf = 0;
    let lastTs = 0;

    function dispatch(effect: Effect) {
      switch (effect.kind) {
        case "sound":
          playSound(effect.sound);
          break;
        case "shake":
          if (!reducedRef.current) shakeRef.current = Math.min(1, shakeRef.current + effect.trauma);
          break;
        case "toast":
          pushToast(effect.text, effect.tone);
          break;
        case "title-card":
          enqueueCard(effect.act);
          break;
        case "mood":
          setMood(effect.eventId, effect.text);
          break;
        case "flash":
          if (!reducedRef.current) triggerFlash(effect.ms);
          break;
      }
    }

    function frame(ts: number) {
      const g = gameRef.current;
      if (!g) {
        raf = requestAnimationFrame(frame);
        return;
      }
      let dt = lastTs === 0 ? 16 : ts - lastTs;
      lastTs = ts;
      dt = Math.max(0, Math.min(100, dt));

      tick(g, dt);
      for (const e of drainEffects(g)) dispatch(e);

      // Repaint the canvas overlay every frame — the whole event-visibility layer.
      overlayRef.current?.paint(g, ts);

      // Screen shake: jitter the panel by the decaying trauma, then decay it.
      const panel = panelRef.current;
      if (panel) {
        const s = shakeRef.current;
        if (s > 0.001) {
          const mag = s * s * 9;
          panel.style.setProperty("--pg2-shake-x", `${(Math.random() * 2 - 1) * mag}px`);
          panel.style.setProperty("--pg2-shake-y", `${(Math.random() * 2 - 1) * mag}px`);
        } else {
          panel.style.setProperty("--pg2-shake-x", "0px");
          panel.style.setProperty("--pg2-shake-y", "0px");
        }
        shakeRef.current = Math.max(0, s - dt / 550);
      }

      if (g.version !== renderedVersionRef.current) {
        renderedVersionRef.current = g.version;
        forceRender();
      }
      raf = requestAnimationFrame(frame);
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return; // never intercept mid-IME-composition
      // A keystroke aimed at a focused control (button, link, the sound/submit
      // buttons, a title card) belongs to that control, not the password. Without
      // this, Space is preventDefault-ed and typed, breaking Space-activation. The
      // hidden mobile input is deliberately NOT in this list — it is the game
      // surface, so desktop typing/Backspace still routes here when it has focus.
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("button, a, select, textarea, [role=button]")) return;
      const g = gameRef.current;
      if (!g) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // let copy/paste/shortcuts through
      const k = e.key;
      const named = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End"];
      const handled = [...k].length === 1 || named.includes(k);
      if (!handled) return;
      e.preventDefault();
      unlockAudio(); // a keydown is a gesture too: covers a run started without a tap (?event=)
      applyKey(g, k);
      playKeyTick();
      inputSeqRef.current += 1;
      forceRender();
    }

    raf = requestAnimationFrame(frame);
    window.addEventListener("keydown", onKeyDown);
    const heartbeat = window.setInterval(forceRender, 250);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
      window.clearInterval(heartbeat);
    };
  }, [phase, forceRender, playSound, playKeyTick, pushToast, enqueueCard, setMood, triggerFlash]);

  const start = useCallback((s: number, isDaily: boolean, forceEvent?: string) => {
    ruleCountRef.current = 0;
    const g = createRun({ seed: s, daily: isDaily, nowHHMM, forceEvent });
    gameRef.current = g;
    renderedVersionRef.current = g.version;
    setGame(g);
    setSeed(s);
    setRunId((r) => r + 1);
    setDaily(isDaily);
    setPhase("running");
  }, []);

  // The Start buttons are real gestures, so they unlock audio; the ?event= auto-start below
  // is not and must not (a context created without a gesture stays suspended).
  const startFromTap = useCallback(
    (s: number, isDaily: boolean, forceEvent?: string) => {
      unlockAudio();
      start(s, isDaily, forceEvent);
    },
    [start],
  );

  // Showcase/debug: ?event=<id> auto-starts a run with that single event forced.
  // The start is deferred to a timer (not run synchronously in the effect body, to
  // keep the transition out of a render cascade) and claims a once-guard so Strict
  // Mode's double-invoke cannot start twice. No cleanup cancel — a cancelled 0ms
  // timer plus the guard is exactly the mount/cleanup/mount no-op trap.
  useEffect(() => {
    if (autoStartedRef.current || urlEvent === null) return;
    autoStartedRef.current = true;
    window.setTimeout(() => start(urlSeed ?? 7, false, urlEvent), 0);
  }, [urlEvent, urlSeed, start]);

  const toggleSound = useCallback(() => {
    setSoundOn((prev) => {
      const next = !prev;
      setEnabled(next);
      if (next) unlockAudio(); // first-gesture AudioContext creation and resume
      return next;
    });
  }, []);

  const copySeed = useCallback(() => {
    const url = `${location.origin}${location.pathname}?seed=${seed}`;
    const clip = navigator.clipboard;
    if (!clip) {
      pushToast("Copy the URL from your address bar to share this seed", "info");
      return;
    }
    void clip.writeText(url).then(
      () => pushToast("Seed link copied", "success"),
      () => pushToast("Could not copy the seed link", "danger"),
    );
  }, [seed, pushToast]);

  const playAgain = useCallback(() => start(randomSeed(), false), [start]);
  const playDaily = useCallback(() => start(dailySeed(), true), [start]);

  // Leave a live run for the start screen. Nothing is submitted; the run is dropped.
  const exit = useCallback(() => {
    gameRef.current = null;
    titleQueueRef.current = [];
    showingCardRef.current = false;
    exitedRef.current = true;
    setTitleCard(null);
    setToasts([]);
    setMoods({});
    setGame(null);
    setDaily(false);
    setPhase("start");
  }, []);

  const focusHiddenInput = useCallback(() => {
    hiddenInputRef.current?.focus({ preventScroll: true });
  }, []);

  // Route a pointer target into the engine (canvas chips/aliens and chrome buttons).
  const applyTarget = useCallback(
    (target: PointerTarget) => {
      const g = gameRef.current;
      if (!g) return;
      applyPointer(g, target);
      forceRender();
      focusHiddenInput();
    },
    [forceRender, focusHiddenInput],
  );

  // Canvas hit-testing: a capture-phase listener on the panel consults the overlay's
  // per-frame hit regions BEFORE the DOM cells' own mousedown. A consumed hit routes
  // the target and suppresses the trailing mousedown so the caret does not also move.
  useEffect(() => {
    if (phase !== "running") return;
    const panel = panelRef.current;
    if (!panel) return;
    let consumed = false;
    const onPointerDown = (e: PointerEvent) => {
      unlockAudio(); // fallback for a run that began without a tap (?event=)
      const overlay = overlayRef.current;
      const g = gameRef.current;
      if (!overlay || !g) return;
      // A real button under the pointer (HUD controls, action chips) always wins over a
      // canvas sprite drawn beneath it, so the fleet can never swallow a Sound or Exit tap.
      if (e.target instanceof Element && e.target.closest("button")) return;
      const target = overlay.hitTest(e.clientX, e.clientY);
      consumed = target !== null;
      if (!target) return;
      e.preventDefault();
      e.stopPropagation();
      applyPointer(g, target);
      forceRender();
      focusHiddenInput();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!consumed) return;
      consumed = false;
      e.preventDefault();
      e.stopPropagation();
    };
    panel.addEventListener("pointerdown", onPointerDown, true);
    panel.addEventListener("mousedown", onMouseDown, true);
    return () => {
      panel.removeEventListener("pointerdown", onPointerDown, true);
      panel.removeEventListener("mousedown", onMouseDown, true);
    };
  }, [phase, forceRender, focusHiddenInput]);

  // A DOM action chip (feed / basket / stoke). Unlike a canvas hit it must not pull
  // focus to the hidden input: a keyboard user pressing Enter on a chip keeps their place.
  const applyChip = useCallback(
    (target: PointerTarget) => {
      const g = gameRef.current;
      if (!g) return;
      applyPointer(g, target);
      forceRender();
    },
    [forceRender],
  );

  const onCellClick = useCallback(
    (id: number) => {
      const g = gameRef.current;
      if (!g) return;
      applyPointer(g, { kind: "cell", id });
      inputSeqRef.current += 1;
      forceRender();
      focusHiddenInput();
    },
    [forceRender, focusHiddenInput],
  );

  // Widget input channel (mirrors applyTarget). A rule-card widget either types its
  // answer into the password through the shared key path (onWidgetText -> applyText,
  // so events still intercept) or publishes a non-text outcome to run state
  // (onRuleState -> setRuleState, read back by validators via api.ruleState). Both
  // are useCallback-stable so RuleList's props identity survives and its memo holds.
  const onWidgetText = useCallback(
    (text: string) => {
      const g = gameRef.current;
      if (!g) return;
      applyText(g, text);
      forceRender();
      focusHiddenInput();
    },
    [forceRender, focusHiddenInput],
  );

  const onRuleState = useCallback(
    (id: string, value: unknown) => {
      const g = gameRef.current;
      if (!g) return;
      setRuleState(g, id, value);
      forceRender();
      focusHiddenInput();
    },
    [forceRender, focusHiddenInput],
  );

  const onBoxClick = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    applyKey(g, "End"); // caret to end
    inputSeqRef.current += 1;
    forceRender();
    focusHiddenInput();
  }, [forceRender, focusHiddenInput]);

  const onHiddenInput = useCallback(
    (e: FormEvent<HTMLInputElement>) => {
      const g = gameRef.current;
      const val = e.currentTarget.value;
      if (g && val) {
        for (const ch of val) applyKey(g, ch);
        playKeyTick();
      }
      inputSeqRef.current += 1;
      e.currentTarget.value = "";
      forceRender();
    },
    [forceRender, playKeyTick],
  );

  const onSubmit = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    requestSubmit(g);
    forceRender();
  }, [forceRender]);

  // A new rule appearing in the list plays the reveal cue. Keyed on the rule count read at
  // render (the engine reveals by growing g.rules), so it needs no hook into the tick loop.
  const ruleCountForCue = game?.rules.length ?? 0;
  useEffect(() => {
    if (ruleCountForCue > ruleCountRef.current) playCue("rule-reveal");
    ruleCountRef.current = ruleCountForCue;
  }, [ruleCountForCue]);

  // --- render ---------------------------------------------------------------

  // The engine store is rendered from state (same mutable object the loop ticks);
  // reading it here rather than from a ref keeps render ref-free.
  const g = game;
  const card = titleCard !== null ? ACT_CARD[titleCard] : null;

  return (
    <div className="pg2-root">
      <header className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-black tracking-tight text-(--foreground) sm:text-3xl">
            The Password Game 2
          </h2>
          <p className="text-sm text-(--muted)">Terms and Conditions Apply</p>
        </div>
        {daily && phase === "running" ? (
          <span className="rounded-full border border-(--border) px-2.5 py-1 text-xs font-semibold tracking-wide text-(--muted) uppercase">
            Daily
          </span>
        ) : null}
      </header>

      {phase === "start" ? (
        <div className="max-w-3xl">
          <div ref={panelRef} className="pg2-panel relative overflow-hidden">
            <StartScreen urlSeed={urlSeed} forceEvent={urlEvent} onStart={startFromTap} />
          </div>
        </div>
      ) : g ? (
        <RunningView
          g={g}
          seed={seed}
          runId={runId}
          daily={daily}
          soundOn={soundOn}
          moods={moods}
          panelRef={panelRef}
          overlayRef={overlayRef}
          flashRef={flashRef}
          boxRef={boxRef}
          hiddenInputRef={hiddenInputRef}
          inputSeqRef={inputSeqRef}
          onToggleSound={toggleSound}
          onCopySeed={copySeed}
          onCellClick={onCellClick}
          onBoxClick={onBoxClick}
          onHiddenInput={onHiddenInput}
          onSubmit={onSubmit}
          onPointer={applyTarget}
          onChip={applyChip}
          onWidgetText={onWidgetText}
          onRuleState={onRuleState}
          onRuleFlips={onRuleFlips}
          onPlayAgain={playAgain}
          onPlayDaily={playDaily}
          sheet={sheet}
          viewport={viewport}
          onExit={exit}
        />
      ) : null}

      {/* Toast stack: bottom-right, newest at the bottom; above the phone sheet. */}
      <div
        data-testid="pg2-toasts"
        className={
          sheet
            ? "pointer-events-none fixed inset-x-0 z-85 flex flex-col items-end justify-end gap-2 p-4"
            : "pointer-events-none fixed right-4 bottom-4 z-50 flex w-72 flex-col gap-2"
        }
        style={
          sheet
            ? { top: viewport.top, height: viewport.height > 0 ? viewport.height : "100dvh" }
            : undefined
        }
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pg2-toast pg2-toast--${t.tone} w-72 max-w-full px-4 py-2.5 text-sm text-[color:var(--pg2-ink)]`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Act title card overlay. */}
      {card ? (
        <div
          className={sheet ? "pg2-titlecard pg2-titlecard--sheet" : "pg2-titlecard"}
          role="button"
          tabIndex={0}
          aria-label={`${card.kicker}: ${card.title}. Click to continue.`}
          onClick={skipCard}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") skipCard();
          }}
        >
          <span className="pg2-titlecard__kicker">{card.kicker}</span>
          <span className="pg2-titlecard__title">{card.title}</span>
        </div>
      ) : null}
    </div>
  );
}

// --- start screen ------------------------------------------------------------

function StartScreen({
  urlSeed,
  forceEvent,
  onStart,
}: {
  urlSeed: number | null;
  forceEvent: string | null;
  onStart: (seed: number, daily: boolean, forceEvent?: string) => void;
}) {
  const force = forceEvent ?? undefined;
  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <CompanyMark />
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="pg2-step pg2-step--on" />
          <span className="pg2-step pg2-step--on" />
          <span className="pg2-step pg2-step--on" />
        </div>
      </div>

      <div className="mt-6">
        <h3 className="text-xl font-bold text-[color:var(--pg2-ink)]">Create your account</h3>
        <p className="mt-1 text-sm text-[color:var(--pg2-muted)]">
          Step 3 of 3 — Choose a secure password.
        </p>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-[color:var(--pg2-muted)] uppercase">
            Username
          </span>
          <input
            className="pg2-field w-full px-3 py-2.5 text-[15px]"
            value="user48291"
            disabled
            readOnly
            aria-label="Username"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold tracking-wide text-[color:var(--pg2-muted)] uppercase">
            Password
          </span>
          <input
            className="pg2-field w-full px-3 py-2.5 text-[15px]"
            placeholder="Choose a password"
            disabled
            aria-label="Password (disabled until a run begins)"
          />
        </label>
      </div>

      <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="button"
          className="pg2-btn pg2-btn--primary px-5 py-2.5 text-[15px]"
          onClick={() => onStart(dailySeed(), true, force)}
        >
          Start today&apos;s daily
        </button>
        <button
          type="button"
          className="pg2-btn pg2-btn--ghost px-5 py-2.5 text-[15px]"
          onClick={() => onStart(randomSeed(), false, force)}
        >
          Random seed
        </button>
        {urlSeed !== null ? (
          <button
            type="button"
            className="pg2-btn pg2-btn--ghost px-5 py-2.5 text-[15px]"
            onClick={() => onStart(urlSeed, false, force)}
          >
            Start seed {urlSeed}
          </button>
        ) : null}
      </div>

      {urlSeed !== null ? (
        <p className="mt-3 text-xs text-[color:var(--pg2-muted)]">
          A seed was shared with you — <span className="font-mono">{urlSeed}</span>.
        </p>
      ) : null}

      <p className="mt-8 border-t border-[color:var(--pg2-line)] pt-4 text-[11px] leading-relaxed text-[color:var(--pg2-legal)]">
        By continuing you agree to the SignetID Master Services Agreement, the Password Custody
        Addendum, and to receive occasional security-flavored correspondence. Your password may be
        observed by parties who are, legally speaking, entirely fictional. Refunds are issued in the
        form of understanding.
      </p>
    </div>
  );
}

// --- running view ------------------------------------------------------------

function RunningView({
  g,
  seed,
  runId,
  daily,
  soundOn,
  moods,
  panelRef,
  overlayRef,
  flashRef,
  boxRef,
  hiddenInputRef,
  inputSeqRef,
  onToggleSound,
  onCopySeed,
  onCellClick,
  onBoxClick,
  onHiddenInput,
  onSubmit,
  onPointer,
  onChip,
  onWidgetText,
  onRuleState,
  onRuleFlips,
  onPlayAgain,
  onPlayDaily,
  sheet,
  viewport,
  onExit,
}: {
  sheet: boolean;
  viewport: ViewportLayout;
  onExit: () => void;
  g: GameState;
  seed: number;
  runId: number;
  daily: boolean;
  soundOn: boolean;
  moods: Record<string, string>;
  panelRef: RefObject<HTMLDivElement | null>;
  overlayRef: RefObject<OverlayHandle | null>;
  flashRef: RefObject<HTMLDivElement | null>;
  boxRef: RefObject<HTMLDivElement | null>;
  hiddenInputRef: RefObject<HTMLInputElement | null>;
  inputSeqRef: RefObject<number>;
  onToggleSound: () => void;
  onCopySeed: () => void;
  onCellClick: (id: number) => void;
  onBoxClick: () => void;
  onHiddenInput: (e: FormEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
  onPointer: (target: PointerTarget) => void;
  onChip: (target: PointerTarget) => void;
  onWidgetText: (text: string) => void;
  onRuleState: (id: string, value: unknown) => void;
  onRuleFlips: (flips: RuleFlips) => void;
  onPlayAgain: () => void;
  onPlayDaily: () => void;
}) {
  const password = cellsToPassword(g.cells);
  // Stable across the 250ms heartbeat (g is the same mutable ref for the whole
  // run) so the memoized RuleList can skip re-validating when nothing changed;
  // the api's methods read g live, so a fixed identity stays correct.
  const api = useMemo(() => makeRuleApi(g, nowHHMM), [g]);
  const moodEntries = Object.entries(moods);

  // Events that are running right now (past init, not finished): the likely culprits when a
  // passing rule reopens. Memoized on a joined key so the list's memo survives the heartbeat.
  const liveKey = g.events
    .filter((e) => e.data !== undefined && e.phase !== "done")
    .map((e) => e.defId)
    .join(",");
  const liveEvents = useMemo(() => (liveKey ? liveKey.split(",") : []), [liveKey]);

  // A 1s re-validation heartbeat for the rule list only. Some rules flip purely
  // from time (a coupled rule going red, the current-time clock) without bumping
  // g.version; this counter, folded into RuleList's memo, keeps those flips live
  // at >=1Hz while leaving the memoized CharStage untouched.
  const [validationTick, setValidationTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setValidationTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // The rule column exists only while the form is being filled in; the finale and
  // the receipt own the whole stage.
  const inPlay = g.outcome !== "victory" && g.act !== "finale";

  // On a phone the run plays in a fixed sheet that is exactly the visible area. While
  // the form is being filled in the sheet itself never scrolls (the rule region does);
  // the finale and the receipt are taller than a phone, so there the sheet scrolls.
  const playClass = sheet
    ? inPlay
      ? "pg2-play flex h-full flex-col gap-3 px-3 pt-3 pb-2"
      : "pg2-play mx-auto max-w-3xl px-3 py-3"
    : inPlay
      ? "pg2-play lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(320px,26rem)] lg:items-start lg:gap-6"
      : "pg2-play mx-auto max-w-3xl";
  const cardClass = sheet
    ? "pg2-panel relative flex-none touch-pan-y overflow-hidden"
    : "pg2-panel relative overflow-hidden lg:sticky lg:top-24";
  const rulesClass = sheet
    ? "min-h-32 min-w-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
    : "mt-6 min-w-0 lg:-m-1 lg:mt-0 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto lg:p-1";

  // Focus inside the pointerdown itself: iOS only summons the keyboard from a gesture.
  const focusInput = useCallback(() => {
    hiddenInputRef.current?.focus({ preventScroll: true });
  }, [hiddenInputRef]);

  // While the soft keyboard is up the sheet is short: keep the rule being worked on in view
  // (whenever the active rule changes, not only when the keyboard opens) and, when the
  // player types or taps the box, the caret line of the password box. Input only: an event
  // that bumps the engine version (infection and the like) must not yank the view back
  // while the player is reading the rules. Runs after every render; the work is a query
  // and two identity checks.
  const keyboardOpen = viewport.keyboardOpen;
  const followedRuleRef = useRef<Element | null>(null);
  const followedInputRef = useRef(0);
  useEffect(() => {
    if (!keyboardOpen) {
      followedRuleRef.current = null;
      return;
    }
    const reveal = (el: Element | null | undefined) => {
      if (el instanceof HTMLElement && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ block: "nearest" });
      }
    };
    const rule = panelRef.current?.parentElement?.querySelector(".pg2-rule--active") ?? null;
    if (rule !== followedRuleRef.current) {
      followedRuleRef.current = rule;
      reveal(rule);
    }
    if (inputSeqRef.current !== followedInputRef.current) {
      followedInputRef.current = inputSeqRef.current;
      reveal(boxRef.current?.querySelector(".pg2-caret"));
    }
  });

  const play = (
    <div className={playClass}>
      <div ref={panelRef} data-testid="pg2-stage-card" className={cardClass}>
        <Hud
          elapsedMs={g.elapsedMs}
          act={g.act}
          seed={seed}
          soundOn={soundOn}
          onToggleSound={onToggleSound}
          onCopySeed={onCopySeed}
          onExit={sheet ? onExit : undefined}
          compact={viewport.keyboardOpen}
        />

        <div className="p-5 sm:p-6">
          {g.outcome === "victory" ? (
            <ReceiptCard
              g={g}
              seed={seed}
              daily={daily}
              onCopySeed={onCopySeed}
              onPlayAgain={onPlayAgain}
              onPlayDaily={onPlayDaily}
            />
          ) : g.act === "finale" ? (
            <FinaleStage g={g} onPointer={onPointer} />
          ) : (
            <>
              {moodEntries.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {moodEntries.map(([id, text]) => (
                    <span key={id} className="pg2-mood">
                      {text}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* Reserved HUD bands: meters paint on the canvas inside them, the
                  action chips are DOM buttons here, and nothing HUD-like ever
                  lands on the password. The top band grows (chips wrap) rather
                  than clip. */}
              <div
                className="flex items-center justify-end pl-36"
                style={{ minHeight: HUD_TOP_H }}
                data-pg2-hud-top
              >
                <HudActions g={g} onAction={onChip} />
              </div>
              <CharStage
                cells={g.cells}
                caret={g.caret}
                boxRef={boxRef}
                onCellClick={onCellClick}
                onBoxClick={onBoxClick}
                onBoxPointerDown={focusInput}
              />
              <div style={{ height: HUD_BOTTOM_H }} data-pg2-hud-bottom aria-hidden="true" />

              {/* Visually-hidden input: summons the mobile soft keyboard. Desktop
                  keydown preventDefault stops it from ever receiving those chars. */}
              <input
                ref={hiddenInputRef}
                data-testid="pg2-hidden-input"
                onInput={onHiddenInput}
                aria-hidden="true"
                tabIndex={-1}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="absolute top-0 left-0 h-px w-px border-0 p-0 text-base opacity-0"
              />
            </>
          )}
        </div>

        <CanvasOverlay ref={overlayRef} />
        {g.outcome === "playing" && g.act !== "finale" ? (
          <ChromeEvents g={g} onPointer={onPointer} />
        ) : null}

        <div ref={flashRef} className="pg2-flash" aria-hidden="true" />
      </div>

      {inPlay ? (
        <div data-testid="pg2-rules" className={rulesClass}>
          <p className="mb-2 text-xs font-semibold tracking-wide text-(--muted) uppercase">
            Your password must satisfy
          </p>
          <RuleList
            key={runId}
            rules={g.rules}
            password={password}
            state={g}
            api={api}
            onWidgetText={onWidgetText}
            onRuleState={onRuleState}
            version={g.version}
            validationTick={validationTick}
            liveEvents={liveEvents}
            onRuleFlips={onRuleFlips}
          />

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              className="pg2-btn pg2-btn--primary min-h-11 px-6 py-2.5 text-[15px]"
              onClick={onSubmit}
            >
              Create account
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );

  // One wrapper in both layouts, so crossing the desktop breakpoint mid-run only changes
  // its class and style and never remounts the stage (widget and canvas state survive).
  // The sheet scrolls when the card plus the minimum rule region overflow a short phone,
  // so the password is never clipped; overscroll-contain keeps that scroll off the page.
  const wrapperClass = !sheet
    ? undefined
    : viewport.keyboardOpen
      ? "pg2-sheet pg2-sheet--kb fixed inset-x-0 z-80 flex flex-col overflow-y-auto overscroll-contain bg-(--background)"
      : "pg2-sheet fixed inset-x-0 z-80 flex flex-col overflow-y-auto overscroll-contain bg-(--background)";
  return (
    <div
      data-testid={sheet ? "pg2-sheet" : undefined}
      className={wrapperClass}
      style={
        sheet
          ? ({
              "--pg2-vv-h": viewport.height > 0 ? `${viewport.height}px` : "100dvh",
              "--pg2-vv-top": `${viewport.top}px`,
              top: "var(--pg2-vv-top)",
              height: "var(--pg2-vv-h)",
            } as CSSProperties)
          : undefined
      }
    >
      {play}
    </div>
  );
}
