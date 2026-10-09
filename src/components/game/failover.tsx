"use client";

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  Check,
  Eye,
  Link2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { FailoverController, type HudState, type Speed } from "./failover/controller";
import type { Tool } from "./failover/input/machine";
import { CONFIG, SERVICE_TYPES, type ServiceType } from "./failover/sim/config";
import { T, fmt } from "./failover/strings";
import { createHudBridge, useHud } from "./failover/ui/use-hud";

/**
 * Failover: build a cloud that survives the traffic. The sim, the scene and
 * the controller live in `./failover/`; this entry mounts the canvas, wires
 * pointer and keyboard input to the controller and draws a minimal toolbar.
 * It is only ever loaded through the poster's dynamic import.
 */

/** Movement under this many pixels between press and release is a tap, not a drag. */
const TAP_SLOP_PX = 6;

const OVER_TEXT: Record<NonNullable<HudState["over"]>, string> = {
  reputation: T.over_reputation,
  money: T.over_money,
  retired: T.over_retired,
};

function clock(seconds: number): string {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function ToolButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      className={`inline-flex h-9 min-w-9 items-center justify-center gap-1 rounded-md border px-2 text-xs transition-colors ${
        pressed
          ? "border-[#06b6d4] bg-[#06b6d4]/15 text-[#06b6d4]"
          : "border-[#27272a] bg-[#0b0b0d]/90 text-[#d4d4d8] hover:border-[#52525b]"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ hud, controller }: { hud: HudState; controller: FailoverController }) {
  const tool = hud.tool;
  const placing = tool.kind === "place" ? tool.service : "";
  const setTool = (next: Tool) => controller.setTool(next);
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
      <label className="sr-only" htmlFor="failover-build">
        {T.build_a_service}
      </label>
      <select
        id="failover-build"
        value={placing}
        onChange={(e) => {
          const service = e.target.value as ServiceType;
          if (service) setTool({ kind: "place", service });
        }}
        className="h-9 rounded-md border border-[#27272a] bg-[#0b0b0d]/90 px-2 text-xs text-[#d4d4d8]"
      >
        <option value="">{T.build_menu}</option>
        {SERVICE_TYPES.map((type) => (
          <option key={type} value={type}>
            {CONFIG.services[type].name} (${CONFIG.services[type].cost})
          </option>
        ))}
      </select>
      <ToolButton
        label={`${T.select} (1)`}
        pressed={tool.kind === "select"}
        onClick={() => setTool({ kind: "select" })}
      >
        <MousePointer2 className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton
        label={`${T.link} (2)`}
        pressed={tool.kind === "link"}
        onClick={() => setTool({ kind: "link" })}
      >
        <Link2 className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton
        label={`${T.demolish} (3)`}
        pressed={tool.kind === "demolish"}
        onClick={() => setTool({ kind: "demolish" })}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </ToolButton>
      {hud.confirming && (
        <>
          <ToolButton label={T.confirm} onClick={() => controller.confirm()}>
            <Check className="h-4 w-4" aria-hidden />
          </ToolButton>
          <ToolButton label={T.cancel} onClick={() => controller.cancelPending()}>
            <X className="h-4 w-4" aria-hidden />
          </ToolButton>
        </>
      )}
      <span className="mx-1 h-6 w-px bg-[#27272a]" aria-hidden />
      <ToolButton
        label={`${hud.paused ? T.resume : T.pause} (Space)`}
        onClick={() => controller.togglePause()}
      >
        {hud.paused ? (
          <Play className="h-4 w-4" aria-hidden />
        ) : (
          <Pause className="h-4 w-4" aria-hidden />
        )}
      </ToolButton>
      {([1, 2, 3] as Speed[]).map((speed) => (
        <ToolButton
          key={speed}
          label={fmt(T.speed_n, { n: speed })}
          pressed={!hud.paused && hud.speed === speed}
          onClick={() => controller.setSpeed(speed)}
        >
          {speed}x
        </ToolButton>
      ))}
      <ToolButton label={`${T.turn_left} (Q)`} onClick={() => controller.orbitView(-1)}>
        <RotateCcw className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton label={`${T.turn_right} (E)`} onClick={() => controller.orbitView(1)}>
        <RotateCw className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton label={`${T.top_down} (T)`} onClick={() => controller.toggleTopDown()}>
        <Eye className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton
        label={hud.soundOn ? T.sound_off : T.sound_on}
        pressed={hud.soundOn}
        onClick={() => controller.setSoundOn(!hud.soundOn)}
      >
        {hud.soundOn ? (
          <Volume2 className="h-4 w-4" aria-hidden />
        ) : (
          <VolumeX className="h-4 w-4" aria-hidden />
        )}
      </ToolButton>
    </div>
  );
}

function StatusLine({ hud, controller }: { hud: HudState; controller: FailoverController }) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[#0b0b0d]/85 px-3 py-1.5 font-mono text-xs text-[#d4d4d8]">
      <span>${Math.floor(hud.money).toLocaleString("en-US")}</span>
      <span>
        {T.rep_short} {Math.max(0, Math.round(hud.reputation))}%
      </span>
      <span>{clock(hud.time)}</span>
      <span>
        {hud.rps.toFixed(1)} {T.reqs_per_second}
      </span>
      {hud.selected && (
        <span className="inline-flex items-center gap-2">
          {hud.selected.name} T{hud.selected.tier}, {Math.round(hud.selected.health)}%
          <button
            type="button"
            onClick={() => controller.upgradeSelected()}
            className="rounded border border-[#27272a] px-1.5 py-0.5 hover:border-[#52525b]"
          >
            {T.upgrade}
          </button>
        </span>
      )}
      <span role="status" aria-live="polite" className="text-[#f59e0b]">
        {hud.toast ?? ""}
      </span>
    </div>
  );
}

export function FailoverGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<FailoverController | null>(null);
  const bridge = useMemo(() => createHudBridge(), []);
  const hud = useHud(bridge);

  useEffect(() => {
    const container = containerRef.current;
    const host = hostRef.current;
    if (!container || !host) return;

    // Each mount gets its own canvas: dispose() forces the WebGL context lost, and a
    // canvas React kept across a StrictMode remount would hand the new renderer a dead one.
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    host.appendChild(canvas);

    const controller = new FailoverController();
    controllerRef.current = controller;
    const rect = container.getBoundingClientRect();
    controller.attach(canvas, rect.width, rect.height);
    controller.setVisible(!document.hidden);
    controller.start();
    bridge.connect(controller);
    container.focus({ preventScroll: true });

    const resize = new ResizeObserver(([entry]) => {
      if (entry) controller.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resize.observe(container);
    const seen = new IntersectionObserver(([entry]) => {
      if (entry) controller.setOnScreen(entry.isIntersecting);
    });
    seen.observe(container);
    const onVisibility = () => controller.setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);

    // Wheel zoom needs a non-passive listener to keep the page from scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      controller.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    host.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      host.removeEventListener("wheel", onWheel);
      document.removeEventListener("visibilitychange", onVisibility);
      seen.disconnect();
      resize.disconnect();
      bridge.connect(null);
      controller.dispose();
      controllerRef.current = null;
      canvas.remove();
    };
  }, [bridge]);

  // Pointer bookkeeping: one finger or a mouse taps or drags; two fingers pan and pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const press = useRef<{ x: number; y: number; dragged: boolean; multi: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      press.current = { x: e.clientX, y: e.clientY, dragged: false, multi: false };
    } else if (pointers.current.size === 2) {
      if (press.current) press.current.multi = true;
      controller.gesture(true);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller) return;
    const prev = pointers.current.get(e.pointerId);
    if (!prev) {
      if (e.pointerType === "mouse") controller.hover(e.clientX, e.clientY);
      return;
    }
    const all = [...pointers.current.values()];
    if (all.length >= 2) {
      const [a, b] = all as [{ x: number; y: number }, { x: number; y: number }];
      const before = Math.hypot(a.x - b.x, a.y - b.y);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [c, d] = [...pointers.current.values()] as [
        { x: number; y: number },
        { x: number; y: number },
      ];
      const after = Math.hypot(c.x - d.x, c.y - d.y);
      controller.dragBy((e.clientX - prev.x) / 2, (e.clientY - prev.y) / 2);
      if (before > 0 && after > 0) controller.zoom(after / before);
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const p = press.current;
    if (!p) return;
    if (!p.dragged && Math.hypot(e.clientX - p.x, e.clientY - p.y) >= TAP_SLOP_PX) p.dragged = true;
    if (p.dragged) controller.dragBy(e.clientX - prev.x, e.clientY - prev.y);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const controller = controllerRef.current;
    if (!controller) return;
    pointers.current.delete(e.pointerId);
    const p = press.current;
    if (pointers.current.size === 0) {
      if (p && !p.dragged && !p.multi) {
        controller.tap(e.clientX, e.clientY, e.pointerType === "mouse" ? "mouse" : "touch");
      }
      if (p?.multi) controller.gesture(false);
      press.current = null;
    }
  };

  // The first press or key anywhere on the board is the user gesture the browser needs
  // before an AudioContext can play; a stored "sound on" choice is silent until then.
  const unlockedFor = useRef<FailoverController | null>(null);
  const unlockAudio = () => {
    const controller = controllerRef.current;
    if (!controller || unlockedFor.current === controller) return;
    unlockedFor.current = controller;
    controller.unlockAudio();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Keys typed into the toolbar's select or buttons are theirs.
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    if (controllerRef.current?.key(e.key)) e.preventDefault();
  };

  const controller = hud ? bridge.controller() : null;
  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onPointerDownCapture={unlockAudio}
      onKeyDownCapture={unlockAudio}
      onKeyDown={onKeyDown}
      aria-label={T.board_label}
      className="relative h-[min(72vh,640px)] min-h-[420px] w-full overflow-hidden rounded-xl border border-(--border) bg-[#050505] outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]"
      style={{ overscrollBehavior: "none" }}
    >
      <div
        ref={hostRef}
        className="absolute inset-0 touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onContextMenu={(e) => e.preventDefault()}
      />
      {hud && controller && (
        <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-col items-start gap-1.5">
          <Toolbar hud={hud} controller={controller} />
          <StatusLine hud={hud} controller={controller} />
        </div>
      )}
      {hud?.over && controller && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#050505]/75 text-center text-[#ededed]">
          <p className="font-display text-2xl font-black">{T.run_over}</p>
          <p className="max-w-sm text-sm text-[#a1a1aa]">{OVER_TEXT[hud.over]}</p>
          <p className="font-mono text-sm">{fmt(T.survived, { time: clock(hud.time) })}</p>
          <button
            type="button"
            onClick={() => {
              controller.restart();
              containerRef.current?.focus({ preventScroll: true });
            }}
            className="min-h-11 rounded-lg border border-[#06b6d4] px-5 font-semibold text-[#06b6d4] hover:bg-[#06b6d4]/10"
          >
            {T.play_again}
          </button>
        </div>
      )}
      {hud?.crashed && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#050505]/75 px-4">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-black/90 p-6 text-center text-white shadow-2xl">
            <div className="mb-2 font-mono text-[11px] tracking-widest text-[#06b6d4] uppercase">
              {T.game_error}
            </div>
            <div className="mt-2 text-sm text-white/70">{T.game_error_text}</div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-4 w-full rounded-lg border border-[#06b6d4]/40 bg-[#06b6d4]/10 py-2.5 text-sm font-medium text-[#06b6d4] transition-colors hover:bg-[#06b6d4]/20"
            >
              {T.reload}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
