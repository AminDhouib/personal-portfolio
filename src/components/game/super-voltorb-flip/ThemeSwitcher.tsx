"use client";

import type { ThemeId } from "./types";
import { THEMES, THEME_ORDER } from "./theme";

export function ThemeSwitcher({
  unlocked,
  active,
  totalCoins,
  onSelect,
}: {
  unlocked: Set<ThemeId>;
  active: ThemeId;
  totalCoins: number;
  onSelect: (id: ThemeId) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap mt-3">
      {THEME_ORDER.map((id) => {
        const t = THEMES[id];
        const isUnlocked = unlocked.has(id);
        const affordable = totalCoins >= t.cost;
        const isActive = active === id;
        const disabled = !isUnlocked && !affordable;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (isUnlocked) {
                onSelect(id);
              } else if (affordable) {
                if (typeof window !== "undefined" && window.confirm(`Unlock ${t.name} for ${t.cost} coins?`)) {
                  onSelect(id);
                }
              }
            }}
            className="px-3 py-2 rounded border text-xs flex flex-col items-start gap-1 transition"
            style={{
              borderColor: isActive ? "#a855f7" : undefined,
              background: isActive ? "rgba(168,85,247,0.12)" : "transparent",
              opacity: disabled ? 0.4 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
            disabled={disabled}
            title={t.description}
          >
            <div className="font-semibold">{t.name}</div>
            <div className="opacity-70">
              {isUnlocked ? (isActive ? "Active" : "Owned") : `${t.cost}c`}
            </div>
          </button>
        );
      })}
    </div>
  );
}
