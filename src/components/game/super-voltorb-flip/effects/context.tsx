"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { EffectTheme } from ".";
import { themes } from ".";

const EffectsCtx = createContext<EffectTheme | null>(null);

export function EffectsProvider({ themeName = "default", children }: { themeName?: string; children: ReactNode }) {
  const [theme, setTheme] = useState<EffectTheme | null>(null);
  useEffect(() => {
    themes[themeName]?.().then(setTheme);
  }, [themeName]);
  if (!theme) return <>{children}</>;
  return <EffectsCtx.Provider value={theme}>{children}</EffectsCtx.Provider>;
}

export function useEffectsTheme(): EffectTheme | null {
  return useContext(EffectsCtx);
}
