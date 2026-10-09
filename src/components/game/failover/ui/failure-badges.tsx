"use client";

import type { Badge } from "../controller";
import { SOFT, badgeText } from "./messages";

/**
 * Short labels floating over the nodes that just failed a request (red, with
 * the reason) or served one worth a second look (amber: slow, a bad answer).
 * Fed from the sim's events by the controller and placed by the camera's
 * projection at the HUD's 4 Hz, so they trail a fast pan by a beat. Decorative
 * for a screen reader: the status bar and the report carry the same facts.
 */
export function FailureBadges({ badges }: { badges: readonly Badge[] }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {badges.map((b) => (
        <span
          key={b.id}
          data-badge={b.key}
          className={`absolute -translate-x-1/2 -translate-y-full rounded px-1.5 py-0.5 font-mono text-[10px] whitespace-nowrap ${
            SOFT.has(b.key) ? "bg-[#f59e0b]/20 text-[#f59e0b]" : "bg-[#ef4444]/20 text-[#ef4444]"
          }`}
          style={{ left: b.x, top: b.y }}
        >
          {badgeText(b.key)}
        </span>
      ))}
    </div>
  );
}
