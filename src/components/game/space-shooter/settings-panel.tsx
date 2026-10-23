import { PanelClose } from "./panel-close";
import { SettingsToggle } from "./settings-toggle";
import type { Dispatch, SetStateAction } from "react";
import type { SpaceShooterPrefs } from "./prefs";

export function SettingsPanel({
  prefs,
  setPrefs,
  setSettingsOpen,
  gyroSupported,
  gyroPermission,
  requestGyroPermission,
}: {
  prefs: SpaceShooterPrefs;
  setPrefs: Dispatch<SetStateAction<SpaceShooterPrefs>>;
  setSettingsOpen: (open: boolean) => void;
  gyroSupported: boolean;
  gyroPermission: "unknown" | "granted" | "denied";
  requestGyroPermission: () => Promise<boolean>;
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/80"
      onClick={() => setSettingsOpen(false)}
    >
      <div
        className="max-w-[90%] min-w-[260px] rounded-lg border border-white/20 bg-slate-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Settings</h3>
          <PanelClose label="Close settings" onClose={() => setSettingsOpen(false)} />
        </div>
        <div className="space-y-3">
          <SettingsToggle
            label="Reduced motion"
            checked={prefs.reducedMotion}
            onChange={(v) => setPrefs((p) => ({ ...p, reducedMotion: v }))}
          />
          <SettingsToggle
            label="Bloom / glow"
            checked={prefs.bloomEnabled}
            onChange={(v) => setPrefs((p) => ({ ...p, bloomEnabled: v }))}
          />
          <SettingsToggle
            label="Music"
            checked={prefs.musicEnabled}
            onChange={(v) => setPrefs((p) => ({ ...p, musicEnabled: v }))}
          />
          <SettingsToggle
            label="SFX"
            checked={prefs.sfxEnabled}
            onChange={(v) => setPrefs((p) => ({ ...p, sfxEnabled: v }))}
          />
          {gyroSupported && (
            <div>
              <SettingsToggle
                label="Gyro controls"
                checked={prefs.gyroEnabled}
                onChange={(v) => {
                  void (async () => {
                    if (v && gyroPermission !== "granted") {
                      const ok = await requestGyroPermission();
                      if (!ok) return;
                    }
                    setPrefs((p) => ({ ...p, gyroEnabled: v }));
                  })();
                }}
              />
              {gyroPermission === "denied" && (
                <div className="mt-1 text-[10px] text-red-400">
                  Permission denied. Enable motion access in iOS Settings.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
