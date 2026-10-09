"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FailoverController } from "./failover/controller";
import { loadCoachDone, saveCoachDone } from "./failover/prefs";
import { loadStats, recordRun, saveStats } from "./failover/stats";
import { T } from "./failover/strings";
import { Coach } from "./failover/ui/coach";
import { ConfirmPair } from "./failover/ui/confirm-pair";
import { FailureBadges } from "./failover/ui/failure-badges";
import { StatusBar } from "./failover/ui/hud";
import { Inspector } from "./failover/ui/inspector";
import { alertText } from "./failover/ui/messages";
import { MetricsPanel } from "./failover/ui/metrics-panel";
import { Report } from "./failover/ui/report";
import { SaveMenu } from "./failover/ui/save-menu";
import { Settings } from "./failover/ui/settings";
import { ImportDialog, readArchLink, ShareDialog } from "./failover/ui/share-dialog";
import { TOUCH } from "./failover/ui/surface";
import { Toast } from "./failover/ui/toast";
import { ToolSheet } from "./failover/ui/tool-sheet";
import { Controls, Tools } from "./failover/ui/toolbar";
import { useCoarsePointer } from "./failover/ui/use-coarse-pointer";
import { createHudBridge, useHud } from "./failover/ui/use-hud";
import { usePlaySheet } from "./failover/ui/use-play-sheet";

/**
 * Failover: build a cloud that survives the traffic. The sim, the scene and
 * the controller live in `./failover/`, the HUD pieces in `./failover/ui/`;
 * this entry mounts the canvas, wires pointer and keyboard input to the
 * controller and lays the HUD over the board. It is only ever loaded through
 * the poster's dynamic import.
 */

/** Movement under this many pixels between press and release is a tap, not a drag. */
const TAP_SLOP_PX = 6;

export function FailoverGame() {
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<FailoverController | null>(null);
  const bridge = useMemo(() => createHudBridge(), []);
  const hud = useHud(bridge);
  const coarse = useCoarsePointer();
  const { sheet, toggle: toggleSheet } = usePlaySheet();
  const [best, setBest] = useState(loadStats);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [menu, setMenu] = useState<"save" | "share" | null>(null);
  // A shared ?arch= link opened on the page: described, then built only when asked.
  const [incoming, setIncoming] = useState(readArchLink);
  // A first run (no failover:coach yet) starts paused under the coach.
  const [coaching, setCoaching] = useState(() => !loadCoachDone());
  const startPaused = useRef(coaching);

  useEffect(() => {
    const container = containerRef.current;
    const host = hostRef.current;
    if (!container || !host) return;

    // Each mount gets its own canvas: dispose() forces the WebGL context lost, and a
    // canvas React kept across a StrictMode remount would hand the new renderer a dead one.
    const canvas = document.createElement("canvas");
    canvas.className = "block h-full w-full";
    host.appendChild(canvas);

    const controller = new FailoverController({
      startPaused: startPaused.current,
      // The device record: a survival run's time and score, once per run.
      onRunEnd: (run) => {
        if (run.mode !== "survival") return;
        const next = recordRun(loadStats(), run);
        // A refused write (a newer build's record, blocked storage) leaves the shown best as stored.
        if (saveStats(next)) setBest(next);
      },
    });
    controllerRef.current = controller;
    const rect = host.getBoundingClientRect();
    controller.attach(canvas, rect.width, rect.height);
    controller.setVisible(!document.hidden);
    controller.start();
    bridge.connect(controller);
    container.focus({ preventScroll: true });

    const resize = new ResizeObserver(([entry]) => {
      if (entry) controller.resize(entry.contentRect.width, entry.contentRect.height);
    });
    resize.observe(host);
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
    // Keys typed into the toolbar's buttons and tabs are theirs.
    if (e.target !== e.currentTarget || e.altKey || e.ctrlKey || e.metaKey) return;
    if (controllerRef.current?.key(e.key)) e.preventDefault();
  };

  const finishCoach = useCallback(
    (skipped: boolean) => {
      saveCoachDone(true);
      setCoaching(false);
      // A skip should not leave a new player looking at a stopped clock.
      if (skipped) bridge.controller()?.setPaused(false);
    },
    [bridge],
  );

  const replayCoach = () => {
    const controller = bridge.controller();
    if (!controller) return;
    saveCoachDone(false);
    setSettingsOpen(false);
    controller.restart();
    controller.setPaused(true);
    setCoaching(true);
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
      data-sheet={sheet || undefined}
      className={
        sheet
          ? "fixed inset-0 z-80 h-[100dvh] w-screen overflow-hidden bg-[#050505] pt-[env(safe-area-inset-top)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] outline-none"
          : "relative h-[min(72vh,640px)] min-h-[420px] w-full overflow-hidden rounded-xl border border-(--border) bg-[#050505] outline-none focus-visible:ring-2 focus-visible:ring-[#06b6d4]"
      }
      style={{ overscrollBehavior: "none" }}
    >
      <div className="relative h-full w-full">
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
          <>
            <FailureBadges badges={hud.badges} />
            <ConfirmPair hud={hud} controller={controller} />
            <div className="pointer-events-none absolute inset-x-2 top-2 flex flex-wrap items-start justify-between gap-1.5">
              <div className="flex flex-col items-start gap-1.5">
                <StatusBar hud={hud} />
                <Tools hud={hud} controller={controller} />
                <Toast text={hud.toast ?? (hud.alert ? alertText(hud.alert) : null)} />
                {coaching && !hud.over && <Coach hud={hud} onDone={finishCoach} />}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <Controls
                  hud={hud}
                  controller={controller}
                  metricsOpen={metricsOpen}
                  onToggleMetrics={() => setMetricsOpen((open) => !open)}
                  settingsOpen={settingsOpen}
                  onToggleSettings={() => setSettingsOpen((open) => !open)}
                  fullScreen={coarse || sheet ? sheet : null}
                  onToggleFullScreen={toggleSheet}
                />
                {settingsOpen && (
                  <Settings
                    hud={hud}
                    controller={controller}
                    onReplayCoach={replayCoach}
                    onStartMode={(mode) => {
                      setSettingsOpen(false);
                      controller.restart(undefined, mode);
                    }}
                    onOpenSave={() => {
                      setSettingsOpen(false);
                      setMenu("save");
                    }}
                    onOpenShare={() => {
                      setSettingsOpen(false);
                      setMenu("share");
                    }}
                    onClose={() => setSettingsOpen(false)}
                  />
                )}
                {metricsOpen && <MetricsPanel hud={hud} onClose={() => setMetricsOpen(false)} />}
                {!coarse && <Inspector hud={hud} controller={controller} />}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-x-2 bottom-2 flex flex-col items-center gap-1.5">
              {coarse && <Inspector hud={hud} controller={controller} />}
              <ToolSheet hud={hud} controller={controller} coarse={coarse} />
            </div>
          </>
        )}
        {hud?.over && controller && (
          <Report
            hud={hud}
            best={best}
            onPlayAgain={() => {
              controller.restart();
              containerRef.current?.focus({ preventScroll: true });
            }}
          />
        )}
        {menu === "save" && hud && controller && (
          <SaveMenu hud={hud} controller={controller} onClose={() => setMenu(null)} />
        )}
        {menu === "share" && <ShareDialog onClose={() => setMenu(null)} />}
        {incoming && controller && (
          <ImportDialog
            arch={incoming.arch}
            controller={controller}
            onClose={() => setIncoming(null)}
          />
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
                className={`mt-4 w-full rounded-lg border border-[#06b6d4]/40 bg-[#06b6d4]/10 py-2.5 text-sm font-medium text-[#06b6d4] transition-colors hover:bg-[#06b6d4]/20 ${TOUCH}`}
              >
                {T.reload}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
