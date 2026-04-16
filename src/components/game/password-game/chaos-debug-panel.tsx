"use client";

import { useEffect, useState } from "react";
import { Settings2, X, RefreshCcw } from "lucide-react";

/**
 * Chaos FX debug panel. Appears only when URL has `?debug=chaos` or when
 * Shift+D is pressed. Lets us toggle each chaos effect and tune intensity
 * while visually iterating.
 *
 * Effect flags are exposed as CSS custom properties on the .pg-chaos-root
 * element. Each effect rule in destruction.css multiplies its baseline by
 * the flag (0 = off, 1 = full). Intensity sliders scale the flag 0..2.
 */

type FxKey =
  | "chips"
  | "burn"
  | "scanlines"
  | "debris"
  | "glitch"
  | "chromatic"
  | "scramble"
  | "heartbeat"
  | "cursortrail"
  | "vhs"
  | "noiseburst"
  | "ghosttext"
  | "flickerout";

const ALL_FX: { key: FxKey; label: string }[] = [
  { key: "chips", label: "Broken chips" },
  { key: "burn", label: "Edge burns" },
  { key: "scanlines", label: "Scanlines" },
  { key: "debris", label: "Floating debris" },
  { key: "glitch", label: "Glitch slice bands" },
  { key: "chromatic", label: "Chromatic aberration" },
  { key: "scramble", label: "Text scramble" },
  { key: "heartbeat", label: "Heartbeat pulse" },
  { key: "cursortrail", label: "Cursor trail" },
  { key: "vhs", label: "VHS tracking bars" },
  { key: "noiseburst", label: "Pixel noise bursts" },
  { key: "ghosttext", label: "Ghost text echo" },
  { key: "flickerout", label: "Card flicker-out" },
];

function applyToRoot(fx: Record<FxKey, number>, chaosOverride: number | null) {
  const root = document.querySelector<HTMLElement>(".pg-chaos-root");
  if (!root) return;
  for (const { key } of ALL_FX) {
    root.style.setProperty(`--fx-${key}`, String(fx[key]));
  }
  if (chaosOverride !== null) {
    root.setAttribute("data-chaos", String(chaosOverride));
    root.setAttribute("data-chaos-override", "1");
  } else {
    root.removeAttribute("data-chaos-override");
  }
}

const DEFAULT_FX: Record<FxKey, number> = Object.fromEntries(
  ALL_FX.map((f) => [f.key, 1])
) as Record<FxKey, number>;

export function ChaosDebugPanel() {
  const [visible, setVisible] = useState(false);
  const [fx, setFx] = useState<Record<FxKey, number>>(DEFAULT_FX);
  const [chaosOverride, setChaosOverride] = useState<number | null>(null);

  useEffect(() => {
    // Show if URL has ?debug=chaos
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "chaos") setVisible(true);
    // Keyboard shortcut: Shift+D to toggle
    const onKey = (e: KeyboardEvent) => {
      if (e.shiftKey && (e.key === "D" || e.key === "d")) {
        // Only activate if no input is focused
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === "TEXTAREA" || active.tagName === "INPUT")) return;
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!visible) return;
    applyToRoot(fx, chaosOverride);
  }, [fx, chaosOverride, visible]);

  // When hiding, clear overrides so the game's chaos level governs again.
  useEffect(() => {
    if (visible) return;
    const root = document.querySelector<HTMLElement>(".pg-chaos-root");
    if (!root) return;
    for (const { key } of ALL_FX) {
      root.style.removeProperty(`--fx-${key}`);
    }
    root.removeAttribute("data-chaos-override");
  }, [visible]);

  if (!visible) return null;

  const resetAll = () => {
    setFx(DEFAULT_FX);
    setChaosOverride(null);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] w-72 rounded-lg border border-(--border) bg-(--card) shadow-2xl font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-(--border)">
        <div className="flex items-center gap-2">
          <Settings2 className="h-3.5 w-3.5 text-accent-pink" />
          <span className="font-semibold">Chaos FX</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={resetAll}
            className="p-1 text-(--muted) hover:text-(--foreground)"
            title="Reset all"
            type="button"
          >
            <RefreshCcw className="h-3 w-3" />
          </button>
          <button
            onClick={() => setVisible(false)}
            className="p-1 text-(--muted) hover:text-(--foreground)"
            title="Close (Shift+D)"
            type="button"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label>Chaos override</label>
            <span className="font-mono text-accent-pink">
              {chaosOverride === null ? "auto" : chaosOverride}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {[null, 0, 1, 2, 3, 4, 5].map((v) => (
              <button
                key={v === null ? "auto" : v}
                onClick={() => setChaosOverride(v)}
                className={`flex-1 rounded px-1 py-0.5 text-xs border ${
                  chaosOverride === v
                    ? "border-accent-pink/60 bg-accent-pink/10 text-accent-pink"
                    : "border-(--border) text-(--muted) hover:text-(--foreground)"
                }`}
                type="button"
              >
                {v === null ? "·" : v}
              </button>
            ))}
          </div>
        </div>

        <div className="border-t border-(--border) pt-2 space-y-1.5">
          {ALL_FX.map(({ key, label }) => (
            <div key={key} className="flex items-center gap-2">
              <label className="flex-1 truncate" title={label}>{label}</label>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={fx[key]}
                onChange={(e) => setFx({ ...fx, [key]: Number(e.target.value) })}
                className="w-20 accent-accent-pink"
              />
              <span className="w-8 text-right font-mono text-accent-pink">
                {fx[key].toFixed(1)}
              </span>
            </div>
          ))}
        </div>

        <div className="border-t border-(--border) pt-2 text-[10px] text-(--muted)">
          Shortcut: Shift+D · URL: ?debug=chaos
        </div>
      </div>
    </div>
  );
}
