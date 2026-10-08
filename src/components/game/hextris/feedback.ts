import type { EngineEvent } from "./engine/types";
import { popupFor, shakeFor, type Popup } from "./render/juice";
import type { HextrisSounds } from "./sound-manager";

// The shell's reading of the engine's events (spec section 11): which sounds play, which
// vibrations fire and what the React HUD shows. Pure, so the mapping is testable without a
// canvas, Web Audio or React; hextris.tsx applies the result once per frame.

export type SoundCue =
  | { cue: "rotate" }
  | { cue: "settle" }
  | { cue: "match"; combo: number }
  | { cue: "combo"; combo: number }
  | { cue: "clean-sweep" }
  | { cue: "boundary-shrink" }
  | { cue: "countdown" }
  | { cue: "go" };

export type HapticPattern = number | number[];

export interface Milestone {
  text: string;
  color: string;
}

export interface Feedback {
  sounds: SoundCue[];
  haptics: HapticPattern[];
  /** The phase the batch left the run in, or null if it did not change. */
  phase: "playing" | "paused" | "over" | null;
  over: { side: number; score: number; cellsCleared: number } | null;
  /** The latest score, or null if unchanged. */
  score: number | null;
  /** Whether the score went up, so the HUD chip pulses. */
  scorePulse: boolean;
  combo: number | null;
  /** Momentum as a whole percent, or null if unchanged. */
  momentum: number | null;
  milestone: Milestone | null;
  /** A rotation happened (the tutorial card closes on the first one). */
  rotated: boolean;
  /** Run-clock time of the next boundary drop once warned; null to end the countdown. */
  boundaryDropAt: number | null | undefined;
  /** The start countdown digit to show; null once GO is called, undefined if unchanged. */
  countdown: number | null | undefined;
  /** Peak screen shake, in CSS pixels, for the biggest clear in the batch; 0 for none. */
  shake: number;
  /** A "+N" for each scoring clear or clean sweep, in event order. */
  popups: Popup[];
}

/** What the mapping remembers between batches. */
export interface FeedbackMemo {
  combo: number;
}

// One accent per combo step, so each new level of a combo looks different.
export const COMBO_COLOURS: readonly string[] = [
  "#6366f1",
  "#22c55e",
  "#06b6d4",
  "#f59e0b",
  "#a78bfa",
  "#ec4899",
];

const CLEAN_SWEEP: Milestone = { text: "CLEAN SWEEP!", color: "#fde047" };
const PANIC_CLEAR: Milestone = { text: "PANIC CLEAR", color: "#a78bfa" };
const BOUNDARY_DROP: Milestone = { text: "BOUNDARY TIGHTENS", color: "#f59e0b" };

export function feedbackFor(events: readonly EngineEvent[], memo: FeedbackMemo): Feedback {
  const out: Feedback = {
    sounds: [],
    haptics: [],
    phase: null,
    over: null,
    score: null,
    scorePulse: false,
    combo: null,
    momentum: null,
    milestone: null,
    rotated: false,
    boundaryDropAt: undefined,
    countdown: undefined,
    shake: 0,
    popups: [],
  };
  // A combo burst never replaces a clean sweep, Panic Clear or boundary burst from the same batch.
  let bigMilestone = false;
  const announce = (milestone: Milestone) => {
    out.milestone = milestone;
    bigMilestone = true;
  };
  let bombed = false;
  let chained = false;

  for (const event of events) {
    const popup = popupFor(event);
    if (popup) out.popups.push(popup);
    switch (event.type) {
      case "run-start":
        memo.combo = 1;
        out.phase = "playing";
        out.score = 0;
        out.combo = 1;
        out.momentum = 0;
        out.boundaryDropAt = null;
        break;
      case "pause":
        out.phase = "paused";
        break;
      case "resume":
        out.phase = "playing";
        break;
      case "game-over":
        out.phase = "over";
        out.over = { side: event.side, score: event.score, cellsCleared: event.cellsCleared };
        out.haptics.push([80, 40, 80, 40, 80]);
        break;
      case "rotate":
        out.sounds.push({ cue: "rotate" });
        out.haptics.push(8);
        out.rotated = true;
        break;
      case "settle":
        out.sounds.push({ cue: "settle" });
        break;
      case "bomb":
        bombed = true;
        break;
      case "clear":
        out.sounds.push({ cue: "match", combo: event.combo });
        if (bombed) out.haptics.push([50, 30, 80]);
        else if (event.combo >= 3) out.haptics.push([30, 20, 30]);
        else out.haptics.push([20]);
        bombed = false;
        chained = event.chain;
        out.shake = Math.max(out.shake, shakeFor(event.count, event.chain));
        break;
      case "combo":
        if (event.combo > memo.combo) {
          out.sounds.push({ cue: "combo", combo: event.combo });
          if (event.combo >= 2 && !bigMilestone) {
            out.milestone = {
              // "\u00d7" is the multiplication sign the burst's sizing looks for.
              text: `\u00d7${event.combo} ${chained ? "CHAIN" : "COMBO"}!`,
              color: COMBO_COLOURS[(event.combo - 2) % COMBO_COLOURS.length] ?? "#ffffff",
            };
          }
        }
        memo.combo = event.combo;
        out.combo = event.combo;
        break;
      case "combo-expired":
        memo.combo = 1;
        out.combo = 1;
        break;
      case "clean-sweep":
        announce(CLEAN_SWEEP);
        out.sounds.push({ cue: "clean-sweep" });
        out.haptics.push([80, 40, 80, 40, 120]);
        break;
      case "panic":
        announce(PANIC_CLEAR);
        out.sounds.push({ cue: "clean-sweep" });
        out.haptics.push([100, 40, 100, 40, 100]);
        break;
      case "momentum":
        out.momentum = Math.floor(event.value);
        break;
      case "boundary-warning":
        out.boundaryDropAt = event.dropAtMs;
        break;
      case "boundary-drop":
        announce(BOUNDARY_DROP);
        out.boundaryDropAt = null;
        out.sounds.push({ cue: "boundary-shrink" });
        out.haptics.push([40, 20, 40]);
        break;
      case "score":
        out.score = event.score;
        out.scorePulse = true;
        break;
      // A chain is read from its clear's `chain` flag; the music follows the level once a second.
      case "countdown":
        out.countdown = event.count;
        out.sounds.push({ cue: "countdown" });
        break;
      case "go":
        out.countdown = null;
        out.sounds.push({ cue: "go" });
        break;
      case "chain":
      case "spawn":
      case "gravity":
      case "level":
        break;
    }
  }
  return out;
}

/** Whole seconds left before the boundary drops, or null once it has. */
export function shrinkCountdown(dropAtMs: number, elapsedMs: number): number | null {
  const left = dropAtMs - elapsedMs;
  return left > 0 ? Math.ceil(left / 1000) : null;
}

/** How long a clear's screen shake takes to die away. */
export const SHAKE_DECAY_MS = 250;

/** The shake offset `ageMs` after a clear peaked at `peak` CSS pixels: a quadratic ease to 0. */
export function shakeAmplitude(peak: number, ageMs: number): number {
  if (peak <= 0 || ageMs >= SHAKE_DECAY_MS) return 0;
  const left = 1 - Math.max(0, ageMs) / SHAKE_DECAY_MS;
  return peak * left * left;
}

/** Gameplay music speeds up with the level: 105 BPM plus two per level, to level 35. */
export function musicTempo(level: number): number {
  return 105 + Math.min(35, level) * 2;
}

type CuePlayer = Pick<
  HextrisSounds,
  "rotate" | "settle" | "match" | "combo" | "cleanSweep" | "boundaryShrink" | "countdown" | "go"
>;

export function playCue(player: CuePlayer, cue: SoundCue): void {
  switch (cue.cue) {
    case "rotate":
      player.rotate();
      return;
    case "settle":
      player.settle();
      return;
    case "match":
      player.match(cue.combo);
      return;
    case "combo":
      player.combo(cue.combo);
      return;
    case "clean-sweep":
      player.cleanSweep();
      return;
    case "boundary-shrink":
      player.boundaryShrink();
      return;
    case "countdown":
      player.countdown();
      return;
    case "go":
      player.go();
      return;
  }
}
