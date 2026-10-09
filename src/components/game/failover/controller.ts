"use client";

import { gameCrashToReport } from "@/lib/report-game-error";
import { createFailoverAudio, type FailoverAudio } from "./audio/audio";
import { cueForEvent } from "./audio/cues";
import { dailyRun, DAILY_MAX_TICKS, type DailyRun } from "./daily/daily";
import { readDailyResult, type DailyResult } from "./daily/result";
import { keyCommand } from "./input/keys";
import { initialMachine, next, type Intent, type MachineState, type Tool } from "./input/machine";
import { advance, createLoop, resetClock, type LoopState } from "./loop";
import { loadGfxPref, type GfxPref } from "./prefs";
import {
  initialCamera,
  orbit,
  panByKey,
  panByPixels,
  projectToView,
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
import { CONFIG, type ServiceType } from "./sim/config";
import { snapshot } from "./sim/snapshot";
import { drainEvents, resetSim, S } from "./sim/state";
import { step } from "./sim/tick";
import { scoreOf } from "./sim/score";
import { linkRefusalOf } from "./sim/topology";
import { T, fmt } from "./strings";
import type { GameMode, SimEvent } from "./sim/types";
import { readSimHud, type SimHud } from "./hud";

// Owns one run: the sim, the fixed-step loop, the scene and the sound. React
// talks to it through methods and reads a throttled HudState; it never touches
// the scene, and the scene never touches React or the sim's objects.

export type Speed = 1 | 2 | 3;

/** A failure or soft badge pinned over a node: the reason's string key and where, in view pixels. */
export interface Badge {
  id: number;
  key: string;
  x: number;
  y: number;
}

/** The sim's latest warning (an incident, an alert): a string key and its parameters. */
export interface Alert {
  key: string;
  level: "info" | "warning" | "danger";
  params: Readonly<Record<string, string | number>>;
}

/**
 * A finger's placement or demolish waiting for Confirm: what it is, and where
 * the Confirm and Cancel pair sits, in board pixels, kept on the board.
 */
export interface Pending {
  kind: "place" | "demolish";
  name: string;
  x: number;
  y: number;
}

/** How a run ended, handed to onRunEnd once per run. */
export interface RunEnd {
  mode: GameMode;
  /** Game seconds survived. */
  seconds: number;
  score: number;
  /** The UTC day, when this was a Daily Incident. */
  daily?: string;
}

/** The sim's side of the HUD (hud.ts) plus the controller's own state. */
export interface HudState extends SimHud {
  paused: boolean;
  speed: Speed;
  tool: Tool;
  pending: Pending | null;
  toast: string | null;
  soundOn: boolean;
  tier: PerfTier;
  /** The graphics choice in Settings: Auto, or High or Low pinned. */
  gfxPref: GfxPref;
  /** The frame loop threw and stopped; the game shows its crash card. */
  crashed: boolean;
  /** A save or a blueprint is being built into the sim; the board takes no input meanwhile. */
  loading: boolean;
  badges: Badge[];
  alert: Alert | null;
  /** Set while the run is a Daily Incident; `result` once it has ended. */
  daily: { day: string; result: DailyResult | null } | null;
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
  /** Start with time stopped (the first-run coach starts the clock with its last step). */
  startPaused?: boolean;
  /** Called once when a run ends (the sim's game-over event), for the device record. */
  onRunEnd?: (run: RunEnd) => void;
}

/** The HUD refreshes this often (ms) unless something discrete happens first. */
const HUD_INTERVAL_MS = 250;

/**
 * Sim events the HUD shows at once rather than on its next 4 Hz refresh.
 * request-failed and service-badge stay on the refresh: under load they fire many times a tick.
 */
const DISCRETE: ReadonlySet<SimEvent["kind"]> = new Set<SimEvent["kind"]>([
  "service-placed",
  "service-removed",
  "service-upgraded",
  "service-repaired",
  "link-added",
  "link-removed",
  "event-start",
  "event-end",
  "warning",
  "game-over",
]);
const TOAST_MS = 2600;
/** A badge stays this long after the node's last failure of that kind. */
const BADGE_MS = 1600;
const MAX_BADGES = 24;
/** A badge floats this high over the ground, about the top of a tier-1 node. */
const BADGE_Y = 3;
const ALERT_MS = 4000;
/** How far the Confirm and Cancel pair keeps from the board's edges, in pixels. */
const PENDING_MARGIN_PX = 48;
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
  private mode: GameMode;
  private readonly onRunEnd: ((run: RunEnd) => void) | null;
  private readonly perfEnv: PerfEnv;

  private scene: FailoverScene | null = null;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private loop: LoopState = createLoop();
  private rafId: number | null = null;
  private running = false;
  private visible = true;
  private onScreen = true;
  private disposed = false;
  private crashed = false;
  private loading = false;
  /** Aborted by dispose(), so a swap still running stops at its next yield, off the shared sim. */
  private swap: AbortController | null = null;

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
  private badges: { id: number; serviceId: string; key: string; until: number }[] = [];
  private nextBadgeId = 1;
  private alert: (Alert & { until: number }) | null = null;
  private clockMs = 0;
  /** The Daily Incident being played: its calls on the sim, how many are made, its result. */
  private daily: { run: DailyRun; made: number; result: DailyResult | null } | null = null;

  private hud: HudState;
  private lastHudMs = -Infinity;
  private readonly listeners = new Set<() => void>();

  constructor(opts: ControllerOptions = {}) {
    this.schedule = opts.schedule ?? ((cb) => window.requestAnimationFrame(cb));
    this.cancel = opts.cancel ?? ((id) => window.cancelAnimationFrame(id));
    this.createScene = opts.createScene ?? createFailoverScene;
    this.audio = opts.audio ?? createFailoverAudio();
    this.mode = opts.mode ?? "survival";
    this.onRunEnd = opts.onRunEnd ?? null;
    const pref = opts.gfxPref ?? loadGfxPref();
    this.perfEnv = opts.perfEnv ?? readPerfEnv();
    this.governor = createGovernor(initialTier(this.perfEnv, pref), pref);
    this.paused = opts.startPaused ?? false;
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
    this.viewportWidth = width;
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
    this.swap?.abort();
    this.running = false;
    if (this.rafId !== null) this.cancel(this.rafId);
    this.rafId = null;
    this.scene?.dispose();
    this.scene = null;
    this.audio.close();
    this.listeners.clear();
  }

  /** Start a fresh run on a new seed, keeping the view and the settings; `mode` switches Survival and Sandbox. */
  restart(seed: string = freeSeed(), mode: GameMode = this.mode): void {
    if (this.loading) return;
    this.mode = mode;
    resetSim({ seed, mode });
    this.paused = false;
    this.freshRun();
  }

  /**
   * Swap the live run for one built elsewhere: a save's replay, a shared blueprint. While
   * `work` runs the loop asks for no frames (a load yields between chunks, and a frame would
   * step a half-built sim) and the board takes no input; a second call meanwhile is refused,
   * so a double tap never loads twice. The run left in the sim is adopted, mode and all.
   * `signal` aborts when the controller is disposed: work that yields must check it and stop,
   * since the sim is shared and the next game to mount would otherwise find it still moving.
   */
  async replaceRun<R>(
    work: (signal: AbortSignal) => R | Promise<R>,
  ): Promise<{ ok: true; value: R } | { ok: false }> {
    if (this.loading || this.disposed) return { ok: false };
    this.loading = true;
    const swap = new AbortController();
    this.swap = swap;
    this.syncScheduling();
    this.emit();
    try {
      return { ok: true, value: await work(swap.signal) };
    } finally {
      this.swap = null;
      this.loading = false;
      this.mode = S.gameMode;
      this.freshRun();
    }
  }

  /** The controller's side of a new run. The sim's queued events belong to how it was built, not to play. */
  private freshRun(): void {
    this.daily = null;
    drainEvents();
    this.machine = initialMachine();
    this.selected = null;
    this.pendingEvents = [];
    this.badges = [];
    this.alert = null;
    this.loop = resetClock(createLoop());
    this.applyOverlay();
    this.emit();
    this.syncScheduling();
  }

  /** Start today's Daily Incident: the day's seed and incident, in survival, no sandbox. */
  startDaily(day: string): void {
    if (this.loading) return;
    const run = dailyRun(day);
    this.restart(run.seed, "survival");
    run.setup();
    this.daily = { run, made: 0, result: null };
    this.makeDueCalls();
    this.emit();
  }

  /** The incident's calls that have come due, made before anything else happens at this tick. */
  private makeDueCalls(): void {
    const daily = this.daily;
    if (!daily) return;
    const { scheduled } = daily.run;
    while (daily.made < scheduled.length && (scheduled[daily.made]?.tick ?? Infinity) <= S.tick) {
      scheduled[daily.made++]?.run();
    }
  }

  /**
   * Step the sim. A daily goes one tick at a time so each incident call lands on its tick, as
   * the replay on the server makes it, and retires a run still alive at the 900 s cap.
   */
  private stepSim(steps: number): void {
    if (!this.daily) {
      step(steps);
      return;
    }
    for (let i = 0; i < steps && !S.over; i++) {
      step(1);
      this.makeDueCalls();
      if (!S.over && S.tick >= DAILY_MAX_TICKS) dispatch({ op: 8 });
    }
  }

  private canRun(): boolean {
    return (
      this.running &&
      this.visible &&
      this.onScreen &&
      !this.disposed &&
      !this.crashed &&
      !this.loading
    );
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
    // A frame already in flight when a load began: the sim is not the game's until it ends.
    if (this.loading) return;
    try {
      this.clockMs = nowMs;
      const out = advance(this.loop, nowMs, this.paused ? 0 : this.speed);
      this.loop = out.loop;
      if (out.steps > 0) this.stepSim(out.steps);

      const events = drainEvents();
      for (const event of events) {
        const cue = cueForEvent(event);
        if (cue) this.audio.play(cue, nowMs);
      }
      this.collect(events, nowMs);
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

  /** Badges, the latest warning and the end of the run, from this frame's sim events. */
  private collect(events: readonly SimEvent[], nowMs: number): void {
    for (const e of events) {
      if (e.kind === "request-failed" && e.serviceId && e.reason) {
        this.addBadge(e.serviceId, e.reason, nowMs);
      } else if (e.kind === "service-badge") {
        this.addBadge(e.serviceId, e.key, nowMs);
      } else if (e.kind === "warning") {
        this.alert = {
          key: e.key,
          level: e.level,
          params: e.params ?? {},
          until: nowMs + ALERT_MS,
        };
      } else if (e.kind === "game-over") {
        if (this.daily) this.daily.result = readDailyResult(this.daily.run.day);
        this.onRunEnd?.({
          mode: S.gameMode,
          seconds: S.elapsedGameTime,
          score: scoreOf(),
          ...(this.daily && { daily: this.daily.run.day }),
        });
      }
    }
    if (this.badges.length > 0) this.badges = this.badges.filter((b) => b.until > nowMs);
  }

  /** One badge per node: the same reason again keeps it up, a new reason replaces it. */
  private addBadge(serviceId: string, key: string, nowMs: number): void {
    const until = nowMs + BADGE_MS;
    const same = this.badges.find((b) => b.serviceId === serviceId);
    if (same && same.key === key) {
      same.until = until;
      return;
    }
    this.badges = this.badges.filter((b) => b.serviceId !== serviceId);
    this.badges.push({ id: this.nextBadgeId++, serviceId, key, until });
    if (this.badges.length > MAX_BADGES) this.badges.shift();
  }

  private badgeViews(): Badge[] {
    const out: Badge[] = [];
    for (const b of this.badges) {
      if (b.until <= this.clockMs) continue;
      const svc = S.services.find((s) => s.id === b.serviceId);
      if (!svc) continue;
      const at = projectToView(
        this.camera,
        [svc.position.x, BADGE_Y, svc.position.z],
        this.viewportWidth,
        this.viewportHeight,
      );
      if (at) out.push({ id: b.id, key: b.key, x: at.x, y: at.y });
    }
    return out;
  }

  private pendingView(): Pending | null {
    const m = this.machine;
    let kind: Pending["kind"];
    let type: ServiceType;
    let point: [number, number, number];
    if (m.mode === "ghost") {
      kind = "place";
      type = m.tool.service;
      point = [m.x, 0, m.z];
    } else if (m.mode === "confirmDemolish") {
      const svc = S.services.find((s) => s.id === m.id);
      if (!svc) return null;
      kind = "demolish";
      type = svc.type;
      point = [svc.position.x, 0, svc.position.z];
    } else {
      return null;
    }
    const w = this.viewportWidth;
    const h = this.viewportHeight;
    const at = projectToView(this.camera, point, w, h) ?? { x: w / 2, y: h };
    const clamp = (v: number, size: number) => {
      const margin = Math.min(PENDING_MARGIN_PX, size / 2);
      return Math.min(Math.max(v, margin), size - margin);
    };
    return { kind, name: CONFIG.services[type].name, x: clamp(at.x, w), y: clamp(at.y, h) };
  }

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
      pending: this.pendingView(),
      toast: this.toast ? this.toast.text : null,
      soundOn: this.audio.isOn(),
      tier: this.governor.tier,
      gfxPref: this.governor.pref,
      crashed: this.crashed,
      loading: this.loading,
      badges: this.badgeViews(),
      daily: this.daily ? { day: this.daily.run.day, result: this.daily.result } : null,
      alert:
        this.alert && this.alert.until > this.clockMs
          ? { key: this.alert.key, level: this.alert.level, params: this.alert.params }
          : null,
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
    if (this.loading) return false;
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
    if (this.loading) return false;
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
    // The Confirm and Cancel pair sits by its ghost, so a pan or pinch moves it at once.
    if (this.machine.mode === "ghost" || this.machine.mode === "confirmDemolish") this.emit();
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

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.emit();
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

  repairSelected(): void {
    if (!this.selected) return;
    this.act({ op: 6, id: this.selected });
    this.emit();
  }

  toggleAsgSelected(): void {
    if (!this.selected) return;
    this.act({ op: 5, id: this.selected });
    this.emit();
  }

  /** Demolish the inspected node (the inspector asks first) and close the inspector. */
  demolishSelected(): void {
    if (!this.selected) return;
    const id = this.selected;
    this.selected = null;
    this.act({ op: 3, id });
    this.emit();
  }

  /** Close the inspector. */
  deselect(): void {
    this.selected = null;
    this.emit();
  }

  /** A fresh frame of the board as a 2D canvas, for the share card; null before the scene exists. */
  captureScene(): HTMLCanvasElement | null {
    return this.scene?.capture() ?? null;
  }

  /** Call from the user gesture that starts the game, so sound can play once it is on. */
  unlockAudio(): void {
    this.audio.unlock();
  }

  /** The Settings graphics choice: Auto picks from the device and frame times, High or Low pin it. */
  setGfxPref(pref: GfxPref): void {
    this.governor = createGovernor(initialTier(this.perfEnv, pref), pref);
    this.scene?.setTier(this.governor.tier);
    this.lastFrameMs = null;
    this.emit();
  }

  setSoundOn(on: boolean): void {
    this.audio.unlock();
    this.audio.setOn(on);
    this.emit();
  }
}
