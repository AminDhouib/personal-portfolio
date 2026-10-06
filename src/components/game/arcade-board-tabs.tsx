"use client";

import type { BoardPeriod } from "@/lib/arcade/boards";

const TABS: readonly { period: BoardPeriod; label: string }[] = [
  { period: "daily", label: "Today" },
  { period: "weekly", label: "This week" },
  { period: "all-time", label: "All time" },
];

// Colours come from the game (props); everything structural is here. Class lists are joined
// with join(" ") rather than string concatenation so the tailwind formatter cannot fuse them.
const BASE_CLASSES =
  "min-h-11 flex-1 rounded-md border px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

interface ArcadeBoardTabsProps {
  period: BoardPeriod;
  onChange: (period: BoardPeriod) => void;
  /** Accessible name of the group, for example "Leaderboard period". */
  label: string;
  activeClassName: string;
  inactiveClassName: string;
  className?: string;
}

/** Today / This week / All time. Controlled: the parent owns the period. */
export function ArcadeBoardTabs({
  period,
  onChange,
  label,
  activeClassName,
  inactiveClassName,
  className,
}: ArcadeBoardTabsProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={["flex gap-1.5", className].filter(Boolean).join(" ")}
    >
      {TABS.map((tab) => {
        const active = tab.period === period;
        return (
          <button
            key={tab.period}
            type="button"
            aria-pressed={active}
            onClick={() => {
              if (!active) onChange(tab.period);
            }}
            className={[BASE_CLASSES, active ? activeClassName : inactiveClassName].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
