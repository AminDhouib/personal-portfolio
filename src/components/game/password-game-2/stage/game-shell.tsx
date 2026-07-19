"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import { useSearchParams } from "next/navigation";
import type { ActId, Effect, GameState, PointerTarget } from "../engine/types";
import {
  applyKey,
  applyPointer,
  createRun,
  makeRuleApi,
  requestSubmit,
  tick,
} from "../engine/engine";
import { drainEffects } from "../engine/effects";
import { cellsToPassword } from "../engine/cells";
import { dailySeed } from "../engine/rng";
import { EVENT_DEFS } from "../engine/events/index";
import { getAudio, isEnabled, setEnabled } from "../sound/audio";
import { playCue } from "../sound/motifs";
import { CharStage } from "./char-stage";
import { CanvasOverlay, type OverlayHandle } from "./canvas-overlay";
import { ChromeEvents } from "./chrome-events";
import { RuleList } from "./rule-list";
import { Hud } from "./hud";
import "./pg2.css";

/** Valid ?event= ids for the showcase URL param, resolved once from the manifest. */
const EVENT_IDS: ReadonlySet<string> = new Set(EVENT_DEFS.map((d) => d.id));

type Phase = "start" | "running";

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

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
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
  const [daily, setDaily] = useState(false);
  // Lazy initializers read browser APIs directly: this component only ever
  // renders on the client (ssr: false), so window/localStorage are present and
  // this avoids seeding state from an effect (react-hooks/set-state-in-effect).
  const [soundOn, setSoundOn] = useState(() => isEnabled());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [moods, setMoods] = useState<Record<string, string>>({});
  const [titleCard, setTitleCard] = useState<ActId | null>(null);
  const [narrow, setNarrow] = useState(
    () => window.matchMedia?.("(max-width: 767px)").matches ?? false,
  );
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Render is driven manually: the engine mutates a ref'd store, so we bump this
  // counter when g.version changes or on a heartbeat, rather than mirroring state.
  const [, bumpRender] = useState(0);
  const forceRender = useCallback(() => bumpRender((n) => n + 1), []);

  const gameRef = useRef<GameState | null>(null);
  const renderedVersionRef = useRef(-1);
  const overlayRef = useRef<OverlayHandle | null>(null);
  const autoStartedRef = useRef(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLInputElement | null>(null);
  const shakeRef = useRef(0);
  const reducedRef = useRef(false);
  const soundDebounceRef = useRef<Map<string, number>>(new Map());
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
  // the loop) and a live viewport-width listener for the mobile banner.
  useEffect(() => {
    reducedRef.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const mq = window.matchMedia?.("(max-width: 767px)");
    if (!mq) return;
    const update = () => setNarrow(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
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
      const t = e.target as HTMLElement | null;
      if (t?.closest("button, a, select, textarea, [role=button]")) return;
      const g = gameRef.current;
      if (!g) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // let copy/paste/shortcuts through
      const k = e.key;
      const named = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End"];
      const handled = [...k].length === 1 || named.includes(k);
      if (!handled) return;
      e.preventDefault();
      applyKey(g, k);
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
  }, [phase, forceRender, playSound, pushToast, enqueueCard, setMood, triggerFlash]);

  const start = useCallback((s: number, isDaily: boolean, forceEvent?: string) => {
    const g = createRun({ seed: s, daily: isDaily, nowHHMM, forceEvent });
    gameRef.current = g;
    renderedVersionRef.current = g.version;
    setGame(g);
    setSeed(s);
    setDaily(isDaily);
    setPhase("running");
  }, []);

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
      if (next) getAudio(); // first-gesture AudioContext creation
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
      const overlay = overlayRef.current;
      const g = gameRef.current;
      if (!overlay || !g) return;
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

  const onCellClick = useCallback(
    (id: number) => {
      const g = gameRef.current;
      if (!g) return;
      applyPointer(g, { kind: "cell", id });
      forceRender();
      focusHiddenInput();
    },
    [forceRender, focusHiddenInput],
  );

  const onBoxClick = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    applyKey(g, "End"); // caret to end
    forceRender();
    focusHiddenInput();
  }, [forceRender, focusHiddenInput]);

  const onHiddenInput = useCallback(
    (e: FormEvent<HTMLInputElement>) => {
      const g = gameRef.current;
      const val = e.currentTarget.value;
      if (g && val) for (const ch of val) applyKey(g, ch);
      e.currentTarget.value = "";
      forceRender();
    },
    [forceRender],
  );

  const onSubmit = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    requestSubmit(g);
    forceRender();
  }, [forceRender]);

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

      {narrow && !bannerDismissed ? (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-(--border) bg-(--card) px-4 py-2.5 text-sm text-(--muted)">
          <span>Best played on desktop.</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setBannerDismissed(true)}
            className="text-(--muted) hover:text-(--foreground)"
          >
            <CloseIcon />
          </button>
        </div>
      ) : null}

      <div ref={panelRef} className="pg2-panel relative overflow-hidden">
        {phase === "start" ? (
          <StartScreen urlSeed={urlSeed} forceEvent={urlEvent} onStart={start} />
        ) : g ? (
          <RunningView
            g={g}
            seed={seed}
            soundOn={soundOn}
            moods={moods}
            boxRef={boxRef}
            hiddenInputRef={hiddenInputRef}
            onToggleSound={toggleSound}
            onCopySeed={copySeed}
            onCellClick={onCellClick}
            onBoxClick={onBoxClick}
            onHiddenInput={onHiddenInput}
            onSubmit={onSubmit}
          />
        ) : null}

        {g && phase === "running" ? <CanvasOverlay ref={overlayRef} /> : null}
        {g && phase === "running" && g.outcome === "playing" && g.act !== "finale" ? (
          <ChromeEvents g={g} onPointer={applyTarget} />
        ) : null}

        <div ref={flashRef} className="pg2-flash" aria-hidden="true" />
      </div>

      {/* Toast stack — bottom-right, newest at the bottom. */}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-72 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pg2-toast pg2-toast--${t.tone} px-4 py-2.5 text-sm text-[color:var(--pg2-ink)]`}
          >
            {t.text}
          </div>
        ))}
      </div>

      {/* Act title card overlay. */}
      {card ? (
        <div
          className="pg2-titlecard"
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
  soundOn,
  moods,
  boxRef,
  hiddenInputRef,
  onToggleSound,
  onCopySeed,
  onCellClick,
  onBoxClick,
  onHiddenInput,
  onSubmit,
}: {
  g: GameState;
  seed: number;
  soundOn: boolean;
  moods: Record<string, string>;
  boxRef: RefObject<HTMLDivElement | null>;
  hiddenInputRef: RefObject<HTMLInputElement | null>;
  onToggleSound: () => void;
  onCopySeed: () => void;
  onCellClick: (id: number) => void;
  onBoxClick: () => void;
  onHiddenInput: (e: FormEvent<HTMLInputElement>) => void;
  onSubmit: () => void;
}) {
  const password = cellsToPassword(g.cells);
  // Stable across the 250ms heartbeat (g is the same mutable ref for the whole
  // run) so the memoized RuleList can skip re-validating when nothing changed;
  // the api's methods read g live, so a fixed identity stays correct.
  const api = useMemo(() => makeRuleApi(g, nowHHMM), [g]);
  const moodEntries = Object.entries(moods);

  // A 1s re-validation heartbeat for the rule list only. Some rules flip purely
  // from time (a coupled rule going red, the current-time clock) without bumping
  // g.version; this counter, folded into RuleList's memo, keeps those flips live
  // at >=1Hz while leaving the memoized CharStage untouched.
  const [validationTick, setValidationTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setValidationTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <Hud
        elapsedMs={g.elapsedMs}
        act={g.act}
        seed={seed}
        soundOn={soundOn}
        onToggleSound={onToggleSound}
        onCopySeed={onCopySeed}
      />

      <div className="p-5 sm:p-6">
        {g.outcome === "victory" ? (
          <VictoryPanel elapsedMs={g.elapsedMs} />
        ) : g.act === "finale" ? (
          <FinalePlaceholder phase={g.finale?.phase ?? "missiles"} />
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

            <CharStage
              cells={g.cells}
              caret={g.caret}
              boxRef={boxRef}
              onCellClick={onCellClick}
              onBoxClick={onBoxClick}
            />

            {/* Visually-hidden input: summons the mobile soft keyboard. Desktop
                keydown preventDefault stops it from ever receiving those chars. */}
            <input
              ref={hiddenInputRef}
              onInput={onHiddenInput}
              aria-hidden="true"
              tabIndex={-1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                position: "absolute",
                width: 1,
                height: 1,
                opacity: 0,
                padding: 0,
                border: 0,
                left: -9999,
              }}
            />

            <p className="mt-5 mb-2 text-xs font-semibold tracking-wide text-[color:var(--pg2-muted)] uppercase">
              Your password must satisfy
            </p>
            <RuleList
              rules={g.rules}
              password={password}
              state={g}
              api={api}
              version={g.version}
              validationTick={validationTick}
            />

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                className="pg2-btn pg2-btn--primary px-6 py-2.5 text-[15px]"
                onClick={onSubmit}
              >
                Create account
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function FinalePlaceholder({ phase }: { phase: string }) {
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-dashed border-[color:var(--pg2-line-strong)] bg-[color:var(--pg2-field)] py-12 text-center">
      <span className="text-xs font-semibold tracking-[0.35em] text-[color:var(--pg2-muted)] uppercase">
        Finale
      </span>
      <h3 className="mt-2 text-3xl font-black tracking-tight text-[color:var(--pg2-ink)]">
        THE SUBMISSION
      </h3>
      <p className="mt-3 text-sm text-[color:var(--pg2-muted)]">
        Phase: <span className="font-mono">{phase}</span>
      </p>
      <p className="mt-1 text-xs text-[color:var(--pg2-legal)]">
        The boss stage arrives in a later build.
      </p>
    </div>
  );
}

function VictoryPanel({ elapsedMs }: { elapsedMs: number }) {
  const total = Math.floor(elapsedMs / 1000);
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  return (
    <div className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-[color:var(--pg2-line)] bg-[color:var(--pg2-field)] py-12 text-center">
      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" fill="#16a34a" />
        <path
          d="M7 12.5l3.2 3.2L17 9"
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <h3 className="mt-4 text-2xl font-black tracking-tight text-[color:var(--pg2-ink)]">
        Account created.
      </h3>
      <p className="mt-2 text-sm text-[color:var(--pg2-muted)]">
        Completed in{" "}
        <span className="font-mono">
          {mm}:{ss}
        </span>
        .
      </p>
    </div>
  );
}
