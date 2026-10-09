"use client";

import type { ReactNode } from "react";
import {
  Activity,
  Eye,
  Link2,
  Maximize2,
  Minimize2,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type { FailoverController, HudState, Speed } from "../controller";
import { T, fmt } from "../strings";
import { BUTTON, BUTTON_IDLE, BUTTON_ON } from "./surface";

export function ToolButton({
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
      className={`${BUTTON} ${pressed ? BUTTON_ON : BUTTON_IDLE}`}
    >
      {children}
    </button>
  );
}

/** Select, Link and Demolish (keys 1, 2, 3). A finger's Confirm and Cancel sit by the ghost (confirm-pair.tsx). */
export function Tools({ hud, controller }: { hud: HudState; controller: FailoverController }) {
  const tool = hud.tool;
  return (
    <div
      role="group"
      aria-label={T.tools}
      className="pointer-events-auto flex flex-wrap items-center gap-1.5"
    >
      <ToolButton
        label={`${T.select} (1)`}
        pressed={tool.kind === "select"}
        onClick={() => controller.setTool({ kind: "select" })}
      >
        <MousePointer2 className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton
        label={`${T.link} (2)`}
        pressed={tool.kind === "link"}
        onClick={() => controller.setTool({ kind: "link" })}
      >
        <Link2 className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton
        label={`${T.demolish} (3)`}
        pressed={tool.kind === "demolish"}
        onClick={() => controller.setTool({ kind: "demolish" })}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </ToolButton>
    </div>
  );
}

/**
 * Pause and the three speeds, the camera turns and view, the metrics panel,
 * Settings, and on a phone the way in and out of the full-screen layer
 * (fullScreen is null where it is not offered).
 */
export function Controls({
  hud,
  controller,
  metricsOpen,
  onToggleMetrics,
  settingsOpen,
  onToggleSettings,
  fullScreen,
  onToggleFullScreen,
}: {
  hud: HudState;
  controller: FailoverController;
  metricsOpen: boolean;
  onToggleMetrics: () => void;
  settingsOpen: boolean;
  onToggleSettings: () => void;
  fullScreen: boolean | null;
  onToggleFullScreen: () => void;
}) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-1.5">
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
      <ToolButton label={T.metrics} pressed={metricsOpen} onClick={onToggleMetrics}>
        <Activity className="h-4 w-4" aria-hidden />
      </ToolButton>
      <ToolButton label={T.settings} pressed={settingsOpen} onClick={onToggleSettings}>
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
      </ToolButton>
      {fullScreen !== null && (
        <ToolButton
          label={fullScreen ? T.exit_full_screen : T.full_screen}
          onClick={onToggleFullScreen}
        >
          {fullScreen ? (
            <Minimize2 className="h-4 w-4" aria-hidden />
          ) : (
            <Maximize2 className="h-4 w-4" aria-hidden />
          )}
        </ToolButton>
      )}
    </div>
  );
}
