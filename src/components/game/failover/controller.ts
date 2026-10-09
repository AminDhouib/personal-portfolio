"use client";

import { gameCrashToReport } from "@/lib/report-game-error";
import { createFailoverAudio, type FailoverAudio } from "./audio/audio";
import { cueForEvent } from "./audio/cues";
import { keyCommand } from "./input/keys";
import { initialMachine, next, type Intent, type MachineState, type Tool } from "./input/machine";
import { advance, createLoop, resetClock, type LoopState } from "./loop";
import { loadGfxPref, type GfxPref } from "./prefs";
import {
  initialCamera,
  orbit,
  panByKey,
  panByPixels,
  toggleView,
  zoomBy,
  type CameraState,
} from "./scene/camera";
import {
  TIER_SETTINGS,
  createGovernor,
  initialTier,
  readPerfEnv,
  recordFrame,
  type Governor,
  type PerfEnv,
  type PerfTier,
} from "./scene/perf-tier";
import type { Cell } from "./scene/pick";
import { createFailoverScene, type FailoverScene, type Overlay } from "./scene/scene";
import { dispatch, type Action } from "./sim/action-log";
import { CONFIG } from "./sim/config";
import { snapshot } from "./sim/snapshot";
import { drainEvents, resetSim, S } from "./sim/state";
import { step } from "./sim/tick";
import { linkRefusalOf } from "./sim/topology";
import { T, fmt } from "./strings";
import type { GameMode, SimEvent } from "./sim/types";
import { readSimHud, type SimHud } from "./hud";

// Owns one run: the sim, the fixed-step loop, the scene and the sound. React
// talks to it through methods and reads a throttled HudState; it never touches
// the scene, and the scene never touches React or the sim's objects.

export type Speed = 1 | 2 | 3;

/** The sim's side of the HUD (hud.ts) plus the controller's own state. */
export interface HudState extends SimHud {
  paused: boolean;
  speed: Speed;
  tool: Tool;
  /** A placement or demolish is waiting for Confirm. */
  confirming: boolean;
  toast: string | null;
  soundOn: boolean;
  tier: PerfTier;
  /** The frame loop threw and stopped; the game shows its crash card. */
  crashed: boolean;
}

export interface ControllerOptions {
  seed?: string;
  mode?: GameMode;
  /** Animation-frame scheduling, injectable so the loop runs headless in tests. */
  schedule?: (cb: (t: number) => void) => number;
  cancel?: (id: number) => void;
  audio?: FailoverAudio;
  perfEnv?: PerfEnv;
  gfxPref?: GfxPref;
  createScene?: (canvas: HTMLCanvasElement, tier: PerfTier) => FailoverScene;
}

/** The HUD refreshes this often (ms) unless something discrete happens first. */
const HUD_INTERVAL_MS = 250;

/** Sim events the HUD shows at once rather than on its next 4 Hz refresh. */
const DISCRETE: ReadonlySet<SimEvent["kind"]> = new Set<SimEvent["kind"]>([
  "service-placed",
  "service-removed",
  "service-upgraded",
  "service-repaired",
  "link-added",
  "link-removed",
  "event-start",
  "event-end",
  "game-over",
]);
const TOAST_MS = 2600;
const MAX_PENDING_EVENTS = 512;

const REFUSALS: Record<string, string> = {
  money: T.no_money,
  occupied: T.tile_taken,
  bounds: T.off_board,
  over: T.run_is_over,
  missing: T.nothing_there,
  "max-tier": T.top_tier,
  "not-upgradable": T.not_upgradable,
  healthy: T.nothing_to_repair,
};

function freeSeed(): string {
  return `free-${Math.floor(Math.random() * 2 ** 32).toString(36)}`;
}

function nodeLabel(id: string): string {
  if (id === "internet") return "Internet";
  const service = S.services.find((s) => s.id === id);
  return service ? CONFIG.services[service.type].name : id;
}

export class FailoverController {
  private readonly schedule: (cb: (t: number) => void) => number;
  private readonly cancel: (id: number) => void;
  private readonly createScene: (canvas: HTMLCanvasElement, tier: PerfTier) => FailoverScene;
  private readonly audio: FailoverAudio;
  private readonly mode: GameMode;

  private scene: FailoverScene | null = null;
  private viewportHeight = 0;
  private loop: LoopState = createLoop();
  private rafId: number | null = null;
  private running = false;
  private visible = true;
  private onScreen = true;
  private disposed = false;
  private crashed = false;

  private machine: MachineState = initialMachine();
  private camera: CameraState = initialCamera();
  private hoverCell: Cell | null = null;
  private governor: Governor;
  private lastFrameMs: number | null = null;
  private lastRenderMs = -Infinity;
  private pendingEvents: SimEvent[] = [];

  private paused = false;
  private speed: Speed = 1;
  private selected: string | null = null;
  private toast: { text: string; until: number } | null = null;
  private clockMs = 0;

  private hud: HudState;
  private lastHudMs = -Infinity;
  private readonly listeners = new Set<() => void>();

  constructor(opts: ControllerOptions = {}) {
    this.schedule = opts.schedule ?? ((cb) => window.requestAnimationFrame(cb));
    this.cancel = opts.cancel ?? ((id) => window.cancelAnimationFrame(id));
    this.createScene = opts.createScene ?? createFailoverScene;
    this.audio = opts.audio ?? createFailoverAudio();
    this.mode = opts.mode ?? "survival";
    const pref = opts.gfxPref ?? loadGfxPref();
    this.governor = createGovernor(initialTier(opts.perfEnv ?? readPerfEnv(), pref), pref);
    resetSim({ seed: opts.seed ?? freeSeed(), mode: this.mode });
    this.hud = this.buildHud();
  }

  // ---- lifecycle ----

  /** Give the controller its canvas; the scene (and its WebGL context) is created here. */
  attach(canvas: HTMLCanvasElement, width: number, height: number): void {
    if (this.disposed || this.scene) return;
    this.scene = this.createScene(canvas, this.governor.tier);
    this.scene.setCamera(this.camera);
    this.resize(width, height);
  }

  resize(width: number, height: number): void {
    this.viewportHeight = height;
    this.scene?.resize(width, height);
  }

  start(): void {
    if (this.disposed) return;
    this.running = true;
    this.requestFrame();
  }

  /** The page was hidden or shown. Hidden stops the loop; time away is not counted. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    this.syncScheduling();
  }

  /** The canvas scrolled out of view or back. Off-screen stops the loop. */
  setOnScreen(onScreen: boolean): void {
    this.onScreen = onScreen;
    this.syncScheduling();
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    if (this.rafId !== null) this.cancel(this.rafId);
    this.rafId = null;
    this.scene?.dispose();
    this.scene = null;
    this.audio.close();
    this.listeners.clear();
  }

  /** Start a fresh run on a new seed, keeping the view and the settings. */
  restart(seed: string = freeSeed()): void {
    resetSim({ seed, mode: this.mode });
    this.machine = initialMachine();
    this.selected = null;
    this.paused = false;
    this.pendingEvents = [];
    this.loop = resetClock(createLoop());
    this.applyOverlay();
    this.emit();
    this.syncScheduling();
  }

  private canRun(): boolean {
    return this.running && this.visible && this.onScreen && !this.disposed && !this.crashed;
  }

  private requestFrame(): void {
    if (this.rafId !== null || !this.canRun()) return;
    this.rafId = this.schedule(this.frame);
  }

  private syncScheduling(): void {
    if (this.canRun()) {
      this.loop = resetClock(this.loop);
      this.lastFrameMs = null;
      this.requestFrame();
    } else if (this.rafId !== null) {
      this.cancel(this.rafId);
      this.rafId = null;
    }
  }

  // ---- the frame ----

  /** One animation frame: step the sim, play cues, render, refresh the HUD. Public for tests. */
  readonly frame = (nowMs: number): void => {
    this.rafId = null;
    try {
      this.clockMs = nowMs;
      const out = advance(this.loop, nowMs, this.paused ? 0 : this.speed);
      this.loop = out.loop;
      if (out.steps > 0) step(out.steps);

      const events = drainEvents();
      for (const event of events) {
        const cue = cueForEvent(event);
        if (cue) this.audio.play(cue, nowMs);
      }
      this.pendingEvents.push(...events);
      if (this.pendingEvents.length > MAX_PENDING_EVENTS) {
        this.pendingEvents.splice(0, this.pendingEvents.length - MAX_PENDING_EVENTS);
      }

      this.renderFrame(nowMs);

      const discrete = events.some((event) => DISCRETE.has(event.kind));
      if (this.toast && this.toast.until <= nowMs) this.toast = null;
      if (discrete || nowMs - this.lastHudMs >= HUD_INTERVAL_MS) this.emit();
    } catch (err) {
      const crash = gameCrashToReport("failover", err);
      if (crash) reportError(crash);
      this.running = false;
      this.crashed = true;
      this.emit();
      return;
    }
    this.requestFrame();
  };

  private renderFrame(nowMs: number): void {
    if (!this.scene) return;
    const settings = TIER_SETTINGS[this.governor.tier];
    if (nowMs - this.lastRenderMs < settings.frameIntervalMs) return;
    if (this.lastFrameMs !== null) {
      const before = this.governor.tier;
      this.governor = recordFrame(this.governor, nowMs - this.lastFrameMs);
      if (this.governor.tier !== before) {
        this.scene.setTier(this.governor.tier);
        this.emit();
      }
    }
    this.lastFrameMs = nowMs;
    this.lastRenderMs = nowMs;
    this.scene.render(snapshot(), this.pendingEvents, nowMs);
    this.pendingEvents = [];
  }

  // ---- HUD ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getHud = (): HudState => this.hud;

  private buildHud(): HudState {
    return {
      ...readSimHud(this.selected),
      paused: this.paused,
      speed: this.speed,
      tool: this.machine.tool,
      confirming: this.machine.mode === "ghost" || this.machine.mode === "confirmDemolish",
      toast: this.toast ? this.toast.text : null,
      soundOn: this.audio.isOn(),
      tier: this.governor.tier,
      crashed: this.crashed,
    };
  }

  private emit(): void {
    this.hud = this.buildHud();
    this.lastHudMs = this.clockMs;
    for (const listener of this.listeners) listener();
  }

  private showToast(text: string): void {
    this.toast = { text, until: this.clockMs + TOAST_MS };
  }

  // ---- input ----

  private feed(event: Parameters<typeof next>[1]): boolean {
    const out = next(this.machine, event, {
      linkRefusal: linkRefusalOf,
      label: nodeLabel,
    });
    this.machine = out.state;
    this.apply(out.intent);
    this.applyOverlay();
    this.emit();
    return out.consumed;
  }

  private act(action: Action): boolean {
    const result = dispatch(action);
    if (!result.ok) this.showToast(REFUSALS[result.reason] ?? T.not_allowed);
    return result.ok;
  }

  private apply(intent: Intent): void {
    switch (intent.kind) {
      case "none":
        return;
      case "place":
        this.act({ op: 0, type: intent.service, x: intent.x, z: intent.z });
        return;
      case "link":
        if (this.act({ op: 1, from: intent.from, to: intent.to })) {
          this.showToast(
            fmt(T.link_made, { from: nodeLabel(intent.from), to: nodeLabel(intent.to) }),
          );
        }
        return;
      case "demolish":
        if (this.selected === intent.id) this.selected = null;
        this.act({ op: 3, id: intent.id });
        return;
      case "inspect":
        this.selected = intent.id === "internet" ? null : intent.id;
        return;
      case "toast":
        this.showToast(intent.message);
        return;
      case "pan":
        this.setCamera(panByKey(this.camera, intent.dx, intent.dz));
        return;
      case "orbit":
        this.setCamera(orbit(this.camera, intent.dir));
        return;
      case "zoom":
        this.setCamera(zoomBy(this.camera, intent.dir > 0 ? 1.2 : 1 / 1.2));
        return;
      case "pause":
        this.paused = !this.paused;
        return;
      case "view":
        this.setCamera(toggleView(this.camera));
        return;
    }
  }

  private setCamera(state: CameraState): void {
    this.camera = state;
    this.scene?.setCamera(state);
  }

  private applyOverlay(): void {
    const m = this.machine;
    let ghost: Overlay["ghost"] = null;
    if (m.mode === "ghost") ghost = { type: m.tool.service, x: m.x, z: m.z };
    else if (m.mode === "idle" && m.tool.kind === "place" && this.hoverCell) {
      ghost = { type: m.tool.service, ...this.hoverCell };
    }
    this.scene?.setOverlay({ ghost, highlight: m.mode === "linkFrom" ? m.from : null });
  }

  /** A tap or click at a client point. */
  tap(clientX: number, clientY: number, pointer: "mouse" | "touch"): void {
    const hit = this.scene?.pick(clientX, clientY);
    if (!hit) return;
    if (hit.node) this.feed({ type: "tapNode", id: hit.node, pointer });
    else this.feed({ type: "tapCell", x: hit.cell.x, z: hit.cell.z, pointer });
  }

  /** A mouse moving over the board: the armed Place tool previews where it would land. */
  hover(clientX: number, clientY: number): void {
    const hit = this.scene?.pick(clientX, clientY);
    const cell = hit && !hit.node ? hit.cell : null;
    if (cell?.x === this.hoverCell?.x && cell?.z === this.hoverCell?.z) return;
    this.hoverCell = cell;
    this.applyOverlay();
  }

  dragBy(dxPx: number, dyPx: number): void {
    this.setCamera(panByPixels(this.camera, dxPx, dyPx, this.viewportHeight));
  }

  zoom(factor: number): void {
    this.setCamera(zoomBy(this.camera, factor));
  }

  gesture(active: boolean): void {
    this.feed({ type: "gesture", active });
  }

  setTool(tool: Tool): void {
    this.feed({ type: "setTool", tool });
  }

  confirm(): void {
    this.feed({ type: "confirm" });
  }

  cancelPending(): void {
    this.feed({ type: "cancel" });
  }

  /** A key went down while the game had focus. True when the caller should preventDefault. */
  key(key: string): boolean {
    const command = keyCommand(key);
    if (!command) return false;
    const consumed = this.feed({ type: "key", command });
    // Game keys belong to the game only while a run is live.
    return consumed && S.over === null;
  }

  orbitView(dir: -1 | 1): void {
    this.apply({ kind: "orbit", dir });
  }

  toggleTopDown(): void {
    this.apply({ kind: "view" });
  }

  togglePause(): void {
    this.paused = !this.paused;
    this.emit();
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
    this.paused = false;
    this.emit();
  }

  upgradeSelected(): void {
    if (!this.selected) return;
    this.act({ op: 4, id: this.selected });
    this.emit();
  }

  /** Call from the user gesture that starts the game, so sound can play once it is on. */
  unlockAudio(): void {
    this.audio.unlock();
  }

  setSoundOn(on: boolean): void {
    this.audio.unlock();
    this.audio.setOn(on);
    this.emit();
  }
}
