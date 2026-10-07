"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type Settings } from "./settings";

export function useSettings() {
  // The game only ever renders in the browser (dynamic, ssr:false), so reading
  // storage in the initializer is safe; the guard keeps a stray server render honest.
  const [settings, setSettings] = useState<Settings>(() =>
    typeof window === "undefined" ? { ...DEFAULT_SETTINGS } : loadSettings(),
  );
  // The object last read or written: a changed object is a change to persist.
  const persistedRef = useRef(settings);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);
  useEffect(() => {
    if (settings === persistedRef.current) return;
    persistedRef.current = settings;
    saveSettings(settings);
  }, [settings]);
  return [settings, update] as const;
}
