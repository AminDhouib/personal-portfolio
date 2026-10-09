import { MonitorOff } from "lucide-react";

/**
 * Stands in for a three.js game (Orbital Dodge unless `game` names another)
 * where the browser has no WebGL (hardware acceleration off, or a blocklisted
 * GPU). The game cannot start without it.
 */
export function NeedsWebGL({ game = "Orbital Dodge" }: { game?: string }) {
  return (
    <div className="flex h-[420px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-(--border) bg-(--card) px-6 text-center">
      <MonitorOff className="h-8 w-8 text-(--muted)" aria-hidden />
      <p className="font-display text-lg font-bold">{game} needs WebGL</p>
      <p className="max-w-sm text-sm text-(--muted)">
        WebGL is off or unavailable in this browser, so the 3D game cannot start. Turn on hardware
        acceleration in your browser settings, or open this page in another browser.
      </p>
    </div>
  );
}
