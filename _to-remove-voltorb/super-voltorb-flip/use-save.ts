"use client";

import { useCallback, useEffect, useState } from "react";
import { INITIAL_STATS, type PersistedSave, type ThemeId } from "./types";

const SAVE_KEY = "super-voltorb-flip-save-v1";

const DEFAULT_SAVE: PersistedSave = {
  mode: null,
  totalCoins: 0,
  unlockedThemes: ["classic"],
  activeTheme: "classic",
  autoMemoEnabled: false,
  speedMode: false,
  musicVolume: 0.5,
  sfxVolume: 0.7,
  stats: { ...INITIAL_STATS },
};

export function loadSave(): PersistedSave {
  if (typeof window === "undefined") return { ...DEFAULT_SAVE };
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_SAVE };
    const parsed = JSON.parse(raw) as Partial<PersistedSave>;
    return {
      ...DEFAULT_SAVE,
      ...parsed,
      stats: { ...INITIAL_STATS, ...(parsed.stats ?? {}) },
      unlockedThemes: Array.from(
        new Set([...(parsed.unlockedThemes ?? []), "classic"]),
      ) as ThemeId[],
    };
  } catch {
    return { ...DEFAULT_SAVE };
  }
}

export function writeSave(save: PersistedSave): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // ignore quota errors
  }
}

export function useSave(): [PersistedSave, (update: Partial<PersistedSave>) => void] {
  const [save, setSave] = useState<PersistedSave>(DEFAULT_SAVE);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  const update = useCallback((patch: Partial<PersistedSave>) => {
    setSave((prev) => {
      const next = { ...prev, ...patch };
      writeSave(next);
      return next;
    });
  }, []);

  return [save, update];
}
