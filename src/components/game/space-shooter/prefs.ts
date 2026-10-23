import { loadProfile } from "../profile";
import { safeJsonParse } from "@/lib/safe-json";

// ---------- constants ----------

export const HS_KEY = "space-shooter-hs";
export const NAME_KEY = "space-shooter-name";
export const SOUND_KEY = "space-shooter-sound";

const DEFAULT_SPACE_SHOOTER_PREFS = {
  reducedMotion: false,
  gyroEnabled: false,
  bloomEnabled: true,
  musicEnabled: true,
  sfxEnabled: true,
};

export type SpaceShooterPrefs = typeof DEFAULT_SPACE_SHOOTER_PREFS;

export function loadInitialPrefs(): SpaceShooterPrefs {
  const prefs: SpaceShooterPrefs = { ...DEFAULT_SPACE_SHOOTER_PREFS };

  try {
    const profile = loadProfile();
    if (profile.preferences) {
      return { ...prefs, ...profile.preferences };
    }

    if (typeof window !== "undefined") {
      const raw = window.localStorage.getItem("orbital-dodge-prefs");
      if (raw) {
        const parsed = safeJsonParse<Partial<SpaceShooterPrefs>>(raw, "space-shooter:prefs");
        if (parsed) return { ...prefs, ...parsed };
        return prefs;
      }

      const osReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (osReduced) return { ...prefs, reducedMotion: true };
    }
  } catch {
    // silent-ok: best-effort profile/localStorage read; fall back to default prefs
  }

  return prefs;
}

export function detectGyroSupported() {
  if (typeof window === "undefined") return false;
  const hasOrientation = "DeviceOrientationEvent" in window;
  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  return hasOrientation && isMobile;
}
