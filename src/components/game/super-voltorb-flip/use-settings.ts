"use client";
import { useCallback, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./settings";

export function useSettings() {
  // The game only ever renders in the browser (dynamic, ssr:false), so reading
  // storage in the initializer is safe; the guard keeps a stray server render honest.
  const [settings, setSettings] = useState<Settings>(() =>
    typeof window === "undefined" ? { ...DEFAULT_SETTINGS } : loadSettings(),
  );
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);
  return [settings, update] as const;
}
